# Chapter 1: GPU Architecture Deep Dive

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Intermediate |
| Estimated reading time | 60 minutes |
| Primary audience | GPU systems engineers, CUDA developers, performance analysts |
| Core question | How does GPU hardware execute kernels? What limits performance? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Explain SM execution model, warps, and thread scheduling
- Understand memory hierarchy trade-offs (register, shared, L2, global)
- Diagnose occupancy bottlenecks using profiler data
- Identify memory bandwidth vs. compute constraints
- Explain latency hiding and how it enables high GPU utilization
- Design kernels with hardware execution model in mind

## The GPU Execution Model: SMs and Warps

### What Is a Streaming Multiprocessor (SM)?

A GPU is organized as a collection of **Streaming Multiprocessors (SMs)**. Each SM is a complete execution unit:

```
┌─────────────────────────────────────────────────────┐
│ GPU (e.g., A100: 108 SMs)                           │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ SM 0                                            │ │
│ │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │ │
│ │ │Warp 0│ │Warp 1│ │Warp 2│ │Warp 3│  (SMs)  │ │
│ │ └──────┘ └──────┘ └──────┘ └──────┘           │ │
│ │ ┌──────────────────────────────────────────┐   │ │
│ │ │ 64 CUDA cores per SM (A100, FP32)         │   │ │
│ │ │ Each core: 32-bit int/float               │   │ │
│ │ └──────────────────────────────────────────┘   │ │
│ │ ┌──────────────────────────────────────────┐   │ │
│ │ │ L1 Cache: 192 KB per SM                  │   │ │
│ │ │ Shared Memory: 96-192 KB per SM (config) │   │ │
│ │ └──────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SM 1                                            │ │
│ │ (identical to SM 0)                             │ │
│ └─────────────────────────────────────────────────┘ │
│ ... (106 more SMs)                                  │
│ ┌─────────────────────────────────────────────────┐ │
│ │ L2 Cache: 40 MB (shared across all SMs)        │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ HBM (High Bandwidth Memory): 40-80 GB           │ │
│ │ Bandwidth: ~2 TB/s (A100, HBM2e) /              │ │
│ │            ~3.35 TB/s (H100 SXM, HBM3)          │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Key insight:** Each SM is an independent execution unit. If your kernel launches 10 blocks and you have 108 SMs, blocks are distributed across SMs. If you launch 1000 blocks, they queue and execute in batches. The SM scheduler is greedy—it keeps SMs busy.

### What Is a Warp?

A **warp** is the fundamental scheduling unit on a GPU. A warp = **32 threads** that execute in **lockstep** (same instruction, same cycle).

**Critical constraint:** All 32 threads execute the same instruction. If threads in a warp take different code paths, they **diverge**, and the GPU serializes execution of both paths. This costs performance.

**Example of warp divergence:**

```cuda
// This kernel has BRANCH DIVERGENCE
__global__ void bad_divergence(int *data, int *result) {
    int idx = threadIdx.x;
    
    if (idx % 2 == 0) {
        // Even threads: expensive operation (100 cycles)
        result[idx] = expensive_compute(data[idx]);
    } else {
        // Odd threads: cheap operation (10 cycles)
        result[idx] = cheap_compute(data[idx]);
    }
}
```

**What happens:**
1. All 32 threads (warps don't split) execute the condition check
2. Even threads enter the `if` block, odd threads stall
3. GPU waits for even threads to finish expensive_compute (100 cycles)
4. Then odd threads execute cheap_compute
5. Total time: ~100 cycles (not 50)

**If all threads in a warp take the same path: no divergence, no stalling.**

### Thread-to-SM Mapping

When you launch a kernel with grid and block dimensions:

```cuda
kernel<<<gridDim, blockDim>>>(...)
```

- `gridDim` = number of **blocks**
- `blockDim` = number of **threads per block**
- Total threads = `gridDim × blockDim`

**Mapping:**
- Blocks are assigned to SMs by the kernel scheduler
- Threads within a block are grouped into **warps**
- If `blockDim.x = 256`, that's 8 warps (256 ÷ 32 = 8)
- All 8 warps in a block can execute on the same SM (if the SM has capacity)

**Occupancy question:** How many warps can an SM support simultaneously?

- A100 SM: up to **64 warps** (2,048 threads)
- H100 SM: up to **64 warps** (2,048 threads)
- Each additional warp takes up register and shared memory space
- If your kernel uses 64 registers per thread, you can only fit 32 warps (not 64)

## Memory Hierarchy and Latency Hiding

The GPU memory hierarchy is **deeply hierarchical**. Access latency ranges from **2 cycles** (registers) to **400+ cycles** (global memory).

```
┌──────────────────────────────────────────────┐
│ Latency Hierarchy                            │
├──────────────────────────────────────────────┤
│ Register file      2 cycles                  │
│ L1 Cache          14 cycles (best case)      │
│ L2 Cache         200 cycles                  │
│ Shared Memory    ~30 cycles                  │
│ HBM (Global)     400-800 cycles              │
└──────────────────────────────────────────────┘
```

**Key insight: Latency hiding strategy**

The GPU doesn't wait for a memory access to complete before switching to another warp. Instead:

1. Warp A issues a global memory load
2. While Warp A waits (400 cycles), the SM switches to Warp B
3. Warp B executes independent instructions
4. If you have enough warps (typically 8-16 active warps), by the time the SM gets back to Warp A, the memory has arrived

**This is why occupancy matters.** With low occupancy (few active warps), you can't hide latency.

### Real Bandwidth Example

**Problem:** You're doing matrix multiplication. You load matrix A (1000 × 1000) from global memory into shared memory, then compute.

```cuda
// Block-level tiling strategy
__global__ void matmul_tiled(float *A, float *B, float *C, int n) {
    __shared__ float As[TILE_SIZE][TILE_SIZE];  // 64×64 = 4KB
    __shared__ float Bs[TILE_SIZE][TILE_SIZE];
    
    int bx = blockIdx.x, by = blockIdx.y;
    int tx = threadIdx.x, ty = threadIdx.y;
    
    float c = 0;
    
    // Load tiles and compute
    for (int tile = 0; tile < n / TILE_SIZE; tile++) {
        // Load A tile into shared memory
        As[ty][tx] = A[(by * TILE_SIZE + ty) * n + (tile * TILE_SIZE + tx)];
        Bs[ty][tx] = B[(tile * TILE_SIZE + ty) * n + (bx * TILE_SIZE + tx)];
        __syncthreads();
        
        // Compute on shared memory (much faster!)
        for (int k = 0; k < TILE_SIZE; k++) {
            c += As[ty][k] * Bs[k][tx];
        }
        __syncthreads();
    }
    
    C[(by * TILE_SIZE + ty) * n + (bx * TILE_SIZE + tx)] = c;
}
```

**Memory access pattern:**
- Each global memory load: 400-800 cycles
- Each shared memory load: ~30 cycles
- Computing in shared memory: ~1 cycle per operation

**Why this works:** By loading into shared memory once, you reuse that data many times in compute, hiding the initial latency.

## Interview Questions

### Question 1: Explain Occupancy and How It Affects Performance

**Scenario:** "You write a kernel that uses 80 registers per thread and 4 KB of shared memory per block. On an A100 (192 KB L1/shared combined, 96 KB shared per SM configurable, 65,536 32-bit registers = 256 KB register file per SM), what's the maximum occupancy? Does higher occupancy always mean better performance?"

**Model Answer (3–4 minutes):**

"Occupancy is the percentage of hardware resources being used. On an A100, each SM has 65,536 32-bit registers — that's 256 KB of register file (65,536 × 4 bytes). If my kernel uses 80 registers per thread, and there are 32 threads per warp, that's 80 × 32 = 2,560 registers per warp.

With 65,536 registers total per SM, I can fit 65,536 ÷ 2,560 = 25.6 → **25 warps** from a register perspective (rounding down — you can't launch a fractional warp). The SM hardware cap is 64 warps, so in this case registers ARE the binding constraint, not the warp-count cap.

Shared memory: 4 KB per block. A100 SMs have 96-192 KB of shared memory (configurable). At 25 warps ≈ 3-4 blocks (depending on block size), shared memory usage is nowhere near the 96+ KB budget, so shared memory isn't the constraint here.

The limiter is **registers**: 25 warps out of a possible 64. So my occupancy is 25 ÷ 64 ≈ **39% occupancy** — well below the 100% a candidate might assume from the 64-warp headline number.

But higher occupancy doesn't always mean better performance. Here's why:

**Scenario where high occupancy hurts:**
If my kernel is doing heavy global memory accesses (e.g., loading and processing a dataset), high occupancy means more warps are all contending for the same L2 cache and HBM bandwidth. If I have 64 active warps and they're all doing uncoalesced memory accesses, I'm fragmenting the memory bus.

**Scenario where high occupancy helps:**
If my kernel has a good compute-to-memory ratio (e.g., matrix multiplication with tiling), high occupancy hides latency. While one warp waits for a load, another warp is computing.

**Practical rule:** Aim for 50-75% occupancy. High occupancy is good for compute-bound kernels, but memory-bound kernels need less occupancy if each warp is doing a lot of independent work. The sweet spot depends on the workload."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Register pressure scales with thread count | More registers per thread → fewer warps per SM |
| Shared memory is a hard limit | If you use too much, blocks can't share an SM |
| Occupancy ≠ performance | High occupancy helps latency hiding but doesn't improve bandwidth |
| Memory hierarchy matters most | If you're memory-bound, occupancy helps less than you'd think |

**Follow-up Trap 1:** "Isn't 100% occupancy always better?"

**Corrective answer:** "No. Example: if you have a kernel that does 1 load per 1000 compute cycles, you don't need many active warps—1-2 warps can hide the latency of that load. Adding more warps just burns registers and shared memory without improving performance. In fact, it might hurt, because now you're limited to fewer blocks per SM, and blocks can't start on the same SM until the first block finishes."

**Follow-up Trap 2:** "If I have 80 registers per thread and 64 warps × 32 threads, why isn't that overflowing?"

**Corrective answer:** "Let me recalculate: 80 registers/thread × 32 threads/warp × 64 warps = 163,840 registers needed to run all 64 warps simultaneously. A100 has only 65,536 registers per SM (256 KB). 163,840 is 2.5× more registers than the SM has — it does NOT fit. That confirms the earlier calculation: registers cap this kernel at 65,536 ÷ 2,560 = 25 warps, not 64. The hardware's 64-warp limit is a ceiling, not a guarantee — whichever resource (registers, shared memory, or the warp-count cap) runs out first is the actual limiter, and here it's registers."

**Verification Point:** Can the candidate calculate occupancy given register count, shared memory, and SM specs? Do they understand the difference between theoretical occupancy (registers) and practical occupancy (block placement, synchronization)?

---

### Question 2: Memory Coalescing and Global Memory Access

**Scenario:** "You have two kernels, both accessing a 1D array. One kernel accesses elements in order (thread 0 reads element 0, thread 1 reads element 1, etc.). The other accesses elements with a stride (thread 0 reads element 0, thread 1 reads element 1024, etc.). What's the performance difference? Why?"

**Model Answer (3 minutes):**

"Memory coalescing is critical for global memory bandwidth. When threads in a warp access global memory, the GPU tries to **coalesce** those accesses into the fewest possible cache line fetches.

**Case 1: Sequential access (thread 0 → element 0, thread 1 → element 1, etc.)**

All 32 threads in the warp are accessing consecutive elements. These fit into a **128-byte cache line** (32 floats × 4 bytes = 128 bytes). So one warp load = one cache line fetch from HBM. That's **perfectly coalesced**.

Bandwidth per warp: 128 bytes / 400 cycles (latency) = 0.32 bytes/cycle. Converting to a rate requires the clock: at a ~1.4 GHz clock, 0.32 bytes/cycle × 1.4×10⁹ cycles/sec ≈ **0.45 GB/s** for a single outstanding warp request — that alone is a small fraction of the GPU's 2 TB/s peak. But with many independent warps issuing loads concurrently (enough outstanding requests to keep the memory pipeline full), the aggregate achieved bandwidth across all warps can approach the full 2 TB/s peak, even though any one warp's single load looks slow in isolation.

**Case 2: Stride access (thread 0 → element 0, thread 1 → element 1024, etc.)**

Each thread accesses an element 1024 floats apart. With 32 threads in a warp, they're accessing elements spanning 32 × 1024 = 32,768 floats = 128 KB. That's 1024 separate cache lines!

Bandwidth: 128 × 1024 bytes / (400 × 1024 cycles) = much lower utilization. You need to fetch 1024 cache lines for what should be 1 coalesced fetch.

**Real impact:**
- Coalesced: One warp → 1 L2 miss, 2 TB/s bandwidth
- Strided (1024): One warp → 1024 L2 misses, ~2 MB/s effective

That's a **1000×** difference in effective bandwidth."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Cache line width (128 bytes) | Determines how many elements fit in one fetch |
| Warp size (32 threads) | A warp's access pattern determines coalescing efficiency |
| Stride patterns | Stride = 1 is perfect. Stride > cache_line_size is terrible. |
| L1 cache behavior | L1 caches per-thread, so uncoalesced accesses miss L1 and go to L2 |

**Follow-up Trap 1:** "Does shared memory have the same coalescing issue?"

**Corrective answer:** "No. Shared memory is **bank-conflicted**, not subject to coalescing. If two threads in a warp access different banks, both can load in parallel (1 cycle). If they access the same bank, one has to wait. But there's no 'coalescing' in the same sense—shared memory is fast enough that bank conflicts are the only concern."

**Follow-up Trap 2:** "If I access memory with a stride of 128 bytes (one cache line per thread), is that coalesced?"

**Corrective answer:** "Yes! Technically. Each thread accesses one cache line's worth of data, so there's no redundancy. But you're still paying 128 bytes × 32 threads = 4 KB of cache line bandwidth per warp, vs. 128 bytes if all threads accessed consecutive elements. So it's not 'wasted' bandwidth (like stride 1024), but it's not optimal coalescing."

**Verification Point:** Can the candidate explain the memory access pattern, calculate how many cache lines are fetched, and estimate the bandwidth? Do they know the cache line width and warp size?

---

### Question 3: Warp Divergence and Control Flow

**Scenario:** "You have a kernel that processes data, and every 32 threads, it checks a condition. If the condition is true (50% of the time), it does expensive work (100 cycles). If false (50%), it does cheap work (10 cycles). What's the impact on execution time?"

**Model Answer (2.5 minutes):**

"Warp divergence serializes execution paths. Here's what happens:

A warp has 32 threads. Assume threads 0-31 are one warp. They all check the condition in parallel. Let's say threads 0, 2, 4, ..., 30 (even threads) see 'true', and threads 1, 3, 5, ..., 31 (odd threads) see 'false'.

The GPU scheduler **cannot** split a warp. It has to execute both branches:

1. Execute the expensive path (100 cycles). Even threads do work. Odd threads are stalled (masked).
2. Execute the cheap path (10 cycles). Odd threads do work. Even threads are stalled.
3. Converge. Both paths finish.

Total time per warp: 100 + 10 = **110 cycles**.

If there was no divergence (all threads took the same path), it would be 100 cycles (for expensive) or 10 cycles (for cheap).

**Actual overhead:** 110 - 100 = **10 cycles wasted** on the cheaper path waiting for the expensive path.

**At scale:**
If you have 1024 threads (32 warps) and each warp has 50/50 divergence, you waste 32 warps × 10 cycles = 320 warp-cycles of total throughput."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Warps don't split | All 32 threads execute the same instruction |
| Divergence = serialization | Different paths execute back-to-back, not in parallel |
| Worst case: random divergence | If each warp has different ratios of true/false, you can't optimize one path |
| Best case: no divergence | All threads take the same path (no stalling) |

**Follow-up Trap 1:** "Can I reduce divergence by reorganizing threads?"

**Corrective answer:** "Yes! This is called **warp specialization** or **branch reorganization**. If you reorder your data so that threads doing expensive work are grouped together (warps 0-10 do expensive work, warps 11-20 do cheap work), then each warp has no internal divergence. Each warp follows one path all the way. Total time: 100 + 10 = 110 cycles still, but execution is more efficient because the hardware doesn't have to mask threads."

**Follow-up Trap 2:** "Why not just use `if-else` and let the compiler optimize it?"

**Corrective answer:** "The compiler can't eliminate divergence—it's determined at runtime by the data. What the compiler can do is avoid redundant branching. But the fundamental issue (warp serialization) is hardware-level and unavoidable. Your only options are: (1) reduce divergence by reorganizing data, (2) use `__ballot_sync()` to let threads coordinate, or (3) use predication (conditionally execute instructions without branching)."

**Verification Point:** Does the candidate understand that warp divergence serializes execution? Can they calculate the impact on latency and throughput?

---

### Question 4: Memory Bandwidth and Compute-to-Memory Ratio

**Scenario:** "You have a GPU with 2 TB/s of peak bandwidth. You're doing a 1024³ element element-wise multiplication (C = A × B). Each element is a float (4 bytes). You need to load A and B, compute, and store C. What's the achieved bandwidth? Is your kernel compute-bound or memory-bound?"

**Model Answer (3 minutes):**

"Let's calculate the memory traffic and compute:

**Memory operations:**
- Load A: 1024³ × 4 bytes = 4 GB
- Load B: 1024³ × 4 bytes = 4 GB
- Store C: 1024³ × 4 bytes = 4 GB
- **Total traffic: 12 GB** (3 reads per element)

**Compute:**
- 1024³ multiply operations = 1.074 × 10⁹ operations = ~1 GFLOP

**Roofline analysis:**
Compute-to-memory ratio = 1 GFLOP ÷ 12 GB = **0.083 FLOP/byte**

On a 2 TB/s GPU:
- Peak compute (ignoring memory): H100 FP32 (CUDA core, non-tensor, dense) ≈ 67 TFLOPS = 67 × 10¹² FLOPS. (Note: 989 TFLOPS is H100's dense FP16/BF16 **Tensor Core** peak — a different precision/execution path, not the FP32 CUDA-core number this roofline calculation should use.)
- Peak bandwidth: 2 TB/s = 2 × 10¹² bytes/sec

Memory bandwidth ceiling: 2 × 10¹² bytes/sec × 0.083 FLOP/byte = 1.66 × 10¹¹ FLOP/s = **166 GFLOPS achievable** (0.166 TFLOPS) — watch the units here, this is GFLOPS, not TFLOPS.

The kernel is **memory-bound**, and not by a little. Peak FP32 compute is 67 TFLOPS, but memory limits us to 166 GFLOPS — over 400× below the compute ceiling. The kernel will hit the memory ceiling immediately.

**What does this mean for performance?**
- Peak memory bandwidth on H100: 2 TB/s (a round number used for this example; real H100 SXM HBM3 peak is ~3.35 TB/s)
- Actual achieved bandwidth = (1024³ × 12 bytes) / (total execution time)
- If kernel achieves 80% of peak bandwidth = 1.6 TB/s = 1,600 GB/s
- Execution time = 12 GB ÷ 1,600 GB/s ≈ 0.0075 s = **7.5 milliseconds** (watch the units: dividing GB by GB/s gives seconds directly — mixing in TB/s without converting is what produces a bogus "7.5 seconds")

**Optimization strategy:**
For a memory-bound kernel, don't try to improve compute—you're already bottlenecked on memory. Instead, reduce memory traffic:
1. Use lower precision (FP16 or INT8) → half the memory
2. Use fused kernels (combine with other ops to amortize loads)
3. Use shared memory tiling (load once, use many times)

For element-wise ops, this particular kernel is hard to optimize because there's no data reuse. So accept that it's memory-bound."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Arithmetic intensity | FLOPS ÷ bytes. Low intensity = memory-bound. High intensity = compute-bound. |
| Roofline model | Combines bandwidth ceiling and compute ceiling to find bottleneck |
| Optimization strategies differ | Memory-bound: reduce traffic. Compute-bound: improve FLOPS. |
| Benchmark vs. theory | Achieved bandwidth is often 60-80% of peak (due to latency, inefficiency) |

**Follow-up Trap 1:** "Can't I just parallelize this across more GPUs?"

**Corrective answer:** "Not efficiently. Element-wise operations have no data reuse. If you split across N GPUs, you reduce total bandwidth from 2 TB/s to 2 TB/s ÷ N, and you add inter-GPU communication. Multi-GPU helps for operations with data reuse (like matrix multiply). For memory-bound element-wise ops, you're better off using a faster, wider memory (e.g., H100 instead of A100) or accepting that the kernel is latency-bound."

**Follow-up Trap 2:** "What if I use shared memory tiling?"

**Corrective answer:** "For element-wise ops, tiling doesn't help. You read each element of A and B once, do one multiply, and write C once. There's no reuse to amortize the shared memory load. Tiling helps for operations like matrix multiply where you reuse submatrix tiles."

**Verification Point:** Can the candidate calculate arithmetic intensity, apply the roofline model, and identify whether a kernel is compute-bound or memory-bound? Do they understand how to optimize each case?

---

### Question 5: Latency vs. Throughput Trade-off in Warp Scheduling

**Scenario:** "You run a kernel with 20 active warps per SM. A global memory load stalls one warp for 400 cycles. How many other warps need to be active to hide that latency?"

**Model Answer (2 minutes):**

"To hide a 400-cycle latency, you need enough other warps doing useful work while the first warp waits.

Each SM has roughly **2-3 instructions per cycle per warp** (depending on instruction type and pipeline). If a warp stalls on memory, it's taking up SM resources but not doing work.

**Calculation:**
- Latency to hide: 400 cycles
- Instructions per cycle available per warp: ~2
- Instructions needed to hide: 400 × 2 = 800 warp-instructions

If each other warp can contribute ~10 independent instructions (before its own memory access), you'd need ~80 warps.

But in practice, 20 active warps is much fewer than 80. So **you won't fully hide the latency** with 20 warps.

However, 20 is better than 1. With 1 warp, the SM is idle for 400 cycles. With 20 warps, the SM is executing ~38 warp-instructions (20 warps × 2 instructions/cycle / some overhead) out of the 400 cycles.

**Practical conclusion:**
- 20 warps is enough to keep the SM *somewhat* busy
- You could achieve maybe 40-50% utilization during memory stalls
- To get to 80%+ utilization, you'd want 40-50 active warps

This is why occupancy targets are usually 50-75%. At 20 warps (31% of max 64), you're leaving performance on the table."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Latency hiding is warp-centric | Each warp independently hides its own latency |
| Throughput during stalls | Depends on how many other warps can execute |
| Diminishing returns | Beyond ~40 active warps, gains diminish (register pressure, shared memory) |
| Occupancy ≠ latency hidden | 64 active warps doesn't mean all latencies are hidden if warps are all stalled simultaneously |

**Follow-up Trap 1:** "Does more occupancy always mean better latency hiding?"

**Corrective answer:** "No. If all warps are waiting on the same L2 cache miss, high occupancy doesn't help. You're hiding latency only if other warps are doing independent work. If your entire grid is memory-stalled on the same data, occupancy doesn't matter."

**Follow-up Trap 2:** "Can I predict occupancy from kernel characteristics?"

**Corrective answer:** "To some extent. Occupancy calculators (NVIDIA provides them) factor in register count, shared memory, and block size. But occupancy ≠ achieved throughput. You need to benchmark."

**Verification Point:** Does the candidate understand that latency hiding depends on warp independence and that occupancy is a necessary but not sufficient condition?

## Real Profiler Data Example

**Kernel:** Matrix multiplication (1024 × 1024, block size 32 × 32)

**nvidia-smi profiling output (simulated):**

```
==============================================================================
Kernel: matmul_kernel
    Registers per thread: 48
    Shared memory per block: 8192 bytes
    Block size: 32 × 32 = 1024 threads
    Grid size: 32 × 32 = 1024 blocks
    Total threads: 1,048,576
    SM count: 108 (A100)
==============================================================================

Occupancy Metrics:
    Theoretical max occupancy: 100% (all resources allow it)
    Achieved occupancy: 95% (some blocks waiting for resources)
    Active warps per SM: 56 / 64 = 87.5%
    Active blocks per SM: 1
    
Performance Counters:
    Duration: 45.3 ms
    Total threads executed: 1,048,576
    Threads per second: 23.1 billion
    
Memory Metrics:
    L1 hit rate: 85%
    L2 hit rate: 92%
    HBM bandwidth utilization: 78%
    Peak theoretical bandwidth: 2000 GB/s
    Achieved bandwidth: 1560 GB/s
    
Compute Metrics:
    TF32 Tensor Core throughput (achieved): 117 TFLOPS
    Peak theoretical (A100, TF32 Tensor Core): 156 TFLOPS
    Compute utilization: 75%
```

*(Note: this kernel is assumed to use Tensor Cores via TF32 for the matmul. A100's non-tensor FP32 CUDA-core peak is only ~19.5 TFLOPS — far too low to be relevant here. 989 TFLOPS is H100's FP16/BF16 Tensor Core peak, a different GPU and a different precision; it does not apply to this A100 example.)*

**Analysis:**
1. **Occupancy is good (87.5%)** but not perfect—some blocks are delayed waiting for resources
2. **Memory bandwidth is highly utilized (78%, 1560 of 2000 GB/s)** while compute utilization sits at 75% of Tensor Core peak — both are reasonably well saturated, consistent with a well-tiled matmul kernel that isn't leaving much on the table in either dimension
3. **L1 cache hit rate is high (85%)** → good spatial locality
4. **L2 hit rate is high (92%)** → working set mostly fits in L2

**Optimization opportunities:**
- Increase L1 hit rate by improving spatial locality in shared memory loads
- Consider using half-precision (FP16) to improve arithmetic intensity
- Ensure no thread divergence in the reduction phase

## Summary

GPU architecture is fundamentally about:
1. **Warp-level execution** (32 threads, lockstep)
2. **Occupancy** (how many warps can run simultaneously)
3. **Memory hierarchy** (registers → L1 → L2 → HBM, latency increases)
4. **Latency hiding** (keeping SMs busy while other warps wait)
5. **Coalescing** (bundling memory requests to maximize bandwidth)

The interview tests whether you understand these tradeoffs and can diagnose performance problems using them.

## Interview Verification Checklist

Before claiming mastery, can you:

- [ ] Draw an SM and explain warp scheduling?
- [ ] Calculate occupancy from register count and shared memory?
- [ ] Explain why coalescing matters and give examples?
- [ ] Identify divergence in code and estimate its cost?
- [ ] Apply the roofline model to identify compute- vs. memory-bound kernels?
- [ ] Read nvidia-smi output and diagnose bottlenecks?

## Related Chapters

- **Chapter 2:** [CUDA Programming and Optimization](./chapter-02-cuda-programming-and-optimization.md) — kernel design patterns
- **Chapter 5:** [Performance Analysis and Troubleshooting](./chapter-05-performance-analysis-and-troubleshooting.md) — roofline model deep dive
- **Volume 04:** GPU execution and memory patterns
- **Lab (V24):** Hands-on occupancy and memory optimization exercises

