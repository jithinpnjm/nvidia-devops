---
title: Incident Response, Alerts & Reliability Masterclass
slug: /volume-07/incident-response-alerts-masterclass
sidebar_position: 3
description: A comprehensive masterclass on alert design, incident workflows, and game days for NVIDIA AI Factories.
---

# Incident Response, Alerts & Reliability Masterclass

## 1. Introduction: The Cost of Silence

In an NVIDIA AI Factory, silence is not golden; silence is terrifying. When you have thousands of H100 GPUs orchestrated for a single distributed training workload, every minute of downtime costs thousands of dollars in pure compute, not to mention the opportunity cost of delayed model convergence.

### 1.1 The Production Story: The Cascade of Doom

*Illustrative composite scenario, not a documented incident.*

It was 2:00 AM on a Friday. The cluster had been stable for weeks running a 175B parameter language model training job. Suddenly, a single Top-of-Rack (ToR) switch connecting an InfiniBand spine encountered a thermal threshold event and throttled its throughput.

The monitoring system caught the thermal event, but it was classified as `Severity: Warning`. No one was paged.

Five minutes later, NCCL (NVIDIA Collective Communications Library) operations began to stall due to the unexpected latency on that specific InfiniBand subnet. The PyTorch DDP processes waited.
Ten minutes later, the waiting processes triggered a GPU heartbeat timeout in the orchestration layer. Kubernetes decided the pods were unhealthy and evicted them.
Suddenly, 64 nodes (512 GPUs) were rescheduled simultaneously. The sudden spike in image pulls and volume attachments hammered the control plane and the storage backend.
By 2:30 AM, the entire cluster was in a crashloop backoff state, the storage array was saturated, and the on-call engineer was drowning in 15,000 distinct alerts.

**The Lesson:** The initial failure was a minor thermal throttle. The *incident* was a failure in alert design, incident workflow, and automated mitigation.

### 1.2 Learning Objectives
By the end of this masterclass, you will be able to:
- Design high-signal, low-noise PromQL alerts for GPU systems.
- Configure Alertmanager for intelligent grouping, deduplication, and routing.
- Execute an evidence-based incident workflow.
- Mitigate complex GPU workload failures (OOM, slow execution, pending pods).
- Conduct blameless postmortems and incident communication.
- Design and implement Game Days using Chaos Mesh.

---

## 2. Alert Design for Expensive GPU Systems

Alerting in a GPU environment requires a paradigm shift. We do not care if CPU usage on a management node is 90%. We care deeply if GPU utilization or SM activity drops well below the job's known-good baseline during a training run.

### 2.1 The Philosophy of Alerting

Every alert that reaches a human must meet three criteria:
1. **Actionable:** The engineer must know exactly what to do (runbook attached).
2. **Urgent:** The issue requires immediate human intervention to prevent data loss or significant financial cost.
3. **Symptom-Based:** We alert on user-visible symptoms (e.g., Job stalled), not raw causes (e.g., Switch dropped 5 packets).

### 2.2 PromQL Alert Rules: From Beginner to Advanced

Let's start with a basic alert and iterate it to production quality.

#### Beginner: GPU Temperature High
```yaml
groups:
- name: gpu-alerts
  rules:
  - alert: GPUTemperatureHigh
    expr: DCGM_FI_DEV_GPU_TEMP > 85
    for: 1m
    labels:
      severity: warning
    annotations:
      summary: "GPU {{ $labels.gpu }} on {{ $labels.instance }} is hot."
```
*Problem:* This alerts on a single spike. Modern GPUs thermally throttle to protect themselves. A brief spike to 86C is normal during heavy GEMM operations.

#### Advanced: Sustained Thermal Throttling
```yaml
groups:
- name: gpu-advanced-alerts
  rules:
  - alert: GPUSustainedThermalThrottle
    # DCGM_FI_DEV_THERMAL_VIOLATION is a cumulative counter of time spent throttled
    # for thermal reasons (it is an optional field: enable it in the dcgm-exporter metrics file).
    # A positive rate sustained over 5 minutes means the GPU is actively thermally throttling.
    expr: >
      rate(DCGM_FI_DEV_THERMAL_VIOLATION[5m]) > 0
      and
      DCGM_FI_DEV_GPU_TEMP > 85
    for: 5m
    labels:
      severity: critical
      tier: hardware
    annotations:
      summary: "Node {{ $labels.instance }} GPU {{ $labels.gpu }} is sustained throttling."
      description: "GPU has been throttling for over 5 minutes. Check cooling."
      runbook_url: "https://wiki.internal/runbooks/gpu-thermal"
```

#### Senior Architect Level: Job Efficiency Drop
The most critical alert in an AI Factory.

```yaml
groups:
- name: ai-factory-workloads
  rules:
  - alert: DistributedTrainingEfficiencyDrop
    # DCGM_FI_PROF_SM_ACTIVE is already a ratio (a gauge), so average it over time rather
    # than using rate(). dcgm-exporter labels series with pod and namespace; map pods to a
    # job with a join on kube_pod_labels if you need job-level grouping.
    # The 0.70 threshold is illustrative: baseline your own job first.
    expr: >
      avg by (namespace, pod) (
        avg_over_time(DCGM_FI_PROF_SM_ACTIVE[10m])
      ) < 0.70
    for: 10m
    labels:
      severity: critical
      team: ml-platform
    annotations:
      summary: "Pod {{ $labels.pod }} SM efficiency dropped below 70%."
      description: "Investigate dataloader bottlenecks, network congestion, or straggler nodes."
      dashboard_url: "https://grafana.internal/d/training-job?var-pod={{ $labels.pod }}"
```

### 2.3 Alertmanager Configuration & Routing

When the cascade happens, Alertmanager is your shield.

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'cluster', 'namespace']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'default-receiver'
  
  routes:
    # 1. Hardware Failures route to Infrastructure Team
    - matchers:
        - tier="hardware"
      receiver: infra-pager
      continue: false
      
    # 2. ML Workload issues route to ML Platform
    - matchers:
        - team="ml-platform"
      receiver: ml-pager
      continue: false
      
    # 3. Mute known maintenance windows
    - matchers:
        - maintenance="true"
      receiver: blackhole
      
receivers:
  - name: 'default-receiver'
    slack_configs:
      - channel: '#alerts-general'
  - name: 'infra-pager'
    pagerduty_configs:
      - service_key: '<secret>'
  - name: 'ml-pager'
    pagerduty_configs:
      - service_key: '<secret>'
  - name: 'blackhole'

inhibit_rules:
  # If a node is completely down, do not alert on its individual GPUs
  - source_matchers:
      - alertname="NodeDown"
    target_matchers:
      - tier="hardware"
    equal: ['instance']
```
*Explanation:* The `inhibit_rules` are critical. If `NodeDown` fires, it suppresses all `GPUTemperatureHigh` or `NVLinkError` alerts for that exact `instance`. This prevents alert storms.

---

## 3. Incident Workflows & The Evidence Tree

An incident workflow must be deterministic. Panic is the enemy of uptime.

### 3.1 The Decision Tree (Mermaid)

:::tip Deterministic Incident Workflow
An incident workflow must be deterministic. Follow this decision tree carefully to prevent panic and minimize downtime.
:::

```mermaid
flowchart TD
    A["Alert Received"] --> B{"Is it a User-Facing Outage?"}
    B -- "Yes" --- C["Declare Sev-1 / Sev-2"]
    B -- "No" --- D["Investigate Silently Sev-3"]
    
    C --> E["Assign Roles: IC, Scribe, SME"]
    E --> F{"Gather Evidence Tree"}
    D --> F
    
    F --> G["Check Dashboards: Global Health"]
    F --> H["Check Logs: K8s Events"]
    F --> I["Check Metrics: DCGM, NCCL, IB"]
    
    G & H & I --> J{"Root Cause Identified?"}
    
    J -- "No" --- K["Consult Runbook / Escalate"]
    K --> F
    
    J -- "Yes" --- L["Propose Mitigation"]
    L --> M{"Is Mitigation Safe?"}
    
    M -- "No" --- N["Review Blast Radius"]
    N --> L
    
    M -- "Yes" --- O["Execute Mitigation"]
    O --> P{"Did Symptoms Resolve?"}
    
    P -- "No" --- F
    P -- "Yes" --- Q["Monitor for 15 mins"]
    Q --> R["Resolve Incident"]
    R --> S["Postmortem Scheduling"]
```

### 3.2 Safe Mitigation Principles

:::warning Always Minimize Blast Radius
Do not perform actions that could unintentionally widen the incident. Cordon resources rather than destroying them completely, and prefer runtime configuration changes over invasive deployments.
:::

1. **Cordon, Don't Delete:** Never immediately delete a misbehaving pod or drain a node unless necessary. Cordon the node (`kubectl cordon <node>`) to prevent new workloads, then capture memory dumps or kernel logs.
2. **Feature Flags over Code Deploys:** Use runtime configuration (e.g., disabling a specific NCCL algorithm via environment variable) rather than rebuilding containers.
3. **Scale Out, Not Up:** If a service is overwhelmed, horizontally scale it temporarily to buy time for investigation.

---

## 4. Incident Playbooks: GPU Workloads Failing

This section covers the most common and complex GPU workload failures.

### 4.1 Playbook: Pending Pods (Insufficient GPUs)

**Symptom:** Kubernetes pods requesting `nvidia.com/gpu` remain in `Pending` state.
**Evidence Gathering:**
```bash
# 1. Check pod events
kubectl describe pod <pod-name> -n <namespace>

# 2. Check total GPU capacity vs requests in the cluster
kubectl get nodes -o custom-columns="NAME:.metadata.name,GPU_ALLOCATABLE:.status.allocatable.nvidia\.com/gpu"

# 3. Check NVIDIA Device Plugin daemonset
kubectl get ds -n gpu-operator
kubectl logs -n gpu-operator -l app=nvidia-device-plugin-daemonset
```

**Common Causes & Resolution:**
- **Resource Fragmentation:** GPUs are locked by other workloads. *Resolution:* Implement queueing systems (Kueue, Volcano) to gang-schedule distributed workloads.
- **Device Plugin Failure:** The `nvidia-device-plugin` cannot talk to NVML. *Resolution:* Check container runtime configurations (`/etc/docker/daemon.json` or containerd config) to ensure the `nvidia` runtime is set as default.

### 4.2 Playbook: CrashLoopBackOff & OOM (Out of Memory)

**Symptom:** Pods constantly restarting.
**Evidence Gathering:**
```bash
# Get previous crash logs
kubectl logs <pod-name> -p

# Check for Host OOM kills (dmesg)
dmesg -T | grep -i oom
```

**Understanding GPU OOM vs CPU OOM:**
- **CPU OOM:** Kubernetes kills the pod (Exit Code 137). You will see `OOMKilled` in pod status.
- **GPU OOM (CUDA Out of Memory):** The application crashes (Exit Code 1), but the Pod status will just show `Error`. The log will show `CUDA out of memory`.

**Resolution:**
- **For CPU OOM:** Increase `resources.limits.memory` in the pod spec.
- **For GPU OOM:** The model is too large for the VRAM, or batch size is too high. You must inform the ML team to enable gradient checkpointing, use FSDP/Deepspeed, or reduce batch size. Infrastructure cannot fix a CUDA OOM.

### 4.3 Playbook: GPU Workload Slow (Straggler Node)

**Symptom:** A 100-node training job is running at 20% expected throughput.
**Evidence Gathering:**
*This is where you earn your paycheck as an ML Platform Engineer.*

1. **Identify the Straggler:**
   Look at the Grafana dashboard for `DCGM_FI_PROF_SM_ACTIVE`. 99 nodes will be waiting (low SM active), and 1 node will be pegged, or 1 node is totally dead causing the collective operation to block.

2. **Check InfiniBand/RoCE:**
   ```bash
   # On the suspected node
   ibstat
   ibstatus
   ```
   Look for state `Down` or high error counters.

3. **Check PCIe Bandwidth:**
   ```bash
   nvidia-smi dmon -s t
   ```
   Are PCIe Tx/Rx bytes suspiciously low compared to NVLink?

**Resolution:**
If a hardware defect is found (e.g., degraded optical cable on an IB port causing massive retransmissions), cordon the node, gracefully terminate the job, and restart the job excluding that node.

---

## 5. Reliability Testing and Game Days

You do not know if your incident response works until you test it in production.

### 5.1 Game Day Principles
- **Blast Radius:** Always define the blast radius. Start with a single pod, move to a node, then a rack.
- **Reversibility:** Every fault must have an automated and manual kill switch.
- **Observability Check:** The primary goal of a game day is often just to see if the alerts fire and the dashboards reflect reality.

### 5.2 Chaos Mesh Manifests for AI Factories

:::info Chaos Engineering
Chaos Mesh is excellent for Kubernetes-native chaos engineering. Always ensure your Game Days have a clearly defined blast radius and are completely reversible before executing them in any environment.
:::

#### Scenario 1: Network Latency Injection (TCP/IP path)
Injecting latency into the pod network interface. Note that Chaos Mesh NetworkChaos works through the kernel networking stack (tc/netem), so it affects TCP/IP traffic such as NCCL's socket transport and bootstrap, but not RDMA traffic, which bypasses the kernel. To exercise IB/RoCE faults, use switch-side or NIC-level fault injection in a lab fabric instead.

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: ib-latency-injection
  namespace: chaos-testing
spec:
  action: delay
  mode: one
  selector:
    labelSelectors:
      app: distributed-training-worker
  delay:
    latency: '50ms'
    correlation: '100'
    jitter: '0ms'
  direction: both
  target:
    selector:
      labelSelectors:
        app: distributed-training-worker
  duration: '5m'
```
*Expected Evidence:* For jobs using the socket transport, slower collectives and possible NCCL timeouts, and the efficiency alert firing. Define the pass/fail criteria before the game day.

#### Scenario 2: Host Memory Stress (Simulating noisy neighbor or rogue process)
We use `StressChaos` to consume host memory, stealing it from the dataloaders. (This stresses host RAM, not GPU memory.)

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: StressChaos
metadata:
  name: host-memory-stress
  namespace: chaos-testing
spec:
  mode: one
  selector:
    labelSelectors:
      role: gpu-worker
  stressors:
    memory:
      workers: 4
      size: '128GB'
  duration: '10m'
```
*Expected Evidence:* Node CPU load spikes, host OOM killer might invoke, pod eviction if `kubelet` gets starved.

---

## 6. Incident Communication and Postmortems

### 6.1 The Blameless Postmortem

A postmortem is not a witch hunt; it is a systemic debugging session.

**Structure:**
1. **Executive Summary:** 2 sentences. What happened, impact, duration.
2. **Impact:** Exact cost, compute hours lost, data lost.
3. **Timeline:** UTC timestamps. Include when alerts fired, when humans acknowledged, when mitigation was applied.
4. **Root Cause (5 Whys):**
   - *Why did the job fail?* NCCL timed out.
   - *Why did NCCL time out?* Node 45 lost link on `ib0`.
   - *Why did it lose link?* The ToR switch rebooted.
   - *Why did the switch reboot?* A thermal threshold was exceeded.
   - *Why was the threshold exceeded?* The CRAC (Computer Room Air Conditioning) unit in aisle 3 was offline for maintenance, and the redundancy failed.
5. **Action Items:** Must have owners and Jira tickets. (e.g., "Add alert for CRAC redundancy loss").

---

## 7. Senior Solutions Architect Troubleshooting & Interview Scenarios

### Scenario 1: The Phantom PCIe Bottleneck

**Interviewer:** "A customer complains their ResNet50 training is 40% slower on your cluster than AWS. GPUs are identical. Network is identical. CPU is identical. Where do you look?"

**Senior Architect Response:**
"First, I don't trust 'identical'. I verify the topology.
I would run `nvidia-smi topo -m` to check the PCIe topology. AWS heavily uses AWS Nitro and specific PCIe root complexes.
I'd investigate if the GPUs are on a PCIe switch or directly attached to the CPU root complex. If the customer's dataloader is heavily CPU-bound and constantly shuttling data across the QPI/UPI link between NUMA domains because the storage NVMe is on CPU0 and the target GPU is on CPU1, throughput plummets.
I would use `numastat` and `nvidia-smi dmon` to check for cross-NUMA traffic. The mitigation is to pin the dataloader threads to the same NUMA node as the GPU using `taskset` or Kubernetes Topology Manager."

### Scenario 2: The Cascading NVLink Failure

**Interviewer:** "An NVSwitch fails in an HGX A100 baseboard. What happens to the workloads on that node?"

**Senior Architect Response:**
"An HGX A100 8-GPU system uses NVSwitches to provide all-to-all non-blocking bandwidth (600GB/s of NVLink bandwidth per GPU). If an NVSwitch fails, the NVLink fabric is degraded or not fully initialized, and NVIDIA Fabric Manager will report it.
The exact behavior depends on the failure, the Fabric Manager state, and the NCCL version and topology discovery. Paths that can no longer use NVLink fall back to PCIe, which is far slower.
The workload may not crash immediately, but training iteration time can spike massively. This is why we don't just alert on `NVLink Error`, we alert on `NCCL Bandwidth degradation` or `Step Time Spikes`. The node must be cordoned and the baseboard likely needs hardware replacement."

### Scenario 3: Alert Fatigue Mitigation

**Interviewer:** "Your SRE team is getting 500 alerts a day. They are ignoring them. How do you fix this in a week?"

**Senior Architect Response:**
"1. **Audit and Silence:** Immediately silence the top 10 noisiest alerts. If they haven't caused an outage, they are noise.
2. **Implement 'Symptom-Based' alerting only.** Delete all alerts for CPU/RAM usage unless they correlate to a workload degradation.
3. **Use Alertmanager Grouping:** Group alerts by `cluster` and `namespace`. If 500 pods in a job crash, that should be exactly *one* Slack message, not 500.
4. **Enforce Runbooks:** No alert can be deployed without a link to a validated runbook. If an alert fires and there's no runbook, the on-call engineer is empowered to permanently delete the alert rule."

---

## 8. Conclusion: The AI Factory Operational Maturity Model

Reaching operational excellence in an AI factory is a journey:

- **Level 1 (Reactive):** SSH into nodes, tailing logs, manual restarts.
- **Level 2 (Active):** Basic Prometheus/Grafana, standard Kubernetes auto-recovery.
- **Level 3 (Proactive):** GPU-specific telemetry (DCGM, NCCL), Alertmanager routing, detailed runbooks.
- **Level 4 (Predictive):** Automated Game Days, Chaos Mesh, auto-remediation controllers detecting stragglers and automatically cordoning nodes without human intervention.

Aim for Level 4. In the AI era, human reaction time is the bottleneck.

## Appendix A: Complete Incident Runbooks

### Runbook A1: Infiniband Subnet Manager Split Brain
**Symptom:** Two subnet managers are active, causing routing loops and massive packet loss.
**Diagnostics:**
1. From a host, run `sminfo` to see which SM is master and its priority, and compare with the SMs you expect to be running (OpenSM instances, switch-resident SM, UFM).
2. Check UFM or OpenSM logs for master re-elections.
**Mitigation:**
1. Ensure exactly one intended SM has the highest priority; stop or lower the priority of the unintended one.
2. Restart the intended primary SM service if the fabric does not re-converge.

### Runbook A2: Storage Backend Stalls (NFS/Lustre)
**Symptom:** Dataloaders block on I/O, GPU utilization drops to 0%.
**Diagnostics:**
1. Check `node_disk_io_time_seconds_total` in Prometheus.
2. Look for `D` state processes on workers: `ps -eo state,pid,cmd | awk '$1=="D"'`
**Mitigation:**
1. Verify storage network connectivity.
2. Scale storage metadata servers if metadata operations are bottlenecked.

### Runbook A3: Kubernetes Control Plane Overload
**Symptom:** `kubectl` commands time out. API server latency > 5 seconds.
**Diagnostics:**
1. Check `apiserver_request_duration_seconds`.
2. Look for rapid pod churn (CrashLoop storms).
**Mitigation:**
1. Rate limit the namespace causing the storm.
2. Scale up the API server replicas or vertically scale the control plane nodes.

## Appendix B: Advanced Chaos Mesh Scenarios

### Scenario 3: Storage IOPS Throttling
Simulates a noisy neighbor consuming all storage IOPS.
```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: IOChaos
metadata:
  name: io-throttle
spec:
  action: latency
  mode: one
  selector:
    labelSelectors:
      app: data-loader
  volumePath: /data
  delay: '100ms'
  duration: '5m'
```

### Scenario 4: Pod Kill Storm
Simulates a massive node failure event.
```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: mass-pod-kill
spec:
  action: pod-kill
  mode: fixed-percent
  value: '20'
  selector:
    labelSelectors:
      role: worker
  duration: '1m'
```

## Appendix C: Extended PromQL Library

### C1: GPU Memory Leak Detection
Detects processes that are slowly consuming VRAM over time, typical of tensor accumulation bugs in PyTorch.
```yaml
- alert: GPUMemoryLeak
  expr: >
    predict_linear(DCGM_FI_DEV_FB_USED[1h], 3600) > (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE)
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "GPU {{ $labels.gpu }} on {{ $labels.instance }} is predicted to OOM in 1 hour."
```

### C2: NVLink Error Rate Spike
```yaml
- alert: NVLinkErrorSpike
  expr: >
    rate(DCGM_FI_DEV_NVLINK_CRC_FLIT_ERROR_COUNT_TOTAL[5m]) > 100  # threshold is illustrative: baseline your fleet
  for: 5m
  labels:
    severity: critical
    tier: hardware
  annotations:
    summary: "High NVLink CRC errors on {{ $labels.instance }}."
```
