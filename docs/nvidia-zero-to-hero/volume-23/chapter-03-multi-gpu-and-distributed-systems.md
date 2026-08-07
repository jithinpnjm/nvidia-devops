# Chapter 3: Multi-GPU and Distributed Systems

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Advanced |
| Estimated reading time | 80 minutes |
| Primary audience | Distributed systems engineers, training platform teams |
| Core question | How do you scale training across multiple GPUs and machines? What limits scaling efficiency? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Explain collective communication primitives (AllReduce, Broadcast, Scatter/Gather)
- Design efficient AllReduce algorithms for different topologies
- Diagnose communication bottlenecks using profiling tools
- Calculate scaling efficiency and weak/strong scaling limits
- Design distributed training systems with gradient compression and pipeline parallelism
- Optimize for network topology (NVLink, InfiniBand, Ethernet)

## Collective Communication Fundamentals

### AllReduce: The Core Primitive

AllReduce is the most critical operation in distributed training: every rank sends its gradients, everyone receives the global sum. This must happen efficiently.

**Naive implementation (ring):**

```
Iteration 1: Rank 0 sends to 1, 1 sends to 0 (but can't receive while sending!)
```

This requires N iterations for N ranks, which is inefficient.

**Tree-based AllReduce (reduce then broadcast):**

```
         Rank 0
        /    \
    Rank 1   Rank 2
    /   \    /   \
  Rank 3 4  5    6

1. Reduce (up the tree):
   - Ranks 3,4,5,6 send to their parents
   - Ranks 1,2 reduce and send to rank 0
   - Rank 0 reduces (now has the global sum)

2. Broadcast (down the tree):
   - Rank 0 sends to 1,2
   - Ranks 1,2 send to children
   - All ranks receive the result

Time: 2 × log₂(N) rounds
```

**Ring AllReduce (most network-efficient):**

```
Rank 0 → Rank 1 → Rank 2 → ... → Rank N-1 → (wraps back)

1. Send phase: Each rank receives from left, sends to right
2. Reduce phase: Each rank reduces received + local gradients
3. Broadcast phase: Results pass through ring again

Time: 2 × N rounds, but each link is used once
Bandwidth: Linear scaling (twice around the ring)
```

For 8 GPUs on 2 nodes:
- Tree: log₂(8) = 3 rounds → ~6 hops
- Ring: 8 rounds, but full-duplex links

**Ring wins on bandwidth** (scales linearly). Tree wins on latency (logarithmic).

### Bandwidth vs. Latency in AllReduce

**Bandwidth-limited case (large gradients, low-latency link):**

Ring is optimal. Each link carries data once, twice for broadcast.

**Latency-limited case (small gradients, high-latency link):**

Tree is better. Fewer hops, even if not all links are utilized.

**Real example: A100 cluster (8 GPUs, 2 nodes)**

Setup:
- 4 A100s per node (40 GB each)
- NVLink within node: 600 GB/s per link
- Inter-node: 200 Gbps (25 GB/s) InfiniBand

Gradient size: 1 GB (typical for large model)

**Ring AllReduce (correctly chunked):**

A properly implemented ring AllReduce splits the gradient into N chunks (N = rank count) and moves only one chunk per link per step, not the full gradient — that's what makes it bandwidth-optimal. Across the reduce-scatter and all-gather phases combined, each GPU sends and receives roughly 2×(N-1)/N of the total gradient size. Total data moved per GPU: 2 × (8-1)/8 × 1 GB = 1.75 GB.

1. Time = 1.75 GB ÷ 25 GB/s ≈ **70 ms**
2. Total: ~70 ms

**Tree AllReduce:**
1. Reduce: 3 hops × 1 GB at 25 GB/s = 120 ms
2. Broadcast: 3 hops × 1 GB at 25 GB/s = 120 ms
3. Total: ~240 ms

**Ring is actually ~3.4× faster** for this size and topology, once correctly chunked — the opposite of what an unchunked (naive) ring calculation suggests. A naive, unchunked ring that moves the *full* 1 GB gradient at every one of the 8 hops (a common mistake) would wrongly compute 8 × 1 GB ÷ 25 GB/s = 320 ms per phase, ~640 ms total — about 9× too slow, and it would make ring look far worse than tree. Always chunk the gradient across ranks before computing ring AllReduce time.

If gradient is 100 MB instead:

Ring (chunked):
- 2 × 7/8 × 100 MB = 175 MB total per GPU ÷ 25 GB/s ≈ **7 ms**

Tree:
- 3 hops × 100 MB = 300 MB at 25 GB/s = 12 ms per reduction phase
- Total: ~24 ms

Ring still wins by a similar ratio at this size too (~3.4×), since this simplified bandwidth-only model has no fixed per-hop latency term. In practice, at very small message sizes, per-hop latency (not modeled here) starts to dominate and gives tree-style algorithms a real edge — that crossover is a latency effect, not a bandwidth one, and doesn't show up until message sizes get small enough that fixed per-hop overhead rivals the transfer time itself.

## Scaling Efficiency and Weak/Strong Scaling

### Strong Scaling: Keeping Problem Size Fixed

**Definition:** How much faster does training complete with more GPUs?

**Formula:**

```
Speedup = T₁ / Tₙ (time on 1 GPU vs. N GPUs)
Efficiency = Speedup / N (ideal = 1, actual < 1 due to overhead)
```

**Real example: ResNet-50 on 16 A100s**

| GPUs | Time (min) | Speedup | Efficiency |
|---|---|---|---|
| 1 | 480 | 1 | 100% |
| 4 | 125 | 3.84 | 96% |
| 8 | 65 | 7.38 | 92% |
| 16 | 35 | 13.7 | 86% |

**Why efficiency drops:**

1. **AllReduce overhead:** 8 GPUs = 3x more AllReduce time
2. **Network saturation:** Gradient synchronization bottlenecks
3. **Imbalance:** Some workers are slower, others wait at synchronization barriers

**At 16 GPUs, efficiency is 86%** because AllReduce takes ~5-10% of total time.

### Weak Scaling: Increasing Problem Size with GPUs

**Definition:** How does training time scale when you increase data size with GPUs?

**Formula:**

```
Ideal: Time remains constant as data ÷ GPUs
Reality: Time increases slightly due to AllReduce (independent of data size)
```

**Real example:**

| GPUs | Data per GPU | Total Batch | Time (min) | Efficiency |
|---|---|---|---|---|
| 1 | 256 | 256 | 120 | 100% |
| 4 | 256 | 1024 | 122 | 98% |
| 8 | 256 | 2048 | 125 | 96% |
| 16 | 256 | 4096 | 130 | 92% |

**Time increases slightly** because AllReduce time is constant regardless of batch size. At 1 GPU, no AllReduce. At 16 GPUs, AllReduce = 10 min out of 130 min = ~8% overhead.

## Interview Questions

### Question 1: Designing an AllReduce Algorithm

**Scenario:** "You have 16 GPUs across 4 nodes (4 per node). Design an AllReduce algorithm optimized for this topology. What's the communication pattern?"

**Model Answer (4 minutes):**

"The topology is critical. Let me exploit it in two stages:

**Stage 1: Reduce within each node (NVLink, 600 GB/s)**

Nodes:
```
Node 0: GPUs 0,1,2,3 (connected via NVLink)
Node 1: GPUs 4,5,6,7
Node 2: GPUs 8,9,10,11
Node 3: GPUs 12,13,14,15
```

Within each node, use a binary tree:
```
GPU 0     GPU 1     GPU 2     GPU 3
  \       /           \       /
   \     /             \     /
    GPU 0a          GPU 2a (imaginary intermediate nodes)
      \               /
       \             /
         GPU 0 (final reduce)
```

Actually, simpler: use GPU 0 on each node as the reducer. The other 3 GPUs send to GPU 0. Time: 3 transfers × 1 GB at 600 GB/s = 5 ms.

**Stage 2: AllReduce among node leaders (Inter-node, 25 GB/s)**

Now we have 4 leaders (GPU 0 from each node) that need to AllReduce. At 4 GPUs over 200 Gbps links, using a correctly-chunked ring: total data moved per leader ≈ 2 × (4-1)/4 × 1 GB = 1.5 GB.
- Use ring AllReduce
- Time: 1.5 GB ÷ 25 GB/s ≈ **60 ms**

**Stage 3: Broadcast back within nodes (25 ms)**

Leaders broadcast results to their respective node GPUs using NVLink tree.

**Total:** 5 + 60 + 25 = **90 ms**

**Why this works:**
- Stages 1 and 3 use fast intra-node NVLink (600 GB/s)
- Stage 2 uses ring for inter-node (bandwidth-optimal)
- No GPU is idle waiting for network

**Alternative (not recommended):**

If I ignored topology and did naive all-to-all:
- Each GPU sends to every other GPU: 16 × 15 messages
- Over 25 GB/s inter-node links (only 2 links per node): massive congestion
- Time: >> 1 second

**Lesson:** Topology awareness is critical. Exploit hierarchy."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Intra-node vs. inter-node bandwidth | 600 GB/s NVLink vs. 25 GB/s Ethernet → use hierarchically |
| Topology-aware scheduling | Minimize inter-node traffic; maximize NVLink usage |
| Ring vs. tree trade-offs | Ring saturates bandwidth. Tree minimizes latency. |
| Load balancing | All GPUs should send/receive simultaneously to avoid idle time |

**Follow-up Trap:** "Why not just use NCCl's AllReduce directly?"

**Corrective answer:** "NCCL automatically detects topology and uses near-optimal algorithms. But for an interview, I'm explaining the design. In production, NCCL does this."

**Verification Point:** Can the candidate design a communication schedule for a given topology? Do they understand bandwidth vs. latency trade-offs?

---

### Question 2: Gradient Compression and Communication Overhead

**Scenario:** "You're training a 70B parameter LLM on 256 GPUs. Each gradient synchronization sends 70B × 2 bytes (FP16) = 140 GB. Your network has 25 GB/s per GPU link. At what frequency can you synchronize? What if you use gradient compression (e.g., 8-bit quantization) to reduce traffic 4×?"

**Model Answer (3 minutes):**

"Let's calculate:

**Without compression:**
- Gradient size: 140 GB
- Network link: 25 GB/s per GPU
- AllReduce time (ring, 256 GPUs): ~2 × 256 × 140 GB ÷ (25 × 256) = 2 × 140 ÷ 25 = 11.2 seconds

Wait, that's not right. Let me recalculate. In ring AllReduce with 256 GPUs:
- Each rank sends/receives 2 × (N-1) segments
- For 140 GB total, each segment is 140 GB ÷ 256
- Time: 2 × (256 - 1) × (140 ÷ 256) ÷ 25 = 2 × 255 × 0.547 ÷ 25 ≈ 11.2 seconds

**With 8-bit quantization:**
- Gradient size: 140 GB ÷ 2 = 70 GB
- AllReduce time: 2 × 255 × (70 ÷ 256) ÷ 25 ≈ 5.6 seconds
- Quantization overhead (dequantization): ~10 ms (on GPU)
- Total: ~5.6 seconds

**Frequency analysis:**

Without compression:
- Sync time: 11.2 seconds
- Typical iteration time: 10 seconds (forward + backward)
- Total: 21.2 seconds per iteration
- Communication ÷ compute ratio: 11.2 ÷ 10 = **1.12 (communication is larger!)**

With compression:
- Sync time: 5.6 seconds
- Total: 15.6 seconds per iteration
- Ratio: 5.6 ÷ 10 = **0.56 (communication is 56% of compute)**

**Impact on throughput:**

Without compression: 256 GPUs, 21.2 seconds/iteration = ~12 iterations/min
With compression: 256 GPUs, 15.6 seconds/iteration = ~15 iterations/min

**Effective speedup from compression: ~25% throughput improvement**

But there's a cost: 8-bit quantization can hurt model accuracy. The quantization error accumulates over training. Typical impact: final accuracy drops 0.1-0.5% on large models.

**Trade-off:** Faster training × more iterations, but slightly lower accuracy. Often worth it."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Communication time = bottleneck at scale | 256 GPUs: 11 seconds to sync, 10 seconds to compute |
| Gradient compression | Reduces traffic at cost of quantization error |
| Synchronous training trade-off | Faster sync vs. accuracy (especially with aggressive compression) |
| Scaling limits | At some point, communication dominates. Compression buys you more scale. |

**Follow-up Trap:** "If I reduce precision to 4-bit, can I get 2× speedup?"

**Corrective answer:** "Not quite. Ring AllReduce scales linearly with gradient size, but your compute still produces FP16 or FP32 gradients. Converting to 4-bit adds overhead, and quantization error becomes severe. Practical limit is 8-bit (lossless, ~0.1% accuracy drop). Beyond that, diminishing returns."

**Verification Point:** Can the candidate calculate AllReduce time and estimate communication bottlenecks?

---

### Question 3: Scaling Efficiency Diagnosis

**Scenario:** "You run ResNet-50 training on 8 A100s. On 1 GPU: 60 images/sec. On 8 GPUs: 350 images/sec (not 480). What's causing the loss of efficiency?"

**Model Answer (2.5 minutes):**

"Ideal scaling: 60 × 8 = 480 images/sec
Actual: 350 images/sec
Efficiency: 350 ÷ 480 = 73%

Let's diagnose:

**Calculation breakdown:**

1 GPU:
- Forward: ~80% of time
- Backward: ~20% of time
- No communication

8 GPUs:
- Forward: ~70% (slightly more due to overhead)
- Backward + AllReduce: ~30% (20% backward + 10% AllReduce)

Total efficiency loss = 1 - 0.73 = **27 percentage points**. The 10% AllReduce overhead only explains a fraction of that 27% — so something else is contributing the rest.

**Likely issues:**

1. **Load imbalance:** One GPU is slower. Everyone waits at AllReduce barrier. Loss: ~5-10%
2. **GPU memory pressure:** Using > 40GB per GPU causes spilling to CPU/NVMe. Loss: ~10-15%
3. **Network contention:** Multiple AllReduces (gradients, batch norm) interfere. Loss: ~5%
4. **Suboptimal kernel fusion:** Some operations not fused. Loss: ~2-3%

**Total:** ~22-33% loss matches observed 27% loss.

**Diagnosis approach:**

```bash
# Check GPU utilization
nvidia-smi dmon  # Look for uneven utilization

# Check network traffic
nccl-tests  # Benchmark AllReduce time

# Check memory usage
nvidia-smi  # Is any GPU using > 40GB?

# Check kernel efficiency
nsys profile --trace cuda,nvtx  # Look for gaps between kernels
```

**Most likely culprit:** GPU memory pressure or network contention from multiple AllReduces.

**Fixes (in order of impact):**

1. **Reduce per-GPU batch size** (if memory-bound) → frees bandwidth
2. **Fuse batch norm with backward** → reduces AllReduce count
3. **Overlap AllReduce with backward** → hides communication latency
4. **Check network topology** → may need to optimize NCCL algorithm

Expected improvement: ~15-20% (takes efficiency from 73% to 88-93%)"

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Efficiency loss = communication + load imbalance + overhead | Must diagnose which factor dominates |
| AllReduce time measurement | Benchmark with NCCL tests to isolate network vs. compute |
| GPU memory vs. throughput | Memory pressure reduces throughput more than AllReduce overhead |
| Overlapping communication | Can hide AllReduce in backward computation time |

**Follow-up Trap:** "Can't I just add more GPUs and the problem goes away?"

**Corrective answer:** "No. More GPUs make AllReduce MORE expensive (logarithmically). You'd see efficiency drop further (maybe 50-60% at 64 GPUs). You need to fix the root cause first."

**Verification Point:** Can the candidate calculate efficiency, identify the bottleneck, and propose targeted fixes?

## Optimization Checklist

- [ ] Understand AllReduce algorithms (tree, ring, hierarchical)?
- [ ] Calculate AllReduce time for a given gradient size and network?
- [ ] Analyze strong and weak scaling for a model?
- [ ] Design topology-aware communication schedules?
- [ ] Estimate gradient compression impact on accuracy and speed?
- [ ] Diagnose scaling bottlenecks from performance data?

## Related Chapters

- **Chapter 4:** [Observability and Monitoring](./chapter-04-observability-and-monitoring.md) — profiling distributed training
- **Chapter 10:** [System Design: Training Cluster](./chapter-10-system-design-training-cluster.md) — end-to-end architecture
- **Volume 21:** AI Factory (reference architectures)

