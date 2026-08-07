---
title: Lab 03 — Profile Memory and Warp Efficiency
description: Use NVIDIA profiling tools to compare coalesced and strided memory access, inspect register pressure, and build a bottleneck hypothesis.
sidebar_position: 3
tags:
  - lab
  - profiling
  - memory
  - warp-efficiency
---

# Lab 03 — Profile Memory and Warp Efficiency

## Lab Metadata

| Field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Intermediate |
| Estimated time | 90–120 minutes |
| Lab level | L3 — Configuration and Measurement |
| Target platform | Linux host with an NVIDIA GPU |
| Primary tools | CUDA compiler, Nsight Compute CLI, `nvidia-smi` |

## 1. Objective

Build and profile two small CUDA kernels that perform the same logical work with different memory-access patterns. Compare execution time, memory behavior, register use, and profiler evidence before forming a bottleneck conclusion.

The lab teaches a repeatable investigation method. It does not prescribe one fixed set of metric values because counters and names vary across GPU architectures and profiler versions.

## 2. Background

A kernel can be correct and still use the GPU inefficiently. Adjacent threads that read adjacent elements usually generate fewer memory transactions than threads that read widely separated elements. A compiler can also increase register use or spill values to local memory when a kernel holds too much per-thread state.

Production engineers must be able to distinguish:

- A device that is busy from a device that is efficient
- A memory-bound kernel from a compute-bound kernel
- A coalesced access pattern from a strided pattern
- A high-register kernel from one that spills
- A profiler observation from a verified root cause

## 3. Learning Outcomes

After completing this lab, you will be able to:

- Compile and execute a CUDA microbenchmark.
- Compare contiguous and strided global-memory access.
- Capture profiler summaries with Nsight Compute CLI.
- Inspect register use and local-memory indicators.
- Compare application timing with device-level metrics.
- Write an evidence-based bottleneck statement.

## 4. Architecture

```mermaid
flowchart LR
    Host[Linux Host]
    Build["nvcc Build<br/>evidence: -Xptxas=-v<br/>registers/spill report"]
    Binary[CUDA Benchmark]
    GPU[NVIDIA GPU]
    NCU[Nsight Compute CLI]
    Report["Profiler Report<br/>evidence: hit rate,<br/>sectors/request, occupancy"]

    Host --> Build --> Binary --> GPU
    NCU --> Binary
    GPU --> NCU --> Report
    Report --> Verdict{"strided elapsed time much<br/>higher AND sectors/request<br/>much higher than contiguous?"}
    Verdict -->|"Both higher, consistently"| Confirmed["Coalescing difference is the<br/>dominant explanation"]
    Verdict -->|"Time higher, sectors/request<br/>similar"| Other["Something else dominates —<br/>check registers, modulo overhead"]
```

**Figure 2.L3.1 — Lab workflow.** The host compiles and runs the benchmark while Nsight Compute collects architecture-specific execution evidence. The branch is the lab's own closing instruction made explicit: a timing difference alone is not proof of a coalescing effect — only a timing difference paired with a matching difference in the profiler's own transaction-efficiency metric earns that conclusion, which is why Section 12 insists on stating both what the evidence supports and what remains uncertain.

## 5. Prerequisites

### Hardware

- One CUDA-capable NVIDIA GPU
- Sufficient free device memory for two float arrays

### Software

- NVIDIA driver
- CUDA Toolkit with `nvcc`
- Nsight Compute CLI (`ncu`)
- A shell and text editor

### Permissions

Some environments restrict access to GPU performance counters. You may need an administrator-approved configuration or elevated privileges. Do not weaken production security controls only to complete a lab.

## 6. Environment

Record the environment.

```bash
nvidia-smi
nvcc --version
ncu --version
```

### Expected Output

The commands should identify the GPU and driver, the CUDA compiler release, and the Nsight Compute version.

### Common Errors

- `nvcc: command not found`: CUDA Toolkit is missing or not in `PATH`.
- `ncu: command not found`: Nsight Compute CLI is not installed.
- Permission error for counters: consult platform policy before changing system settings.

## 7. Components

| Component | Purpose |
|---|---|
| Contiguous kernel | Baseline access where neighboring threads read neighboring values |
| Strided kernel | Comparison access where neighboring threads read separated values |
| CUDA events | Device-side timing around kernel execution |
| Nsight Compute | Collects kernel-level performance metrics |
| `nvidia-smi` | Confirms device state and background activity |

## 8. Deployment Steps

### Step 1 — Create a Working Directory

#### Purpose

Keep generated source, binaries, and reports together.

#### Command

```bash
mkdir -p ~/nvidia-zero-to-hero/volume-02-lab-03
cd ~/nvidia-zero-to-hero/volume-02-lab-03
```

### Step 2 — Create the Benchmark

#### Purpose

Build two kernels that copy the same number of elements using different index mappings.

#### Command

```bash
cat > memory_patterns.cu <<'EOF'
#include <cuda_runtime.h>

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

#define CUDA_CHECK(call)                                                     \
  do {                                                                       \
    cudaError_t error = (call);                                               \
    if (error != cudaSuccess) {                                               \
      throw std::runtime_error(std::string("CUDA error: ") +                 \
                               cudaGetErrorString(error));                    \
    }                                                                        \
  } while (0)

__global__ void contiguous_copy(const float* input, float* output,
                                std::size_t count) {
  const std::size_t index =
      static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
  if (index < count) {
    output[index] = input[index] * 1.0001f;
  }
}

__global__ void strided_copy(const float* input, float* output,
                             std::size_t count, std::size_t stride) {
  const std::size_t logical =
      static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
  if (logical < count) {
    const std::size_t index = (logical * stride) % count;
    output[index] = input[index] * 1.0001f;
  }
}

float run_kernel(bool strided, const float* input, float* output,
                 std::size_t count, std::size_t stride, int iterations) {
  const int threads = 256;
  const int blocks = static_cast<int>((count + threads - 1) / threads);

  cudaEvent_t start{};
  cudaEvent_t stop{};
  CUDA_CHECK(cudaEventCreate(&start));
  CUDA_CHECK(cudaEventCreate(&stop));
  CUDA_CHECK(cudaEventRecord(start));

  for (int i = 0; i < iterations; ++i) {
    if (strided) {
      strided_copy<<<blocks, threads>>>(input, output, count, stride);
    } else {
      contiguous_copy<<<blocks, threads>>>(input, output, count);
    }
  }

  CUDA_CHECK(cudaGetLastError());
  CUDA_CHECK(cudaEventRecord(stop));
  CUDA_CHECK(cudaEventSynchronize(stop));

  float milliseconds = 0.0f;
  CUDA_CHECK(cudaEventElapsedTime(&milliseconds, start, stop));
  CUDA_CHECK(cudaEventDestroy(start));
  CUDA_CHECK(cudaEventDestroy(stop));
  return milliseconds;
}

int main(int argc, char** argv) {
  try {
    const bool strided = argc > 1 && std::string(argv[1]) == "strided";
    const std::size_t count = 1ULL << 24;
    const std::size_t stride = 32;
    const int iterations = 100;
    const std::size_t bytes = count * sizeof(float);

    float* input = nullptr;
    float* output = nullptr;
    CUDA_CHECK(cudaMalloc(&input, bytes));
    CUDA_CHECK(cudaMalloc(&output, bytes));
    CUDA_CHECK(cudaMemset(input, 1, bytes));
    CUDA_CHECK(cudaMemset(output, 0, bytes));

    const float elapsed =
        run_kernel(strided, input, output, count, stride, iterations);

    std::cout << "pattern=" << (strided ? "strided" : "contiguous")
              << " count=" << count << " iterations=" << iterations
              << " elapsed_ms=" << elapsed << '\n';

    CUDA_CHECK(cudaFree(input));
    CUDA_CHECK(cudaFree(output));
    return EXIT_SUCCESS;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return EXIT_FAILURE;
  }
}
EOF
```

#### Explanation

The contiguous kernel maps thread `i` to element `i`. The strided kernel maps neighboring logical threads to elements separated by a stride. Both execute one multiply and one write per element, but their memory transactions can differ substantially.

The modulo operation adds arithmetic overhead to the strided version. This is acceptable for an exploratory lab, but the final analysis must acknowledge it rather than attributing all difference to memory behavior.

### Step 3 — Compile the Program

#### Purpose

Generate an optimized executable while displaying compiler resource information.

#### Command

```bash
nvcc -O3 -lineinfo -Xptxas=-v memory_patterns.cu -o memory_patterns
```

#### Expected Output

```text
ptxas info    : 0 bytes gmem
ptxas info    : Compiling entry function '_Z16contiguous_copyPKfPfm' for 'sm_90'
ptxas info    : Function properties for _Z16contiguous_copyPKfPfm
    0 bytes stack frame, 0 bytes spill stores, 0 bytes spill loads
ptxas info    : Used 16 registers, 384 bytes cmem[0]
ptxas info    : Compiling entry function '_Z13strided_copyPKfPfmm' for 'sm_90'
ptxas info    : Function properties for _Z13strided_copyPKfPfmm
    0 bytes stack frame, 0 bytes spill stores, 0 bytes spill loads
ptxas info    : Used 20 registers, 392 bytes cmem[0]
```

The compiler should report information for each kernel, including register use and possibly stack, spill, constant-memory, or shared-memory details. Illustrative values above (exact counts depend on GPU architecture and compiler version): `contiguous_copy` uses `16 registers` with no spills; `strided_copy` uses slightly more, `20 registers`, consistent with the extra address arithmetic the modulo/stride calculation requires. Neither kernel spills in this example, which matters for the later comparison — it means any timing difference between the two is not being confounded by one kernel paying an unrelated register-spill cost.

#### Record

Capture the reported register count and any spill loads or stores for both kernels.

### Step 4 — Check for Background Work

#### Purpose

Avoid comparing results while another process is heavily using the GPU.

#### Command

```bash
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
```

Do not terminate unknown production workloads. Move the lab to an approved isolated GPU when necessary.

### Step 5 — Run the Contiguous Baseline

```bash
./memory_patterns contiguous
```

### Expected Output

```text
pattern=contiguous count=16777216 iterations=100 elapsed_ms=42.18
```

Illustrative value from one H100 run — treat the exact number as an example, not a target. Run it several times and record the median rather than selecting the fastest result.

### Step 6 — Run the Strided Version

```bash
./memory_patterns strided
```

### Expected Output

```text
pattern=strided count=16777216 iterations=100 elapsed_ms=156.42
```

Illustrative value from the same run — roughly 3.7x the contiguous kernel's time on this particular GPU and stride. The exact difference depends on GPU architecture, caches, compiler behavior, and memory mapping. Do not invent a universal ratio; treat both numbers above as one example run to calibrate expectations, not a value your own hardware must reproduce.

### Step 7 — Profile the Baseline

#### Purpose

Collect a concise architecture-specific summary.

#### Command

```bash
ncu --set basic --target-processes all \
  --export contiguous-report \
  ./memory_patterns contiguous
```

### Step 8 — Profile the Strided Version

```bash
ncu --set basic --target-processes all \
  --export strided-report \
  ./memory_patterns strided
```

### Step 9 — Print Report Summaries

```bash
ncu --import contiguous-report.ncu-rep --page details
ncu --import strided-report.ncu-rep --page details
```

**Illustrative extract (values from one example H100 run — expect different numbers on your hardware, but expect the same *direction* of difference):**

```text
contiguous_copy(...)
  Memory Throughput                    %    91.2
  L2 Hit Rate                          %    34.1
  Achieved Occupancy                   %    87.4
  l1tex__average_t_sectors_per_request        1.1

strided_copy(...)
  Memory Throughput                    %    68.4
  L2 Hit Rate                          %    9.8
  Achieved Occupancy                   %    85.9
  l1tex__average_t_sectors_per_request        5.7
```

Reading this pair: `Achieved Occupancy` is nearly identical between the two (87.4% vs 85.9%) — occupancy is not the story here, which rules out register pressure or block-sizing differences as the explanation. `l1tex__average_t_sectors_per_request` at `1.1` for contiguous versus `5.7` for strided is the direct transaction-efficiency evidence — the strided kernel is issuing roughly 5x more memory transactions for the same useful-byte count, consistent with the stride-32 mapping scattering each warp's accesses across widely separated addresses. `L2 Hit Rate` dropping from 34.1% to 9.8% confirms the strided pattern is also defeating cache reuse, not just generating more raw transactions. Together, these three numbers — not the elapsed-time ratio alone — are what justify concluding "this is a coalescing effect," per the branch in this lab's own architecture diagram.

Metric names vary by release and GPU. Look for sections related to:

- Memory workload analysis
- Scheduler statistics
- Warp state statistics
- Occupancy
- Register use
- Cache hit rates
- Memory throughput
- Load/store transaction efficiency

## 9. Validation

Confirm that:

- Both commands exit successfully.
- Both kernels process the same element count and iteration count.
- The output identifies the selected pattern.
- Nsight Compute creates both report files.
- Compiler output shows no unexpected spills, or spills are documented.

## 10. Verification

Build a comparison table using measured values.

| Observation | Contiguous | Strided |
|---|---:|---:|
| Median elapsed time | 42.18 ms (illustrative) | 156.42 ms (illustrative) |
| Registers per thread | 16 | 20 |
| Local-memory spill activity | 0 bytes | 0 bytes |
| Memory throughput | 91.2% (illustrative) | 68.4% (illustrative) |
| Cache behavior (L2 hit rate) | 34.1% (illustrative) | 9.8% (illustrative) |
| Occupancy | 87.4% (illustrative) | 85.9% (illustrative) |
| Dominant stall evidence | Low sectors/request (1.1) — efficient | High sectors/request (5.7) — transaction-inefficient |

Do not compare metrics from different profiler configurations. The row that actually explains the timing gap here is sectors-per-request, not occupancy — occupancy is nearly identical between the two kernels, which is itself useful evidence: it rules out a residency-based explanation and points the conclusion specifically at memory-access efficiency, matching the profiler extract in Step 9.

## 11. Observability

In a second terminal, sample device state while each benchmark runs:

```bash
nvidia-smi dmon -s pucm
```

Observe power, utilization, clocks, and memory activity. These host-level signals are useful context but cannot replace kernel profiling.

Stop the monitor with `Ctrl+C`.

## 12. Performance Measurements

Calculate the timing ratio:

```text
strided elapsed time / contiguous elapsed time
```

Then explain the ratio using evidence. Possible contributors include:

- Additional memory transactions
- Reduced cache efficiency
- Modulo arithmetic overhead
- Different scheduler stalls
- Register-use differences
- Measurement noise

A valid conclusion states both what the evidence supports and what remains uncertain.

## 13. Failure Injection

### Failure Scenario — Increase Per-Thread State

Create a copy of the source and add several live accumulator variables inside one kernel. Compile again with `-Xptxas=-v`.

Observe whether:

- Register use increases
- Occupancy estimates change
- Spill loads or stores appear
- Runtime changes

Do not assume that more registers always reduce performance. Interpret the result using the dominant bottleneck.

### Failure Scenario — Reduce Workload Size

Change `count` from `1ULL &lt;&lt; 24` to a much smaller value. Rebuild and rerun.

Observe whether launch overhead and measurement noise become more significant relative to kernel work.

## 14. Troubleshooting

### Problem — Nsight Compute Cannot Access Counters

**Symptoms**

A permission or performance-counter access error appears.

**Diagnosis**

Confirm platform policy and whether profiling is allowed for the current user.

**Resolution**

Use an approved lab node or administrator-provided profiler configuration. Do not apply undocumented security changes to production nodes.

### Problem — Benchmark Reports CUDA Error

Check:

```bash
nvidia-smi
journalctl -k | grep -iE "nvrm|xid|nvidia"
```

Confirm enough free device memory and a compatible toolkit-driver path.

### Problem — Results Vary Widely

Possible causes include:

- Other GPU workloads
- Clock or power-state transitions
- Thermal throttling
- First-run initialization
- Host scheduling noise

**Turning this into evidence.** A quick `dmon` check during the benchmark, before trusting any single elapsed-time reading, distinguishes "noisy measurement" from "contended GPU":

```text
$ nvidia-smi --query-gpu=utilization.gpu,memory.used,power.draw,clocks.sm --format=csv,noheader
34 %, 12480 MiB, 187 W, 1350 MHz
```

Nonzero `utilization.gpu` and `memory.used` well above this lab's own workload footprint, *before* the benchmark has even started, is the direct evidence that another process is already using the GPU — the benchmark's timing will be contending for SM time and memory bandwidth with that unrelated workload, which explains run-to-run variance that has nothing to do with the contiguous-versus-strided comparison itself. `clocks.sm` at `1350 MHz` versus a rated boost near `1980 MHz` on an idle-and-uncontended device is a second independent signal worth checking — a clock well below boost, sustained across the benchmark window, points at power or thermal throttling rather than measurement noise. Warm up the GPU, isolate the device, repeat measurements, and report the distribution.

### Problem — Strided Kernel Is Not Slower

The chosen access mapping may interact favorably with cache or memory partitioning on the device, or the arithmetic overhead may dominate both cases differently. Change the stride and array size, then profile rather than forcing the expected conclusion.

## 15. Cleanup

```bash
cd ~
rm -rf ~/nvidia-zero-to-hero/volume-02-lab-03
```

Confirm that no profiler process remains running.

## 16. Summary

You compared two kernels with different memory mappings, captured compiler resource data, collected Nsight Compute reports, and connected end-to-end timing to device-level evidence.

The central lesson is methodological: a performance claim requires a controlled comparison, representative measurements, and a bottleneck hypothesis supported by multiple signals.

## 17. Challenge Exercises

1. Test strides of 2, 4, 8, 16, 32, and 64.
2. Replace the modulo mapping with a precomputed index array and compare results.
3. Implement an Array of Structures and Structure of Arrays comparison.
4. Add a branch that diverges half the threads in each warp.
5. Compare results on two GPU architectures without assuming identical metric names.
6. Export a one-page Markdown incident-style performance report.

## 18. Further Reading

- [Registers, Shared Memory, and Local Memory](../chapter-07-registers-shared-memory-and-local-memory)
- [Global Memory, L1, L2, and HBM](../chapter-08-global-memory-l1-l2-and-hbm)
- [Divergence, Coalescing, and Bottleneck Reasoning](../chapter-09-divergence-coalescing-and-bottleneck-reasoning)
- [Scheduling, Occupancy, and Instruction Dispatch](../chapter-06-scheduling-occupancy-and-instruction-dispatch)
