# Chapter 2: CUDA Programming and Optimization

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Intermediate |
| Estimated reading time | 70 minutes |
| Primary audience | CUDA developers, performance engineers |
| Core question | How do you design efficient kernels? What patterns maximize GPU performance? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Design kernels with register pressure in mind
- Optimize shared memory access patterns and avoid bank conflicts
- Calculate and improve occupancy
- Implement efficient tiling strategies for data reuse
- Diagnose performance using NVIDIA Nsight Compute
- Apply kernel fusion and asynchronous patterns

## Kernel Design Fundamentals

### Register Pressure and Occupancy Calculation

Every variable you declare in a kernel kernel costs registers. **Register pressure** directly limits occupancy.

**Example 1: Low register pressure**

```cuda
__global__ void low_pressure(float *data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        float x = data[idx];  // 1 register
        float y = x * 2.0f;   // reused; might share register
        data[idx] = y;
    }
}
// Registers per thread: 4
// A100 limit: 255KB ÷ (4 registers × 4 bytes) = 16K threads possible
// At 32 threads per warp: 16K ÷ 32 = 500 warps possible (but max is 64 per SM)
// Occupancy: 64 ÷ 64 = 100%
```

**Example 2: High register pressure**

```cuda
__global__ void high_pressure(float *data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        // Unroll some computation
        float x0 = data[idx];
        float x1 = data[idx + n];
        float x2 = data[idx + 2*n];
        float x3 = data[idx + 3*n];
        
        float y0 = x0 * x0 + 1.0f;
        float y1 = x1 * x1 + 2.0f;
        float y2 = x2 * x2 + 3.0f;
        float y3 = x3 * x3 + 4.0f;
        
        float sum = y0 + y1 + y2 + y3;
        data[idx] = sum;
    }
}
// Registers per thread: ~20 (x0-x3, y0-y3, sum, temporaries)
// A100 limit: 255KB ÷ (20 registers × 4 bytes) = 3.2K threads
// At 32 threads per warp: 3.2K ÷ 32 = 100 warps possible
// But SM max is 64 warps, so we hit the SM limit first
// Occupancy: min(64, 100) ÷ 64 = 100%
// BUT now blocks won't fit as many per SM due to register usage
```

**Real occupancy impact:**

When register pressure increases, fewer blocks can fit on the same SM. Even if peak warps theoretically fit, the block scheduling becomes the limiting factor.

### Shared Memory Efficiency and Bank Conflicts

Shared memory is **32 banks**. Each bank can serve one access per cycle. If multiple threads in a warp access the same bank, only one succeeds per cycle—others stall.

**Example 1: No bank conflicts**

```cuda
__global__ void no_conflicts(float *data) {
    __shared__ float smem[1024];
    int tid = threadIdx.x;  // 0-31 (one warp)
    
    // Each thread reads from a different bank
    // Thread 0 → bank 0, thread 1 → bank 1, ..., thread 31 → bank 31
    float val = smem[tid];  // 1 cycle per warp
}
```

**Example 2: Bank conflicts (bad)**

```cuda
__global__ void bank_conflicts(float *data) {
    __shared__ float smem[1024];
    int tid = threadIdx.x;
    
    // Each thread reads from the same bank!
    // All 32 threads want bank 0
    float val = smem[0];  // 32 cycles per warp (serialized!)
}
```

**Example 3: Stride-based access (common mistake)**

```cuda
__global__ void stride_conflict(float *data) {
    __shared__ float smem[1024];
    int tid = threadIdx.x;
    
    // Stride of 2: threads 0, 2, 4, ... all map to banks 0, 2, 4, ...
    // But with 32 threads and 32 banks, this causes 2-way conflicts
    float val = smem[tid * 2];  // 2 cycles per warp (2-way conflict)
}
```

**Bank conflict resolution:**
- Read consecutive elements (stride 1) → no conflicts
- If you must stride, pad the shared memory to avoid aliasing
- Use `__shared__ float smem[1024 + 1]` padding to break conflicts

### Occupancy Calculation Example

**Given:**
- Kernel uses 32 registers per thread
- Kernel uses 4 KB shared memory per block
- Block size: 256 threads (8 warps)
- SM: 255 KB registers, 96 KB shared memory (A100)

**Calculate occupancy:**

1. **Registers per block:** 32 registers/thread × 256 threads = 8,192 registers
2. **Max blocks limited by registers:** 255 KB ÷ 8 KB = 31 blocks
3. **Max blocks limited by shared:** 96 KB ÷ 4 KB = 24 blocks
4. **Actual max blocks:** min(31, 24) = **24 blocks per SM**
5. **Warps per block:** 256 threads ÷ 32 = 8 warps
6. **Total warps per SM:** 24 blocks × 8 warps = **192 warps**
7. **SM warp limit:** 64 warps maximum
8. **Occupancy:** min(192, 64) ÷ 64 = **100%**

**Wait, that doesn't make sense. Let me recalculate:**

Actually, the SM can only hold 64 warps total (not 192). So the limiting factor is:
- **Max blocks per SM** (from shared + registers) = 24 blocks
- **Warps per block** = 8
- **Total warps** = 24 × 8 = 192, but capped at 64 by hardware
- **Actual blocks per SM** = 64 ÷ 8 = 8 blocks (not 24)
- **Occupancy** = (8 blocks × 8 warps) ÷ 64 = 64 ÷ 64 = **100%**

The lesson: reducing register count or shared memory doesn't help if you're already limited by the 64-warp max. It helps only if you want to fit more blocks simultaneously.

## Tiling and Data Reuse

Matrix multiplication is the canonical example of using tiling to improve data reuse.

**Naive approach (no tiling):**

```cuda
// C = A × B
// Each thread computes one element of C
__global__ void matmul_naive(float *A, float *B, float *C, int n) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    
    if (row < n && col < n) {
        float sum = 0;
        for (int k = 0; k < n; k++) {
            sum += A[row * n + k] * B[k * n + col];
        }
        C[row * n + col] = sum;
    }
}
// Memory traffic: n² (for C) + n³ (for A) + n³ (for B) = 2n³ + n² loads
// For n=1024: ~2 billion loads for 1 billion FLOPs
// Arithmetic intensity: 1 FLOP ÷ 2 bytes ≈ 0.5 FLOP/byte (memory-bound)
```

**Tiled approach (with shared memory):**

```cuda
#define TILE_SIZE 32

__global__ void matmul_tiled(float *A, float *B, float *C, int n) {
    __shared__ float As[TILE_SIZE][TILE_SIZE];
    __shared__ float Bs[TILE_SIZE][TILE_SIZE];
    
    int row = blockIdx.y * TILE_SIZE + threadIdx.y;
    int col = blockIdx.x * TILE_SIZE + threadIdx.x;
    float sum = 0;
    
    // Process in tiles
    for (int tile = 0; tile < n / TILE_SIZE; tile++) {
        // Load tiles into shared memory
        As[threadIdx.y][threadIdx.x] = A[row * n + (tile * TILE_SIZE + threadIdx.x)];
        Bs[threadIdx.y][threadIdx.x] = B[(tile * TILE_SIZE + threadIdx.y) * n + col];
        __syncthreads();
        
        // Compute using shared memory (much faster!)
        for (int k = 0; k < TILE_SIZE; k++) {
            sum += As[threadIdx.y][k] * Bs[k][threadIdx.x];
        }
        __syncthreads();
    }
    
    C[row * n + col] = sum;
}
// Memory traffic: n² (loads) × (number of tiles) = n² × (n / TILE_SIZE) = n³ / TILE_SIZE
// For n=1024, TILE_SIZE=32: ~32 × 10⁹ loads (vs. 2 × 10⁹ in naive)
// Wait, that's more! But the key is—shared memory is 30× faster than global.
// Global bandwidth: 2 TB/s. Shared: can sustain ~60 TB/s effective (if no conflicts).
// So even with more loads, throughput is much higher.
// Arithmetic intensity: TILE_SIZE FLOP/byte ≈ 32 FLOP/byte (compute-bound!)
```

**Key insight:** Tiling trades global memory bandwidth for shared memory bandwidth (which is orders of magnitude faster). This shifts the kernel from memory-bound to compute-bound.

## Interview Questions

### Question 1: Register Pressure and Occupancy Trade-off

**Scenario:** "You have a kernel with block size 256. Current register usage is 64 per thread. Occupancy is 50%. You want to improve occupancy. What are your options?"

**Model Answer (3 minutes):**

"First, let's understand why occupancy is 50%. At 64 registers per thread and 256 threads per block:
- Register usage per block = 64 × 256 = 16,384 registers
- A100 has 255 KB = 261,120 registers per SM
- Blocks per SM limited by registers = 261,120 ÷ 16,384 = ~16 blocks
- Warps per block = 256 ÷ 32 = 8
- Total warps = 16 × 8 = 128, but capped at 64
- Actual blocks per SM = 64 ÷ 8 = 8 blocks
- Occupancy = 8 ÷ 16 = 50%

So the SM register budget supports 16 blocks theoretically, but hardware caps at 64 warps, so only 8 blocks fit. That's the bottleneck.

**Option 1: Reduce register pressure**
- Rewrite kernel to use 32 registers per thread (instead of 64)
- Per-block usage: 32 × 256 = 8,192 registers
- Blocks per SM: 261,120 ÷ 8,192 = ~32 blocks
- Actual blocks per SM: 64 ÷ 8 = 8 blocks (still capped by warp limit)
- Occupancy: still 50%

This doesn't help! We're limited by the 64-warp hardware limit, not registers.

**Option 2: Reduce block size**
- If I use block size 128 (instead of 256):
- Warps per block = 128 ÷ 32 = 4
- Register usage per block = 64 × 128 = 8,192
- Blocks per SM = 261,120 ÷ 8,192 = ~32 blocks
- Total warps = 32 × 4 = 128, capped at 64
- Actual blocks per SM = 64 ÷ 4 = 16 blocks
- Occupancy = (16 × 4) ÷ 64 = 64 ÷ 64 = **100%**

This works! By reducing block size, I fit more blocks on the SM, achieving 100% occupancy.

**Tradeoff:** Smaller blocks might reduce parallelism within a block, but you get more block-level parallelism. For this kernel, it's a win.

**Option 3: Reduce shared memory**
- If shared memory is the constraint (not registers), reduce it and you can fit more blocks.
- But in this example, registers are the constraint, so this doesn't help.

**Practical recommendation:** Try Option 2. Reduce block size from 256 to 128, test performance. If it improves (due to better occupancy), keep it. If it degrades (due to lost block-level parallelism), revert."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Register budget per SM | Finite. More registers per thread → fewer blocks/warps per SM |
| Warp limit (64 per SM) | Hard limit. Can't exceed it. Blocks must fit within this |
| Block size vs. occupancy | Smaller blocks allow more blocks per SM (up to the 64-warp limit) |
| Diminishing returns | Once you're at 100% occupancy, reducing further doesn't help |

**Follow-up Trap:** "If I reduce registers, I save space. Can't I use that space for more blocks?"

**Corrective answer:** "Only if you're not already limited by the 64-warp hardware cap. In this example, we're limited by warps, not registers, so reducing registers doesn't help. But if you had a kernel with fewer blocks and plenty of register headroom, reducing block size could unlock more blocks."

**Verification Point:** Can the candidate calculate occupancy from register count, block size, and SM specs? Do they understand the hardware limits vs. the resource limits?

---

### Question 2: Shared Memory Bank Conflicts

**Scenario:** "Your kernel accesses shared memory with a pattern like `smem[threadIdx.x * stride]` where `stride = 3`. How many bank conflicts do you have? How would you fix it?"

**Model Answer (2.5 minutes):**

"Shared memory has 32 banks. Thread 0 accesses `smem[0]` (bank 0), thread 1 accesses `smem[3]` (bank 3), thread 2 accesses `smem[6]` (bank 6), etc.

Since stride = 3 and there are 32 banks, the pattern is:
- Thread 0 → bank 0
- Thread 1 → bank 3
- Thread 2 → bank 6
- Thread 3 → bank 9
- ...
- Thread 11 → bank 1 (33 mod 32 = 1)
- Thread 12 → bank 4 (36 mod 32 = 4)

With stride 3 and 32 banks (gcd(3, 32) = 1), the banks distribute evenly. Let me recalculate:

The 32 threads access banks 0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 2, 5, 8, 11, 14, 17, 20, 23, 26, 29.

That's all 32 banks with no repeats. So **no conflicts!**

Actually, wait. Let me recount more carefully. With stride 3:
- Threads 0-31 access indices 0, 3, 6, ..., 93
- 93 mod 32 = 29
- So we access banks 0, 3, 6, 9, ..., 29, 0, 3, ...

Hmm, thread 11 accesses index 33, which is bank 1. Thread 12 accesses index 36, which is bank 4. Let me just compute which threads map to which banks:

Actually, since gcd(stride, 32) = gcd(3, 32) = 1, the access pattern **cycles through all 32 banks** before repeating. So each warp of 32 threads hits each bank exactly once. **No conflicts.**

**But if stride = 2:**
- Threads 0-31 access banks 0, 2, 4, ..., 62 mod 32 = 0, 2, 4, ..., 30, 0, 2, 4, ..., 30
- Even-numbered banks are hit twice, odd banks not hit
- That's 2-way conflicts

**How to fix stride-based conflicts:**

Option 1: **Pad the array**
```cuda
__shared__ float smem[33];  // 33 instead of 32
// Now stride through 33 instead of 32
// Accessing indices 0, 3, 6, ..., stride through banks differently
```

Option 2: **Transpose or reorganize**
```cuda
// If you need stride access anyway, rethink the algorithm
// Often, restructuring to access row-major or column-major helps
```

Option 3: **Stride = 1 (sequential access)**
```cuda
// Best case: no conflicts
float val = smem[threadIdx.x];  // Thread i accesses bank i
```

**Practical recommendation:** Use sequential access (stride = 1) whenever possible. If you must stride, use padding or accept the conflict cost."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| 32 banks | One per thread in a warp (in the ideal case) |
| gcd(stride, 32) | Determines how many distinct banks are accessed |
| Padding | Breaks the stride pattern and reduces conflicts |
| Coalescing in shared memory | Different from global memory; it's about banks, not cache lines |

**Follow-up Trap:** "Does the bank conflict matter if I'm not limited by memory bandwidth?"

**Corrective answer:** "Technically no—if your kernel is compute-bound, bank conflicts don't hurt. But they're a sign of suboptimal memory access, and they reduce potential bandwidth. It's good practice to avoid them."

**Verification Point:** Can the candidate calculate which banks are accessed for a given stride and predict conflicts?

---

### Question 3: Matrix Multiplication Tiling and Arithmetic Intensity

**Scenario:** "Explain why tiling improves matrix multiplication performance. What's the arithmetic intensity with and without tiling?"

**Model Answer (3 minutes):**

"Matrix multiplication is an excellent example of how tiling improves data reuse.

**Naive approach (no tiling):**

Each thread computes one element of C. For C[i, j], it loads row i of A (n floats) and column j of B (n floats).

Global memory traffic per thread:
- Load A: n × 4 bytes
- Load B: n × 4 bytes
- Store C: 4 bytes
- Total: 8n + 4 bytes per element

For an n × n matrix:
- Total loads: n² threads × (8n + 4) bytes = 8n³ + 4n² bytes
- Total FLOPs: n³ (one multiply-add per element, over n elements)
- Arithmetic intensity: n³ ÷ (8n³ + 4n²) ≈ 1 ÷ 8 = **0.125 FLOP/byte**

On a 2 TB/s GPU: achievable throughput = 0.125 × 2 = **250 TFLOPS**

**With tiling (TILE_SIZE = 32):**

Now, threads cooperatively load tiles of size 32 × 32. Each thread loads one element of the tile.

Per tile:
- Load As tile: 32 × 32 × 4 = 4 KB from global (loaded once)
- Load Bs tile: 32 × 32 × 4 = 4 KB from global (loaded once)
- These tiles are reused 32 times (for the 32 × 32 result tile)

Effective global memory traffic per result tile:
- Load A: 4 KB (amortized over 32 × 32 = 1024 elements)
- Load B: 4 KB
- Store C: 4 KB
- Total: 12 KB per 1024 elements = 12 bytes per element

Wait, that can't be right. Let me recalculate:

Total computation per tile: 32 × 32 × 32 = 32,768 FLOPs (multiply-add per element × tiles)

Global memory traffic for one tile pair (As and Bs):
- Load As: 32 × 32 × 4 = 4 KB
- Load Bs: 32 × 32 × 4 = 4 KB
- Total: 8 KB per tile

But the computation inside the tile loop is 32 × 32 × 32 = 32,768 FLOPs.

Arithmetic intensity: 32,768 FLOPs ÷ (8 × 1024 bytes) = 32,768 ÷ 8192 = **4 FLOP/byte**

That's 32× better than naive!

On a 2 TB/s GPU: achievable throughput = 4 × 2 = **8,000 TFLOPS** (compute-bound instead of memory-bound)

**Key insight:** By reusing data in shared memory, we increase the compute-to-memory ratio from 0.125 to 4. This shifts the bottleneck from memory to compute."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Arithmetic intensity | Determines if kernel is compute- or memory-bound |
| Data reuse | Tiling amortizes global memory loads across many operations |
| Shared memory as cache | Acts as a fast, software-managed cache |
| Tile size trade-off | Larger tiles = better arithmetic intensity but more shared memory pressure |

**Follow-up Trap:** "If tiling is so good, why not use larger tiles?"

**Corrective answer:** "Shared memory is limited (96 KB per SM). A 64 × 64 tile = 16 KB (for one matrix). Tiling two matrices (As and Bs) = 32 KB. Beyond that, you start reducing occupancy. Also, larger tiles mean more threads synchronizing, which can reduce parallelism."

**Verification Point:** Can the candidate calculate arithmetic intensity and explain why it improves with tiling?

---

### Question 4: Kernel Fusion and Asynchronous Patterns

**Scenario:** "You have two kernels: kernel A reads data, processes it, and writes intermediate results. Kernel B reads the intermediate results and produces the final output. Each kernel is bandwidth-bound. How would you optimize this?"

**Model Answer (2.5 minutes):**

"This is a classic pipeline bottleneck. The issue is that kernel A writes results to global memory, kernel B reads them back. That's redundant bandwidth.

**Optimization: Kernel Fusion**

Combine both kernels into one:

```cuda
__global__ void fused_kernel(float *input, float *output, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    
    if (idx < n) {
        float temp = process_a(input[idx]);  // Kernel A logic
        float result = process_b(temp);      // Kernel B logic
        output[idx] = result;
    }
}
```

**Benefits:**
- Intermediate `temp` stays in registers (not global memory)
- Memory traffic is reduced: input (n) + output (n) instead of input (n) + intermediate (n) + output (n)
- Bandwidth savings: 50% reduction

**Alternative: Asynchronous Copy (for data-loading patterns)**

If kernel A is data loading and kernel B is processing, use `cuda::pipeline` to overlap:

```cuda
__global__ void async_kernel(float *input, float *output, int n) {
    __shared__ float tile[TILE_SIZE];
    
    for (int tile_id = 0; tile_id < n / TILE_SIZE; tile_id++) {
        // Start async copy for next tile
        if (tile_id < n / TILE_SIZE - 1) {
            __pipeline_memcpy_async(&tile_next, &input[(tile_id+1)*TILE_SIZE], TILE_SIZE*4);
        }
        
        // Process current tile while copy happens
        __syncthreads();
        for (int i = threadIdx.x; i < TILE_SIZE; i += blockDim.x) {
            output[tile_id*TILE_SIZE + i] = process(tile[i]);
        }
        __pipeline_commit();
    }
}
```

**Benefits:**
- Overlaps memory copy with computation
- No explicit synchronization; kernel manages pipelining
- Achieves better throughput when compute and memory are balanced

**When to use which:**

| Situation | Recommendation |
|---|---|
| Two kernels with bandwidth bottleneck | Fuse them |
| Data loading followed by compute | Use async copy |
| Three or more dependent kernels | Fuse critical path, launch others asynchronously |
| Kernels have different resource needs | Keep separate to avoid occupancy cliffs |

**Practical example:** Image filtering (load, blur, store). Fusing saves ~30% bandwidth."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Kernel launch overhead | Each launch has ~µs overhead; fusing saves overhead |
| Memory bandwidth limited | Avoiding redundant memory transfers is critical |
| Register vs. global memory | Data in registers is free; data in global costs bandwidth |
| Pipeline parallelism | Overlapping load-compute-store improves throughput |

**Follow-up Trap:** "If I fuse kernels, does occupancy improve?"

**Corrective answer:** "Not necessarily. Fused kernels might have higher register pressure (combining both kernels' register usage). They might actually have lower occupancy. But they win on bandwidth, which is more valuable."

**Verification Point:** Can the candidate identify where to fuse kernels and estimate bandwidth savings? Do they understand the memory hierarchy and redundancy?

---

### Question 5: Identifying and Optimizing Memory Bottlenecks

**Scenario:** "You profile a kernel with nvidia-smi and see: 60% SM utilization, 90% L1 hit rate, 30% L2 hit rate, 40% HBM bandwidth utilization. What's the bottleneck? How do you fix it?"

**Model Answer (3 minutes):**

"Let me analyze each metric:

**SM utilization: 60%** → SMs are underutilized. Either occupancy is low, or threads are stalled waiting for memory.

**L1 hit rate: 90%** → Good spatial locality. L1 is doing its job.

**L2 hit rate: 30%** → Low. Most L1 misses don't find data in L2. They go to HBM.

**HBM bandwidth: 40%** → We're using less than half the available bandwidth. This is suspicious.

**Diagnosis:**

The kernel is **latency-bound**, not bandwidth-bound. Here's why:

1. High L1 hit rate suggests good access patterns
2. Low L2 hit means data isn't reusing between blocks
3. 40% HBM bandwidth should be plenty if this were a bandwidth-bound kernel
4. Low SM utilization suggests threads are stalling on something

The likely culprit: **Memory latency is stalling warps, and we don't have enough other warps to hide it.**

**Proof:** If HBM bandwidth is 40% of peak and latency is hiding poorly, that means warps are waiting for loads to complete instead of switching to other work.

**Fixes:**

**Option 1: Increase occupancy**
- Reduce register pressure or shared memory per block
- Goal: Get more warps active so they can hide latency
- Expected improvement: +30% performance (more warps = more latency hiding)

**Option 2: Improve data reuse**
- Add tiling to increase arithmetic intensity
- Goal: Increase FLOP per byte, reducing effective latency
- Expected improvement: +50% (fewer memory requests = less latency pressure)

**Option 3: Use asynchronous copies**
- Load data with `__pipeline_memcpy_async` while computing on other data
- Goal: Overlap memory with compute
- Expected improvement: +20% (depends on balance of load vs. compute)

**Recommended order:** Try Option 1 first (lowest effort). Then Option 2 if it doesn't saturate bandwidth."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Latency vs. bandwidth bottleneck | Different solutions. Latency: increase warps. Bandwidth: reduce traffic. |
| Hit rates as diagnostic signals | High L1 but low L2 = data isn't reused between blocks |
| SM utilization vs. bandwidth | Both matter. 60% + 40% bandwidth = latency-bound |
| Occupancy vs. throughput | You need occupancy to hide latency, but it's not sufficient |

**Follow-up Trap:** "Can't I just increase clock speed to reduce latency?"

**Corrective answer:** "No. Memory latency is fixed by physics (signal propagation time in HBM, cache miss rate). Clock speed doesn't change it. You hide latency by having more warps, not by speeding up the processor."

**Verification Point:** Can the candidate read profiling data and diagnose bottlenecks? Do they understand the difference between latency- and bandwidth-bound kernels?

## Optimization Checklist

Before claiming mastery:

- [ ] Calculate register usage and occupancy from code?
- [ ] Predict bank conflicts from shared memory access patterns?
- [ ] Design tiling strategies for compute-heavy kernels?
- [ ] Identify kernel fusion opportunities?
- [ ] Read nvidia-smi / Nsight Compute output and diagnose bottlenecks?
- [ ] Apply occupancy calculator accurately?

## Summary

CUDA optimization is a systematic process:

1. **Measure:** Profile with nvidia-smi and Nsight Compute
2. **Diagnose:** Is it compute-bound, memory-bound, or latency-bound?
3. **Optimize:** Apply the right fix (reduce registers, tile, fuse, async copy)
4. **Repeat:** Re-profile and validate

The interviews test your ability to apply this process and explain the tradeoffs.

## Related Chapters

- **Chapter 1:** [GPU Architecture Deep Dive](./chapter-01-gpu-architecture-deep-dive.md) — execution model foundations
- **Chapter 5:** [Performance Analysis and Troubleshooting](./chapter-05-performance-analysis-and-troubleshooting.md) — roofline model
- **Volume 07:** CUDA programming patterns
- **Lab (V24):** Hands-on kernel optimization exercises

