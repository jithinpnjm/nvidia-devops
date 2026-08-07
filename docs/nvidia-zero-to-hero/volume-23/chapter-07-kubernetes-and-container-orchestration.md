# Chapter 7: Kubernetes and Container Orchestration

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Intermediate |
| Estimated reading time | 65 minutes |
| Primary audience | DevOps engineers, platform teams |
| Core question | How do you schedule and manage GPU workloads at scale? What are the isolation, fairness, and efficiency trade-offs? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Explain Kubernetes GPU scheduling (resource requests, device plugins)
- Design multi-tenant GPU clusters with resource fairness
- Handle pod disruption and graceful preemption
- Optimize cluster cost through bin-packing and scaling policies
- Diagnose scheduling bottlenecks
- Design SLOs for managed clusters

## Kubernetes GPU Scheduling

### GPU Resource Model

Kubernetes treats GPUs as a countable resource, similar to CPU and memory.

**GPU request/limit pattern:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: training-job
spec:
  containers:
  - name: training
    image: nvidia-training:latest
    resources:
      requests:
        nvidia.com/gpu: 1  # Minimum GPUs needed
        memory: "8Gi"
        cpu: "4"
      limits:
        nvidia.com/gpu: 1  # Max GPUs usable
        memory: "16Gi"
        cpu: "8"
```

**Scheduler flow:**

1. Pod submitted with GPU request (nvidia.com/gpu: 1)
2. Scheduler checks all nodes for availability
3. Binpacking: Assigns to node with least fragmentation
4. Device plugin allocates specific GPU (e.g., GPU 0 on node-3)
5. Pod starts with NVIDIA_VISIBLE_DEVICES=0 set

**Common issues:**

| Issue | Cause | Fix |
|---|---|---|
| Pod pending (unschedulable) | No nodes have GPU | Scale cluster, reduce request |
| Pod scheduled but hangs | Device plugin not running | Reinstall nvidia-device-plugin |
| Wrong GPU assigned | Device plugin scheduling bug | Restart plugin, check logs |
| Multiple pods on same GPU | Device plugin allows it (time-slicing) | Disable time-slicing if isolation needed |

## Interview Questions

### Question 1: Multi-Tenant GPU Cluster Design

**Scenario:** "You operate a Kubernetes cluster with 32 GPUs across 4 nodes (8 GPUs per node). You support 3 teams: research (high priority, strict SLA), data engineers (medium priority, batch jobs), and interns (low priority, learning). How do you allocate resources fairly while maximizing utilization?"

**Model Answer (4 minutes):**

"This is a multi-dimensional optimization: fairness, utilization, SLA compliance.

**Resource allocation strategy:**

I'd use Kubernetes namespaces + resource quotas + priority classes:

```yaml
# Namespace for each team
apiVersion: v1
kind: Namespace
metadata:
  name: research
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: research-quota
  namespace: research
spec:
  hard:
    nvidia.com/gpu: "16"  # 50% of cluster (16/32)
    memory: "64Gi"
    pods: "20"
---
apiVersion: v1
kind: Namespace
metadata:
  name: data-eng
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: data-eng-quota
  namespace: data-eng
spec:
  hard:
    nvidia.com/gpu: "12"  # 37.5% of cluster
    memory: "48Gi"
    pods: "15"
---
apiVersion: v1
kind: Namespace
metadata:
  name: interns
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: intern-quota
  namespace: interns
spec:
  hard:
    nvidia.com/gpu: "4"   # 12.5% of cluster
    memory: "16Gi"
    pods: "10"
```

**Priority classes for preemption:**

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: research-high
value: 1000
globalDefault: false
description: "Research team high priority"
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: data-eng-med
value: 500
globalDefault: false
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: intern-low
value: 100
globalDefault: false
```

**Pod spec example (research job with preemption tolerance):**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: model-training
  namespace: research
spec:
  priorityClassName: research-high
  terminationGracePeriodSeconds: 30  # Graceful shutdown
  containers:
  - name: training
    image: training:latest
    resources:
      requests:
        nvidia.com/gpu: 2
        memory: "8Gi"
```

**Fairness and preemption:**

- Research can preempt data-eng, both can preempt interns
- If cluster is full:
  1. Intern jobs killed first (freed GPUs)
  2. Then data-eng jobs (if needed)
  3. Research jobs never preempted (critical SLA)

**Utilization strategy:**

- Research: Target 80% utilization (strict SLA, some headroom)
- Data-eng: Target 70% utilization (flexible timing)
- Interns: Fill remaining capacity (opportunistic)

If utilization drops below 70% cluster-wide, scale down nodes.

**Monitoring:**

```yaml
Metrics:
- gpu_usage_per_namespace
- gpu_allocation_percent
- preemption_count_per_day
- pod_pending_seconds_p99
```

Alert if:
- Any namespace exceeds quota → reject new pods
- Preemption > 5 per day → indicates contention
- Pod pending > 5 minutes → indicates scheduling issue"

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Namespaces separate tenants | Isolation, resource accounting |
| Resource quotas enforce limits | Prevent one team from starving others |
| Priority classes enable preemption | High-priority work gets GPU when needed |
| Graceful termination | Allows jobs to checkpoint before being killed |
| Fairness metrics | Must measure to prove fairness |

**Follow-up Trap:** "Why not just give each team a node?"

**Corrective answer:** "Wastes GPUs. If research team only uses 50% of their node's GPUs, the rest are idle. With shared quotas, they can exceed 50% when available. Total utilization jumps from 60% to 85%."

**Verification Point:** Can the candidate design a fair resource allocation system with quotas and preemption?

---

### Question 2: Pod Disruption and Graceful Shutdown

**Scenario:** "A training job is running on a GPU and hits SIGTERM (from Kubernetes preemption). It has 30 seconds to shut down. What should it do to minimize loss? What do you check to ensure graceful shutdown?"

**Model Answer (2.5 minutes):**

"Graceful shutdown in Kubernetes requires planning:

**What the app should do (30-second window):**

```python
# Training script with signal handling
import signal
import os

checkpoint_saved = False

def handle_sigterm(sig, frame):
    global checkpoint_saved
    print('SIGTERM received, checkpointing...')
    
    # Save model weights and optimizer state
    torch.save({
        'model': model.state_dict(),
        'optimizer': optimizer.state_dict(),
        'epoch': epoch,
        'step': step,
        'loss': loss
    }, 'checkpoint_latest.pt')
    
    # Save to persistent storage (PVC)
    os.system('gsutil -m cp checkpoint_latest.pt gs://model-checkpoints/')
    
    checkpoint_saved = True
    exit(0)  # Exit gracefully

signal.signal(signal.SIGTERM, handle_sigterm)

# Training loop
for epoch in range(100):
    for batch in dataloader:
        # ... training ...
        
        # Save checkpoint periodically
        if step % 100 == 0:
            torch.save(..., f'checkpoint_{step}.pt')
```

**Kubernetes configuration:**

```yaml
spec:
  terminationGracePeriodSeconds: 30  # Give 30 sec to shut down
  containers:
  - name: training
    resources:
      requests:
        nvidia.com/gpu: 1
    lifecycle:
      preStop:
        exec:
          command: ["bash", "-c", "wait $!"]  # Wait for handler
```

**What happens:**

1. T=0: Kubernetes sends SIGTERM to container
2. T=0-30: App saves checkpoint (typically 1-5 sec)
3. T=30: If not exited, Kubernetes sends SIGKILL (force kill)
4. T=31: Container is gone, GPU freed

**How to verify graceful shutdown works:**

```bash
# Test preemption locally
docker run -d --gpus 1 training:latest
PID=$(docker inspect --format '{{ .State.Pid }}' <container>)
kill -TERM $PID

# Check:
# - Did checkpoint save? (should see file in storage)
# - Did process exit within 30 sec?
# - Was training recoverable from checkpoint?
```

**Failure modes:**

| Failure | Consequence | Prevention |
|---|---|---|
| No checkpoint saved | Lose 30 minutes training | Add signal handler + periodic saves |
| Checkpoint too slow | Killed before save completes | Checkpoint to memory first, async write |
| Checkpoint corrupted | Can't resume | Atomic writes (write to temp, rename) |
| No termination handler | Job crashes | Set terminationGracePeriod |

**Production best practice:**

```python
# Robust checkpointing
def save_checkpoint(model, optimizer, step):
    # Write to temp file first
    tmp_path = 'checkpoint_tmp.pt'
    torch.save({...}, tmp_path)
    
    # Atomic rename
    os.rename(tmp_path, f'checkpoint_{step}.pt')
    
    # Also save to cold storage (asynchronous)
    threading.Thread(target=lambda: 
        os.system(f'gsutil cp checkpoint_{step}.pt gs://backup/')
    ).start()
```

This way, even if async upload fails, local checkpoint is safe."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Signal handling is critical | SIGTERM gives you a chance to save state |
| Checkpoint latency | Must complete before 30-second window |
| Atomic writes prevent corruption | Don't overwrite while writing |
| Async backup ensures durability | Data not lost even if node crashes |

**Follow-up Trap:** "Can't I just disable preemption?"

**Corrective answer:** "Not for shared clusters. Low-priority jobs must be preemptible to make room for high-priority work. If you disable preemption, cluster utilization drops and cost goes up."

**Verification Point:** Can the candidate design graceful shutdown mechanisms and validate them?

---

### Question 3: Scaling GPU Clusters Dynamically

**Scenario:** "Your cluster usage is bursty. 9 AM: 10 pending pods (need 5 more GPUs). 5 PM: all pods done, cluster idle. You want to minimize cost while maintaining SLA. How do you size the cluster and set up autoscaling?"

**Model Answer (3 minutes):**

"This is a classic autoscaling problem. I need to balance:
- Cost (unused GPUs cost money)
- SLA (pending pods delay jobs)
- Stability (too aggressive scaling = thrashing)

**Sizing strategy:**

1. **Analyze workload pattern:**
   ```
   Peak demand: 32 GPUs at 10 AM
   Trough: 2 GPUs at 5 PM (long-running jobs)
   Average: 15 GPUs
   ```

2. **Calculate cluster size:**
   - Base (trough): 2 GPUs (1 node with 8 GPUs, scaled down)
   - Max (peak): 32 GPUs (4 nodes)
   - Budget: $500/month per node
   - Cost at peak: 4 × $500 = $2,000/month
   - Cost at trough: 0.5 × $500 = $250/month

3. **Autoscaling policy:**

```yaml
apiVersion: autoscaling.gke.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: gpu-autoscaler
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: Deployment
    name: gpu-pool
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: "*"
      minAllowed:
        nvidia.com/gpu: 2
      maxAllowed:
        nvidia.com/gpu: 32
      controlledValues: ["RequestsOnly"]
  
  # Scale down aggressively (save cost)
  minNodeCount: 1
  maxNodeCount: 4
  scaleDownUtilizationThreshold: 0.4  # Scale down if < 40% used
  scaleDownUnreadyTime: 10m
  scaleDownUnneededTime: 5m  # Wait 5 min before scaling
  
  # Scale up conservatively (maintain SLA)
  scaleUpUtilizationThreshold: 0.8
  maxTotalUnreadyPercentage: 10%  # Max 10% nodes unready
```

**How it works:**

```
10 AM: Pod submitted requesting 5 GPUs
      Current: 2 GPUs in use, 30 GPUs free (overprovisioned)
      → Autoscaler: No scale-up needed, CPU is sufficient
      → Pod starts immediately (SLA met)

11 AM: 32 GPUs requested (cluster full)
      Current: 32/32 GPUs in use, 8 pending pods
      → Autoscaler: Detected utilization = 100%
      → Scale up: Add new node (8 more GPUs)
      → Pending pods schedule (SLA met)

5 PM: All jobs done
      Current: 2/40 GPUs in use
      → Autoscaler: Detected utilization = 5%
      → Wait 5 minutes (scale-down-unnecessary-time)
      → Scale down: Remove idle nodes
      → Cluster now 1 node (8 GPUs)
```

**Cost projection (monthly):**

```
Peak hours (9-11 AM): 2 hours × 22 days = 44 hours at 4 nodes
            = 44 × 4 × $500 ÷ 730 = $120/month

Off-peak (12 PM - 4:59 PM): 5 hours × 22 days = 110 hours at 1 node
            = 110 × 1 × $500 ÷ 730 = $75/month

Night/weekend: remaining hours at 1 node = 730 - 44 - 110 = 576 hours
            = 576 × 1 × $500 ÷ 730 = $394/month

Total: $120 + $75 + $394 = $589/month (vs $2,000 fixed, $250 minimum)
```

**SLA verification:**

Monitor pod scheduling latency:

```yaml
Alert Rules:
- pending_pod_p99_latency > 5 min → Autoscaler too slow
- gpu_utilization < 50% for 1 hour → Wasted capacity
```

If SLA is missed, increase maxTotalUnreadyPercentage or pre-provision extra nodes."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Utilization thresholds drive scaling | 40% threshold = aggressive scale-down |
| Grace periods prevent thrashing | Don't scale up/down on every spike |
| SLA vs. cost trade-off | Higher SLA target = more provisioned capacity |
| Workload characterization | Peak patterns determine max cluster size |

**Follow-up Trap:** "Why not just buy enough GPUs for peak demand?"

**Corrective answer:** "Peak demand is 32 GPUs for 2 hours/day = 1.5% utilization. That's wasteful. Autoscaling lets us scale down to 2 GPUs at night (90% cost savings during off-peak). Total cost is 5× lower."

**Verification Point:** Can the candidate design autoscaling policies and estimate cost trade-offs?

## Related Chapters

- **Chapter 6:** [GPU Sharing and Virtualization](./chapter-06-gpu-sharing-and-virtualization.md) — time-slicing and MIG
- **Chapter 9:** [Cluster Operations](./chapter-09-cluster-operations-and-capacity-planning.md) — long-term capacity planning
- **Volume 21:** AI Factory (reference architectures)

