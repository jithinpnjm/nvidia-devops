# Chapter 5: Performance Analysis and Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Advanced |
| Estimated reading time | 75 minutes |
| Primary audience | Performance engineers, systems architects |
| Core question | How do you systematically identify and eliminate performance bottlenecks? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Apply the roofline model to identify compute- vs. memory-bound kernels
- Use NVIDIA Nsight Compute and profilers to diagnose bottlenecks
- Design experiments to validate performance improvements
- Optimize across the stack (algorithm, kernel, communication, I/O)
- Estimate achievable speedup before implementing optimization
- Scale performance across multiple GPUs systematically

## Roofline Model Deep Dive

The roofline model combines **compute capability** and **memory bandwidth** to establish a performance ceiling.

**Formula:**

```
Performance (GFLOPS) = min(Peak_Compute_GFLOPS, Arithmetic_Intensity × Peak_Bandwidth_GB/s)

Where:
Arithmetic_Intensity = FLOPS / Bytes_Transferred
```

**Visual representation:**

```
         |
Performance|       Compute Ceiling
(GFLOPS) |    /----
         |   /
         |  /  Memory Bandwidth Ceiling
         | /   (slope = Peak_Bandwidth)
         |/
         +------------------------------------
             Arithmetic Intensity (FLOP/byte)
```

**Example: H100 GPU**

```
Peak compute: 989 TFLOPS (FP32)
Peak bandwidth: 2 TB/s = 2000 GB/s

Crossover point: 989 TFLOPS ÷ 2000 GB/s = 0.495 FLOP/byte

Kernels with:
- Intensity < 0.495 FLOP/byte → Memory-bound
- Intensity > 0.495 FLOP/byte → Compute-bound
```

**Real workload examples:**

| Workload | Arithmetic Intensity | Bottleneck | Ceiling |
|---|---|---|---|
| Element-wise add | 0.03 FLOP/byte | Memory | ~60 GFLOPS |
| Matrix multiply (n=1024) | 1 FLOP/byte | Compute | 500 GFLOPS (at 250 GB/s effective BW) |
| Tiled matrix multiply | 32 FLOP/byte | Compute | 989 GFLOPS (full H100 compute) |
| Deep learning inference (batched) | 10 FLOP/byte | Compute | 989 GFLOPS |

## Interview Questions

### Question 1: Roofline Model Application

**Scenario:** "You profile a ResNet inference kernel. You measure: 150 GFLOPS actual throughput, 1.2 TB/s memory bandwidth utilization. Peak GPU has 989 TFLOPS compute and 2 TB/s bandwidth. Is your kernel compute-bound or memory-bound? What's your optimization strategy?"

**Model Answer (3.5 minutes):**

"Let me calculate arithmetic intensity from the data:

```
Arithmetic Intensity = Measured GFLOPS / Measured Bandwidth
                     = 150 GFLOPS / 1.2 TB/s
                     = 150 × 10^9 / (1.2 × 10^12 bytes/s)
                     = 0.125 FLOP/byte
```

Roofline crossover is at 989 TFLOPS ÷ 2 TB/s = 0.495 FLOP/byte.

My kernel intensity (0.125) is **below the crossover**, so it's **memory-bound**.

**Proof:** If I saturated memory (2 TB/s), I'd get:
```
Performance = 0.125 FLOP/byte × 2 TB/s = 250 GFLOPS
```

But I'm only getting 150 GFLOPS, and using 1.2 TB/s. That means **I'm not fully saturating memory** despite being memory-bound.

**Why?**

- Likely cause: Memory access patterns are inefficient (uncoalesced, causing L2 misses)
- Or: Kernel is hitting some other bottleneck (small working set, L1 thrashing)

**Optimization strategy:**

Since arithmetic intensity is fixed by the algorithm (I can't change FLOP/byte without rewriting), I need to **improve memory efficiency**:

1. **Improve memory coalescing:**
   - Reorganize data layout to improve access patterns
   - Ensure threads access consecutive memory
   - Gain: Maybe +30-50% bandwidth (1.2 → 1.8 TB/s)

2. **Increase cache hits:**
   - If working set > L1 (192 KB), reorganize for L2 reuse
   - Use shared memory to tile data
   - Gain: Maybe +20% bandwidth (reduce L2 misses)

3. **If still bandwidth-limited:**
   - Reduce compute precision (FP16 vs. FP32) to reduce bandwidth
   - But this changes algorithm, not kernel efficiency

**Expected improvement:**

With optimization 1+2: 150 GFLOPS → **225 GFLOPS** (50% improvement) by reaching near-bandwidth-saturated performance.

**Verification:**

If optimization succeeds, I should measure:
```
Arithmetic Intensity = 0.125 (unchanged)
Memory Bandwidth = 1.8-2.0 TB/s (improved)
Performance = 0.125 × 1.8 = 225 GFLOPS (target)
```

If memory bandwidth doesn't improve, bottleneck is elsewhere (CPU-GPU transfer, cache efficiency, etc.)."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Roofline crossover | Determines where to optimize (compute vs. memory) |
| Arithmetic intensity from measurements | Tells you if you're efficiently using memory |
| Memory bandwidth saturation | If not saturated but memory-bound, optimize access patterns |
| Diminishing returns | At 150 GFLOPS on 989 TFLOPS GPU, there's 6.6× room to grow |

**Follow-up Trap:** "If I add more parallelism, can I achieve 989 TFLOPS?"

**Corrective answer:** "No, because intensity is fixed. Max achievable = 0.125 × 2000 = 250 GFLOPS (if memory is fully saturated). Parallelism doesn't change arithmetic intensity. To get closer to 989 TFLOPS, I'd need to change the algorithm to increase intensity (e.g., fuse multiple operations)."

**Verification Point:** Can the candidate apply roofline model, calculate intensity from measurements, and propose targeted optimizations?

---

### Question 2: Profiling and Bottleneck Identification

**Scenario:** "You profile a CUDA kernel with Nsight Compute and see: SM utilization 45%, L1 hit rate 30%, L2 hit rate 50%, HBM bandwidth 70%. What's the bottleneck?"

**Model Answer (2.5 minutes):**

"Let me parse these metrics:

- **SM utilization 45%:** SMs are not fully busy. Either:
  1. Low occupancy (not enough warps active)
  2. Instruction latency (warps stalling waiting for data)

- **L1 hit rate 30%:** Low. Most accesses miss L1 and go to L2.
  - This suggests poor locality or cache eviction.

- **L2 hit rate 50%:** Decent. Half the L1 misses find data in L2.
  - Half go to HBM, which is expensive.

- **HBM bandwidth 70%:** Good bandwidth utilization, but not saturated.

**Diagnosis:**

The pattern suggests **latency bottleneck**, not bandwidth:

1. **Why not bandwidth-bound?** HBM is only 70% utilized. If I were memory-bound, I'd expect 85%+.

2. **Why low SM utilization?** Warps are stalling on L2 misses. L2 miss latency is ~200 cycles. If I have few active warps (45% occupancy = ~28 warps), I can't hide 200-cycle latency.

3. **Root cause:** Low occupancy is limiting ability to hide L2 miss latency.

**Solution:**

Increase occupancy by:
1. Reducing register pressure (fewer registers per thread)
2. Reducing shared memory per block
3. Reducing block size (paradoxically, smaller blocks can increase total occupancy)

**Expected improvement:**

If occupancy increases from 45% to 75%, I can hide more L2 misses:
- More warps active → while one stalls, another computes
- Expected: SM utilization → 65-75%
- Performance gain: 30-40%

**Validation:**

After optimization, re-profile and check:
- [ ] Occupancy increased to 75%?
- [ ] L1 hit rate improved (more locality)?
- [ ] SM utilization improved to 60%+?

If occupancy improved but SM utilization didn't, bottleneck is elsewhere (memory contention, synchronization, etc.)."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Low occupancy = latency bottleneck | Fewer warps can't hide memory stalls |
| Cache hit rates diagnose locality | Low L1 hit = poor spatial/temporal locality |
| SM utilization + bandwidth together | Low utilization + high bandwidth = likely not bandwidth bottleneck |
| Profiling is iterative | Each optimization unlocks new bottlenecks |

**Follow-up Trap:** "Can't I just increase clock speed to hide latency?"

**Corrective answer:** "No. Latency (cycles to L2) is fixed. Clock speed doesn't hide it. You hide latency by having other warps execute while one waits. That requires occupancy. Increasing clock speed helps if you're compute-bound (more computation per cycle), but not here."

**Verification Point:** Can the candidate interpret profiler metrics and connect them to root causes?

---

### Question 3: Scaling Analysis and Bottleneck Evolution

**Scenario:** "You optimize a training kernel and achieve 85% compute utilization on 1 GPU. You run it on 8 GPUs and measure 65% efficiency (speedup 5.2× instead of 8×). What's limiting scaling efficiency?"

**Model Answer (3 minutes):**

"Let me break down the loss:

```
Ideal: 8 GPUs × 85% compute = 6.8× speedup
Actual: 5.2× speedup
Efficiency: 5.2 ÷ 6.8 = 76.5% ÷ 85% = 90%

Wait, that doesn't match. Let me recalculate:
Efficiency = Actual_Speedup / Ideal_Speedup = 5.2 / 8 = 65%

So I'm losing 35% to scaling overhead.
```

**Scaling overhead breakdown (typical for 8 GPUs):**

1. **AllReduce communication:** 10-15% (dominates for this size)
2. **Load imbalance:** 5-10% (some GPUs wait at barriers)
3. **Memory contention:** 5% (shared memory bandwidth at cluster level)
4. **Synchronization overhead:** 3-5% (barrier waits)

**Total: 23-35%** matches observed 35% loss.

**Diagnosis:**

The biggest factor is AllReduce (10-15%). On 1 GPU, no AllReduce. On 8 GPUs, gradient synchronization is 10-15% of total time.

**How to measure:**

```bash
# Time just the AllReduce
nccl-tests bandwidth  # Measure ring AllReduce bandwidth

# Compare to compute time
# If AllReduce = 300 ms and compute = 2 seconds
# Then AllReduce overhead = 300 ÷ 2300 ≈ 13%
```

**Optimization priorities (in order of ROI):**

| Optimization | Impact | Effort | Notes |
|---|---|---|---|
| Reduce gradient precision (FP16) | +5% | Low | Reduces AllReduce traffic |
| Gradient accumulation (batch sync every 2 steps) | +5% | Medium | Increases effective batch size |
| Overlap AllReduce with backward | +3% | High | Requires kernel fusion |
| Optimize network topology (ring vs. tree) | +2% | Low | NCCL tuning |

**Expected final efficiency:**

After implementing first two:
- AllReduce overhead: 13% → 6.5% (half)
- Speedup: 5.2 → 6.2×
- Efficiency: 65% → 78%

**Scaling limit:**

As you add more GPUs (16, 32), AllReduce time increases. Eventually, communication dominates:

```
16 GPUs: Efficiency → 70% (AllReduce = 20%)
32 GPUs: Efficiency → 55% (AllReduce = 35%)
```

This is a hard limit without better interconnect."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Scaling efficiency degrades predictably | AllReduce time scales; compute time doesn't |
| Communication is the bottleneck at scale | Rule of thumb: at 8 GPUs, comms ≈ 10% |
| Diminishing returns on GPU count | Beyond ~16 GPUs, efficiency drops rapidly without network upgrades |
| Gradient compression ROI | Every bit you reduce in gradient saves communication time |

**Follow-up Trap:** "If I use GPU interconnect instead of Ethernet, does it scale linearly?"

**Corrective answer:** "Better, but not linear. NVLink (600 GB/s) vs. Ethernet (25 GB/s) is 24× better. But at 16 GPUs, you still have AllReduce overhead (~20%). And you can only fit 8 GPUs on one NVLink connected system. Beyond that, you're back to Ethernet or InfiniBand."

**Verification Point:** Can the candidate predict scaling efficiency, identify bottlenecks, and prioritize optimizations by ROI?

## Troubleshooting Decision Tree

```
Kernel is slow?
├─ Check Roofline model
│  ├─ Below compute line → Memory-bound
│  │  └─ Improve memory access patterns (coalescing, shared memory)
│  └─ Below memory line → Latency-bound
│     └─ Increase occupancy (reduce registers, shared memory)
│
├─ Check profiler metrics
│  ├─ SM utilization < 60% → Occupancy or synchronization issue
│  ├─ L1 hit rate < 50% → Poor spatial locality
│  ├─ HBM bandwidth < 50% → Not saturating memory
│  └─ Lots of idle time → Load imbalance or I/O bottleneck
│
└─ Multi-GPU scaling inefficient?
   ├─ Measure AllReduce time
   ├─ Compare to compute time
   └─ If AllReduce > 15% of compute, optimize communication
```

## Related Chapters

- **Chapter 1:** [GPU Architecture Deep Dive](./chapter-01-gpu-architecture-deep-dive.md) — hardware execution model
- **Chapter 2:** [CUDA Programming](./chapter-02-cuda-programming-and-optimization.md) — kernel optimization
- **Chapter 3:** [Distributed Systems](./chapter-03-multi-gpu-and-distributed-systems.md) — scaling analysis

