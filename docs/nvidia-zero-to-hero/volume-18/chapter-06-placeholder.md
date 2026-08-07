---
title: "Chapter 6 - GPU Sharing Security"
slug: "chapter-6-gpu-sharing-security"
sidebar_position: 6
description: "Analyze security implications of MIG, time-slicing, and vGPU; verify isolation properties; detect side-channels."
---

# Chapter 6 — GPU Sharing Security

**Learning outcome:** Evaluate the security trade-offs of GPU sharing mechanisms, detect isolation failures, and implement monitoring for hardware side-channels.

## 6.1 The sharing/security tradeoff

GPU sharing (MIG, time-slicing, vGPU) allows multiple workloads to use one GPU, improving cost efficiency. But sharing introduces security risks: workloads can potentially interfere with each other.

```mermaid
flowchart LR
    subgraph Dedicated["Dedicated GPU (secure, expensive)"]
        Pod1["Workload A<br/>uses GPU 0"]
        Pod2["Workload B<br/>uses GPU 1"]
        Pod1 -.->|"No shared<br/>hardware"| Pod2
    end
    
    subgraph MIG["MIG (secure, efficient)"]
        Pod3["Workload A<br/>MIG instance 0"]
        Pod4["Workload B<br/>MIG instance 1"]
        Pod3 -.->|"Hard isolation<br/>separate SM,<br/>memory, L2 cache"| Pod4
    end
    
    subgraph TimeSlice["Time-Slicing (efficient, less secure)"]
        Pod5["Workload A<br/>time slot 1"]
        Pod6["Workload B<br/>time slot 2"]
        Pod5 -.->|"Share everything,<br/>scheduler fairness only"| Pod6
        Pod5 -.->|"Possible side-channels:<br/>cache, power, thermal"| Pod6
    end
    
    subgraph Risk["Security Risk"]
        Dedicated -->|"None (physical isolation)"| Risk
        MIG -->|"Low (hard isolation)"| Risk
        TimeSlice -->|"Medium (temporal isolation only)"| Risk
    end
```

## 6.2 MIG isolation: validating hard boundaries

MIG (Multi-Instance GPU) partitions a GPU into isolated instances, each with its own:
- Streaming Multiprocessors (SMs)
- L2 cache
- Memory controllers
- Device memory

**Verification: confirm MIG instances are truly isolated**

```bash
# Check MIG mode is enabled
$ nvidia-smi -L
GPU 0: NVIDIA A100-SXM4-80GB (UUID: GPU-...)
  MIG 3g.20gb Profile ID 14  Instance ID 1 (UUID: MIG-...)
  MIG 3g.20gb Profile ID 14  Instance ID 2 (UUID: MIG-...)

# Verify instance memory is separate
$ nvidia-smi -i 0:1 -q -d MEMORY
Memory
  Total                           : 20480 MiB
  Used                            : 0 MiB
  Free                            : 20480 MiB

$ nvidia-smi -i 0:2 -q -d MEMORY
Memory
  Total                           : 20480 MiB
  Used                            : 0 MiB
  Free                            : 20480 MiB

# Each instance sees only its allocated memory, not the whole GPU
```

**Test: confirm isolation actually prevents cross-instance interference**

```bash
# Launch compute kernel in MIG instance 1 that allocates all its memory
$ cuda-memtest --stress 1 --device 0:1
CUDA Memory Bandwidth Test
Total Memory: 20480 MiB
Chunk Size: 1 MiB
...
Bandwidth: 1234 GB/s

# Simultaneously launch a different kernel in MIG instance 2
# (in another terminal or container)
$ cuda-memtest --stress 1 --device 0:2
CUDA Memory Bandwidth Test
Total Memory: 20480 MiB
Chunk Size: 1 MiB
...
Bandwidth: 1234 GB/s

# Both report independent performance; no interference
# If they were sharing without isolation, one would throttle the other
```

**Real scenario: MIG isolation failure detection**

```bash
# If MIG isolation fails, both instances report same UUID
$ nvidia-smi -L
GPU 0: NVIDIA A100-SXM4-80GB (UUID: GPU-SAME-UUID)
  MIG 3g.20gb Instance ID 1 (UUID: GPU-SAME-UUID)  # <- Bad: same UUID
  MIG 3g.20gb Instance ID 2 (UUID: GPU-SAME-UUID)  # <- Bad: same UUID

# This is a malfunction; investigate:
$ nvidia-smi -i 0 -q  # Check GPU reset required
# May need to reset GPU or reboot

# Action: isolate from production; remediate; re-test
```

## 6.3 Time-slicing: temporal isolation and side-channel risk

Time-slicing allows multiple workloads to share a single GPU in round-robin fashion. The scheduler rapidly switches between jobs, giving each a time slot.

**Advantage:** Efficient resource use (one expensive GPU can serve many small jobs).

**Disadvantage:** Shared hardware (L2 cache, memory bus, power rails) means timing-based side-channels can leak information.

**Example: cache side-channel attack on time-sliced GPU**

Attacker Workload A and Victim Workload B both run on time-sliced GPU:

```bash
# Workload A (attacker): Measure L2 cache hit times
for model_weight in victim_model_weights:
    start = rdtsc()
    load(model_weight)  # Try to load victim's weights into cache
    end = rdtsc()
    
    # If L2 cache hit: fast (10-100 cycles)
    # If L2 cache miss: slow (1000+ cycles)
    if (end - start) < 100:
        print(f"Weight at {model_weight} is in L2 cache")
        # Attacker can infer which parts of model are being used
    else:
        print(f"Weight at {model_weight} is not in cache")
```

**Mitigation: monitor for suspicious access patterns**

```bash
# Monitor L2 cache line allocations per process (if GPU supports)
# Some GPUs expose cache_l2_misses or cache_l2_hits via DCGM

$ dcgmi dmon -i <gpu_id> -c 10  # Sample every 10 seconds
GPU 0: L2 Misses: 12345, Cache Hit Rate: 87%
# Sudden spikes in L2 misses + low hit rate = possible side-channel attempt
```

**Time-slicing best practice: use only for trusted workloads**

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: time-sliced-gpu-ns
  labels:
    # Only non-sensitive workloads here
    workload-type: "non-confidential"
---
# Separate namespace for MIG-isolated sensitive workloads
apiVersion: v1
kind: Namespace
metadata:
  name: mig-isolated-gpu-ns
  labels:
    workload-type: "confidential-training"
```

## 6.4 vGPU: hypervisor-based sharing and escape risks

vGPU (virtualized GPU, via NVIDIA GRID/vGPU software) allows a hypervisor to expose multiple virtual GPUs from one physical GPU.

**Security model:** Hypervisor enforces isolation. If the hypervisor is compromised, isolation is completely broken.

**Real scenario: vGPU escape via hypervisor vulnerability**

```bash
# Workload runs inside a VM with vGPU
$ # Hypervisor is compromised; attacker can:
$ # 1. Access physical GPU and read all workloads' data
$ # 2. Inject code into other VMs' vGPU drivers
$ # 3. Modify vGPU firmware to spy on all traffic

# No isolation at this level; vGPU is only as secure as the hypervisor
```

**Mitigation: validate hypervisor security posture**

```bash
# Check hypervisor is up-to-date with security patches
$ virsh version
Compiled against library: libvirt 8.2.0
Using library: libvirt 8.2.0
Using API: QEMU 7.0.0
# Compare against latest QEMU and libvirt security advisories

# Verify vGPU driver version
$ nvidia-smi | grep -i vgpu
Driver Version: 550.90.07
# Check against NVIDIA vGPU security advisories
```

## 6.5 Monitoring: detecting GPU resource contention and side-channels

**Metric: GPU utilization per workload (should sum to 100% if fairly shared)**

```bash
$ nvidia-smi -i 0 -q -d UTILIZATION | grep -E 'Gpu|Mem'
GPU Utilization:       95%
Memory Utilization:    87%

# If time-slicing, observe these values over time
# With fair time-slicing:
#   - Workload A active: Util 95%, then drops to 0
#   - Workload B active: Util 95%, then drops to 0
#   - Pattern repeats: this is correct time-slicing
#
# If one workload dominates:
#   - Utilization stays at 95% continuously
#   - Other workload gets starved; indicate scheduler issue
```

**Metric: thermal and power spikes (side-channel indicator)**

```bash
$ nvidia-smi dmon -s pcm -c 20
GPU Pwr Gtemp Mtemp Sm Mem Enc Dec
0   310   65    51   95  87   0   0
0   308   66    52   94  86   0   0
0   350   71    58   99  99   0   0  # <- Spike: possible side-channel
0   305   65    52   92  84   0   0  # <- Back to normal
0   312   64    51   94  87   0   0
```

A sudden power spike + memory utilization spike with no corresponding workload change = possible cache eviction attack or side-channel activity.

## Production Troubleshooting

| Issue | Symptom | Check | Fix |
|---|---|---|---|
| MIG isolation broken | Both instances report same UUID; interference detected | `nvidia-smi -L` shows duplicate UUIDs | Reset GPU: `nvidia-smi -pm 0; nvidia-smi -pm 1` or reboot |
| Time-slicing starvation | One workload gets GPU time, other starved; latency high | Monitor utilization per process over time | Adjust scheduler weights; consider switching to MIG or dedicated GPU |
| vGPU escape suspected | Workload can read other vGPU memory; forbidden access succeeds | Check hypervisor security patches; audit vGPU driver version | Update hypervisor and vGPU driver; isolate affected VMs |
| Side-channel activity detected | Unexplained cache misses + power spikes | Monitor L2 cache metrics + dmon power over time | Investigate source workload; consider moving to MIG or dedicated GPU for sensitive data |

## Interview Question: GPU Sharing Trade-offs

**Question:** "Your team wants to use time-slicing to pack more inference workloads on GPUs for cost savings. What security concerns would you raise, and how would you mitigate them?"

**Model answer (spoken):**
> "Time-slicing is great for efficiency but introduces side-channel risks. Workloads share the L2 cache, memory bus, and other GPU resources. An attacker could measure cache hit times or power consumption to infer what data another workload is accessing.
>
> I'd first ask: are all workloads trusted, or are some potentially adversarial? If all workloads are internal and trusted, time-slicing is fine — the efficiency gain is worth the low-risk side-channel exposure. But if we're running third-party or untrusted code, I'd say no to time-slicing.
>
> If we need both efficiency and security, I'd use MIG. MIG gives hard isolation — separate SMs, separate memory, separate L2 cache — so no side-channel is possible. Cost is slightly higher (we can fit fewer instances per GPU) but we get real isolation.
>
> I'd also implement monitoring: track L2 cache hit rate and power consumption per workload. If we see sudden spikes that don't match the workload's code, that's a red flag for an attack.
>
> Finally, I'd document the trade-off clearly: 'Time-slicing assumes workloads trust each other; do not time-slice workloads that must be confidential from each other.'"

## Key Takeaways

- MIG provides hard hardware isolation; use for high-security workloads.
- Time-slicing shares GPU hardware; acceptable only for trusted workloads; monitor for side-channels.
- vGPU isolation depends entirely on hypervisor security; keep hypervisor patched.
- Monitor GPU metrics for side-channel signatures: unexpected cache misses, power spikes, thermal anomalies.
- Document sharing assumptions; communicate trade-offs to stakeholders.

## Cross References

- Previous: [Chapter 5 — Pod Security and Network Policies](./chapter-05-placeholder.md)
- Next: [Chapter 7 — DMA, IOMMU, and SR-IOV Security](./chapter-07-placeholder.md)
- Related: [Volume 11 — GPU Sharing Architecture](../volume-11/index.md)
- Lab: [Lab 5 — Validate MIG Isolation and Detect Time-Slicing Contention](./labs/lab-05-placeholder.md)
