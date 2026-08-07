# Project 8: Security Architecture Audit

| Project metadata | Value |
|---|---|
| Volume | 24 — Capstone Projects |
| Difficulty | Advanced |
| Estimated time | 8–10 hours |
| Primary audience | Security Engineers, Infrastructure Teams, Compliance Officers |
| Core objective | Audit multi-tenant GPU cluster for 5+ isolation vulnerabilities; propose fixes |
| Linked interview chapter | Volume 23, Chapter 8: Security and Compliance |

## Learning Objectives

By the end of this project, you will be able to:
- Model threat scenarios in multi-tenant GPU environments
- Identify isolation vulnerabilities (kernel access, memory escape, timing attacks)
- Design and implement mitigation strategies
- Verify fixes reduce attack surface
- Assess tradeoff between security and performance

## Problem Statement

A cloud provider runs a multi-tenant GPU cluster. Three customers lease GPUs:

1. **Customer A:** Enterprise financial firm (high-value data, moderate trust of neighbors)
2. **Customer B:** ML platform startup (research code, low data sensitivity)
3. **Customer C:** Academic lab (public research, open collaboration)

**You must find 5+ isolation vulnerabilities that could allow Customer A's data to leak to Customer B, and propose fixes.**

**Constraint:** Fixes must not reduce GPU throughput by more than 5%.

## Threat Model

**Adversary capabilities:**
- Customer B can write and execute arbitrary CUDA code on their GPU
- Customer B cannot directly access other GPUs' memory (hardware isolation exists)
- Customer B can observe timing, power, and thermal characteristics of the system
- Customer B can observe memory bus traffic (via external monitoring)

**Attack goals:**
- Steal model weights from Customer A's training job
- Extract training data samples
- Cause denial of service

## Real Vulnerabilities

### Vulnerability 1: Untrusted Kernel Launch (Same-GPU Time-Slicing)

**Threat:** Customer A and Customer B are both scheduled onto the **same physical GPU** via time-slicing (not MIG — a common fallback when hardware-partitioned capacity is scarce). Because their kernels run in the same SMs and share the same L2 cache and memory controller when their contexts are swapped back-to-back, Customer B's kernel can probe residual cache/DRAM state left behind by Customer A's kernel and measure access latency to infer which addresses Customer A recently touched — a classic **same-device** timing side-channel. This does *not* work across two separate, hardware-isolated physical GPUs (they don't share caches or a memory controller), so the attack only applies when A and B are time-sliced onto one GPU or co-located on the same MIG-partitioned die where cache is not partitioned.

```cuda
// Customer B's malicious kernel — running on the SAME physical GPU as
// Customer A, in the time-slice immediately following Customer A's kernel
__global__ void timing_side_channel() {
    int shared_secret = 0;
    
    // Repeatedly access memory in pattern that depends on Customer A's data
    for (int bit = 0; bit < 256; bit++) {
        long long start = clock64();
        
        // Probe memory location that would be accessed if A's data has this bit set
        // Measure latency to infer bit value
        int val = *(int*)0x12345678;  // Arbitrary address
        
        long long end = clock64();
        long long latency = end - start;
        
        if (latency < threshold) {
            // Memory was cached (from Customer A's prior time-slice) or the
            // DRAM row buffer was already open; A's kernel probably accessed it
            shared_secret |= (1 << bit);
        }
    }
}
```

**Impact:** Customer B can infer properties of Customer A's data through timing attacks, but only when both tenants share the same physical GPU (time-sliced or non-cache-partitioned MIG) — not across separate physical GPUs.

**Fix:** Use MIG with cache/memory partitioning instead of time-slicing for tenants with differing trust levels, or flush L2 cache and reset memory controller state between time-sliced context switches.

### Vulnerability 2: Shared L2 Cache Side-Channel

**Threat:** Both GPUs share L2 cache (on some H100 configurations). Customer B can measure cache hit rates to infer memory access patterns of Customer A.

**Evidence:** Cache hit rate monitoring via performance counters:

```bash
nvidia-smi dmon -c 100  # Monitor L2 cache statistics

# L2 cache shared between GPUs; B observes A's memory accesses
```

**Fix:** Partition L2 cache per GPU using NVIDIA's cache partitioning feature.

### Vulnerability 3: VRAM Side-Channel (Memory Bus Sniffing)

**Threat:** VRAM is shared; if encryption isn't used, someone with physical access can sniff memory bus (external attacker, or privileged container).

**Evidence:** NVIDIA HBM3 doesn't encrypt data at rest without Confidential Computing (H100 Grace Hopper with NVidia Hopper Security).

**Fix:** Enable encryption (if hardware supports); or use encrypted models (homomorphic encryption adds 100-1000× overhead, usually not practical).

### Vulnerability 4: Privileged Container Escape

**Threat:** Container running Customer B's job has `--privileged` flag; can access host kernel, read all GPU memory.

**Evidence:** Checking Docker capabilities:

```bash
docker inspect customer-b-container | grep "Privileged"
# "Privileged": true  ← CRITICAL!

# With privileged access, Customer B can:
# 1. Load kernel module
# 2. Map IOMMU to access any GPU memory
# 3. Read Customer A's VRAM
```

**Fix:** Remove `--privileged`; use specific capabilities instead.

### Vulnerability 5: Insufficient Namespace Isolation

**Threat:** Containers from different customers share Linux namespace; can send signals between processes.

**Evidence:**

```bash
# In Customer B's container
ps aux | grep customer-a  # Can see Customer A's processes
kill -9 <pid>           # Can kill Customer A's processes!
```

**Fix:** Isolate namespaces (PID namespace, IPC namespace).

### Vulnerability 6: Side-Channel via Infiniband Network

**Threat:** Multi-tenant cluster uses shared IB network; Customer B can observe traffic patterns and infer data properties of Customer A's all-reduce operations.

**Evidence:**

```bash
# Monitor IB network from Customer B's container
ibmvit -m 0 -r -o traffic.pcap  # Capture all traffic on subnet

# Analyze traffic to infer gradient magnitudes, model structure
```

**Fix:** Encrypt network traffic (MPI over TLS/IPSec); or use dedicated IB VLANs per customer.

## Success Criteria

1. **Identify 5+ vulnerabilities:** Each with clear threat model and proof-of-concept
2. **Propose mitigations:** For each vulnerability, design a fix that preserves performance (<5% overhead)
3. **Implement at least 2 fixes:** Demonstrate fix works (vulnerability no longer exploitable)
4. **Assess risk/impact:** Rank vulnerabilities by likelihood and impact
5. **Document tradeoffs:** Why some fixes aren't deployed (cost, complexity, performance)

## Real Output: Security Audit Report

```
SECURITY AUDIT REPORT: Multi-Tenant GPU Cluster
Generated: 2026-08-07

SUMMARY
───────
Total vulnerabilities found: 6
Severity: 2 Critical, 3 High, 1 Medium
Remediation cost: ~2% performance overhead

VULNERABILITIES
───────────────

[CRITICAL] Privilege Escalation via Privileged Container
  Risk: Customer B can escape container, access all VRAM
  Likelihood: High (if container deployed with --privileged)
  Impact: Complete data breach
  Mitigation: Remove --privileged flag; use specific capabilities
  Effort: Low (config change)

[CRITICAL] Timing Side-Channel via L2 Cache
  Risk: Customer B can infer memory access patterns of Customer A
  Likelihood: Medium (requires sophisticated attacker)
  Impact: Partial data leak (model structure inference)
  Mitigation: Enable L2 cache partitioning per GPU
  Effort: Medium (requires driver support, 1-2% overhead)

[HIGH] Shared Namespace Isolation
  Risk: Customer B can signal, kill Customer A's processes
  Likelihood: High (trivial exploit)
  Impact: Denial of service
  Mitigation: Isolate Linux namespaces (PID, IPC, UTS)
  Effort: Low (Kubernetes/container config)

[HIGH] Infiniband Traffic Sniffing
  Risk: Gradient data exposed on network (side-channel inference)
  Likelihood: Medium (requires network access)
  Impact: Partial model leak via gradient analysis
  Mitigation: Encrypt IB traffic (IPSec) or use VLANs per customer
  Effort: High (infrastructure change, 3-5% overhead)

[HIGH] VRAM Encryption Not Enabled
  Risk: External attacker with physical access reads VRAM
  Likelihood: Low in hosted environment
  Impact: Complete data breach
  Mitigation: Enable Confidential Computing (H100 with encryption)
  Effort: High (hardware requirement, 5-10% performance cost)

[MEDIUM] Insufficient Resource Quotas
  Risk: Customer B exhausts CPU/memory, causing DoS
  Likelihood: High
  Impact: Denial of service
  Mitigation: Set resource limits per customer
  Effort: Low (Kubernetes ResourceQuota)

RECOMMENDATIONS (Priority Order)
──────────────────────────────────
1. Remove --privileged flag (CRITICAL, instant fix)
2. Isolate namespaces (HIGH, low cost)
3. Enable L2 cache partitioning (HIGH, medium effort)
4. Encrypt Infiniband (HIGH, significant overhead, defer to phase 2)
5. Add resource quotas (MEDIUM, low cost)
6. Evaluate Confidential Computing (Strategic, long-term)

COMPLIANCE
──────────
After applying recommendations 1-3: Cluster is suitable for HIPAA/SOC2
After applying recommendation 4: Suitable for financial data
After applying recommendation 6: Suitable for encrypted data at rest
```

## Production Troubleshooting

| Observation | Root Cause | Diagnostic | Fix |
|---|---|---|---|
| L2 cache partitioning enabled but performance dropped 8% (exceeds 5% budget) | Partitioning overhead or suboptimal partition sizes | Profile with Nsight Compute: check L2 hit rate, memory bandwidth utilization | Tune partition sizes or disable partitioning for non-sensitive workloads |
| Infiniband encryption adds 12% overhead (beyond 5% budget) | Encryption in software (slow); or incorrect implementation | Measure MPI bandwidth: `mpirun omb_allreduce` with/without encryption | Use hardware encryption (if available) or accept overhead and defer to phase 2 |
| After namespace isolation, workload crashes (permission denied) | Container can't access /dev/nvidia*; namespace doesn't inherit GPU device files | Check: `docker run --device /dev/nvidia* ...` | Explicitly mount GPU devices in isolated namespace |
| Audit finds new vulnerability (GPU firmware exploitable) | Firmware not updated; vulnerability in NVIDIA GPU kernel | Check firmware: `nvidia-smi -q | grep "Firmware"` | Update NVIDIA drivers and firmware to latest |

## Solution Walkthrough

### Step 1: Audit Container Configuration

```bash
# Check if containers have --privileged
docker ps --format "table {{.Names}}\t{{.HostConfig.Privileged}}"

# Output:
# NAMES                    PRIVILEGED
# customer-a-training      false       ✓
# customer-b-inference     true        ✗ VULNERABILITY!
# customer-c-research      false       ✓
```

### Step 2: Test Vulnerability 1 (Privileged Escape)

```bash
# Inside privileged container (customer-b)
docker exec customer-b-inference bash

# Try to access host GPU memory (this should fail in non-privileged)
nvidia-smi  # Works in privileged; restricted in non-privileged

# Try to load kernel module
insmod my_module.ko  # Works in privileged; fails in non-privileged
```

### Step 3: Implement Fix 1 (Remove Privileged)

Update container spec:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: customer-b-inference
spec:
  containers:
  - name: inference
    image: customer-b/model:latest
    securityContext:
      privileged: false
      capabilities:
        add: []  # No extra capabilities
    volumeMounts:
    - name: gpu-device
      mountPath: /dev/nvidia*
  volumes:
  - name: gpu-device
    hostPath:
      path: /dev/nvidia*
```

### Step 4: Test Vulnerability 2 (L2 Cache Side-Channel)

```bash
# Measure L2 hit rate when Customer A and B run concurrently
# Customer A: train ResNet-50 (large working set, high L2 misses)
# Customer B: run timing attack (measure latency to infer hits)

# Before fix:
# L2 hit rate of B's probes correlates with A's memory pattern
python timing_attack.py --output=before_fix.csv

# After enabling L2 partitioning:
nvidia-smi -lgic  # Enable GPU-instance-creation (MIG) or partition L2
# Re-run attack
python timing_attack.py --output=after_fix.csv

# Compare: after fix, correlation should drop to noise floor
```

### Step 5: Implement Fix 2 (Namespace Isolation)

Add Kubernetes Pod Security Context:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: customer-b-inference
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
  - name: inference
    image: customer-b/model:latest
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
```

### Step 6: Verify Fixes

```bash
# After fixes, customer B should NOT be able to:
# 1. Access privileged operations
docker exec customer-b-inference insmod module.ko
# -> Error: Permission denied ✓

# 2. See other customers' processes
docker exec customer-b-inference ps aux | grep customer-a
# -> (no output) ✓

# 3. Access neighbor GPU memory
docker exec customer-b-inference nvidia-smi -i 0 -q
# -> Error: Permission denied (GPU 0 not assigned) ✓
```

## Interview Preparation

**Q: What are the top 3 security concerns for a multi-tenant GPU cluster?**

**A:** (Spoken answer)

"Three tiers of concern:

**Tier 1 (Immediate): Container escape.** If a customer can escape their container (via --privileged or kernel vulnerability), they access the entire host—all GPU memory, all data. This is the most impactful attack. Fix: run containers with minimal privileges, keep kernel patched.

**Tier 2 (Practical): Side-channel attacks.** Timing, power, cache-based side-channels let customers infer properties of neighbors' data without direct access. Less impactful than direct escape, but still serious for high-value data. Fix: L2 cache partitioning, noise injection, differential privacy.

**Tier 3 (Sophisticated): Network sniffing.** Encrypted network traffic is standard now, but gradient data can leak properties of models. If unencrypted, an attacker with network access can infer model structure. Fix: encrypt inter-GPU communication, or use homomorphic encryption (expensive).

For a financial customer (Tier 1 data), I'd prioritize Tier 1 and 2 fixes: disable privileged containers, isolate caches, partition resources. For a research customer (public data), Tier 1 is sufficient.

The tradeoff is always performance. Every security feature costs time. I'd start with high-impact, low-cost fixes (like removing --privileged), then progressively add more as data sensitivity increases."

## Evaluation Rubric

| Criterion | Excellent (100%) | Good (80%) | Acceptable (60%) | Needs Work (<60%) |
|---|---|---|---|---|
| **Vulnerabilities found** | 6+ with clear threat model and PoC | 5 vulnerabilities, good models | 4 vulnerabilities, some models | <4 or weak models |
| **Fixes implemented** | 3+ fixes verified working; performance impact measured | 2+ fixes implemented, mostly verified | 2 fixes with limited verification | <2 or untested |
| **Performance impact** | All fixes < 5% overhead; well measured | Most fixes < 5%, overhead quantified | Some overhead > 5% but justified | Overhead not measured or excessive |
| **Documentation** | Clear threat model per vulnerability; tradeoff analysis; remediation plan | Good documentation with minor gaps | Basic descriptions present | Minimal or unclear documentation |
| **Audit rigor** | Systematic approach; considers multiple attack surfaces | Good coverage of main areas | Some areas covered | Limited or ad-hoc analysis |

## Key Takeaways

1. **Privilege is dangerous:** Container escape (via --privileged) is the quickest route to data theft. Disable it.
2. **Side-channels are subtle:** Timing, cache, and power side-channels require sophisticated attacks but are real risks.
3. **Defense in depth:** No single fix is complete. Layer multiple defenses (isolation, encryption, monitoring).
4. **Performance matters:** Security features must not tank performance; <5% overhead is practical target.
5. **Audit regularly:** New vulnerabilities emerge; re-audit annually.

## Discussion Questions

1. Design a side-channel attack to infer the sparsity of a neural network from timing alone.
2. If L2 cache partitioning costs 2% performance but Infiniband encryption costs 10%, which do you deploy first and why?
3. How would you test whether a fix actually prevents a vulnerability (beyond theoretical analysis)?
4. What's the business case for Confidential Computing (5-10% overhead) for your customers?

## Cross-References

- **Volume 23, Chapter 8:** Security and Compliance
- **Volume 19:** Security Architecture and Threat Modeling
- Tools: Container security scanning, NVIDIA security advisories, Trusted Execution Environment (TEE)
