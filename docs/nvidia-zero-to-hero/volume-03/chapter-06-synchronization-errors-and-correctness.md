---
title: Synchronization, Errors, and Correctness
description: Understand CUDA ordering, synchronization scopes, asynchronous error reporting, and the practices required to prove kernel correctness.
sidebar_position: 7
tags:
  - cuda
  - synchronization
  - error-handling
  - correctness
---

# Synchronization, Errors, and Correctness

## Introduction

CUDA is asynchronous by design. The host can enqueue work and continue while the GPU executes. Different streams can progress independently. Threads inside a block can cooperate, but only through defined synchronization rules. These capabilities improve utilization, yet they also make defects harder to observe.

A program can launch successfully and fail later. A memory copy can appear to fix a race only because it introduced an accidental synchronization point. A kernel can return correct values for one input size and corrupt data under a different schedule.

Correct CUDA software must make dependencies explicit, check errors at the correct time, and distinguish host ordering, stream ordering, block synchronization, and device-wide synchronization.

| Chapter field | Value |
|---|---|
| Volume | 03 — CUDA Fundamentals |
| Difficulty | Intermediate |
| Estimated reading time | 50 minutes |
| Primary focus | Ordering, synchronization, and error handling |
| Previous | CUDA Memory Management and Data Movement |
| Next | Streams, Events, and Asynchronous Pipelines |

## Story

A service occasionally returns corrupted results after a performance optimization. The team replaced a blocking copy with an asynchronous copy and removed a device synchronization call. Unit tests still pass most of the time.

Tracing reveals that the host reuses an input buffer before the transfer finishes. In another path, a second kernel reads an output from a different stream without waiting for the producing event. The previous implementation was slower, but its blocking calls accidentally enforced the required order.

The failure is not random. The program contains missing dependencies that the old execution pattern happened to hide.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain host, stream, block, and device synchronization scopes.
- Distinguish launch errors from asynchronous execution errors.
- Use CUDA error checks without serializing every operation.
- Explain barriers, memory visibility, and race conditions.
- Design explicit dependencies between copies and kernels.
- Build a correctness validation strategy for CUDA workloads.

## Big Picture

```mermaid
flowchart TD
    Host[Host Thread]
    Queue[Enqueue Copy or Kernel]
    Stream[CUDA Stream]
    GPU[GPU Execution]
    Error[Asynchronous Error]
    Sync[Synchronization or Query]
    Report[Error Reported to Host]

    Host --> Queue --> Stream --> GPU
    GPU --> Error --> Sync --> Report
    Host --> Sync
```

**Figure 3.6.1 — Asynchronous error visibility.** Work can fail after the host has returned from the launch call. The error becomes visible when the application queries or synchronizes the relevant execution context.

## Ordering Is Scoped

CUDA does not provide one universal ordering rule. Ordering depends on where work is submitted and which synchronization primitive is used.

| Scope | What it coordinates |
|---|---|
| Thread | Operations inside one logical GPU thread |
| Warp | Execution lanes participating in warp-level operations |
| Block | Threads sharing one block and shared memory |
| Stream | Commands submitted to one ordered queue |
| Event dependency | Selected work across streams |
| Device | All preceding work on the selected device |
| Host thread | CPU-side control flow and API calls |

A correct design uses the narrowest scope that satisfies the dependency. Device-wide synchronization is simple but often destroys concurrency.

## Stream Ordering

Commands in one stream execute in issue order. A later kernel in the same stream observes completion of earlier work in that stream according to CUDA ordering semantics.

```mermaid
sequenceDiagram
    participant H as Host
    participant S as Stream 0
    participant G as GPU

    H->>S: Copy input
    H->>S: Kernel A
    H->>S: Kernel B
    S->>G: Copy input
    S->>G: Kernel A
    S->>G: Kernel B
```

**Figure 3.6.2 — In-stream ordering.** Commands submitted to the same stream form an ordered dependency chain without requiring a host synchronization between every operation.

Different streams may overlap or execute in an order that differs from host submission. Dependencies between them must be stated with events or other supported mechanisms.

## Device Synchronization

`cudaDeviceSynchronize()` waits until preceding work on the current device completes and returns an execution error if one occurred.

```cpp
cudaError_t status = cudaDeviceSynchronize();
```

This is useful for:

- simple educational programs,
- correctness checkpoints,
- isolating a failing kernel,
- shutdown and lifecycle boundaries.

It is expensive when placed in a hot path because it prevents useful overlap and forces the host to wait for all outstanding device work.

## Stream Synchronization

`cudaStreamSynchronize(stream)` waits only for work in the selected stream. It narrows the waiting scope but still blocks the host thread.

For polling or nonblocking control flow, an application may query stream or event completion and perform other host work until the dependency is satisfied.

## Block Barriers

Threads in one block can synchronize with a barrier such as `__syncthreads()`.

A common pattern is:

1. each thread loads part of a tile,
2. the block waits until the tile is complete,
3. all threads consume the shared data,
4. the block waits before overwriting the tile.

```mermaid
sequenceDiagram
    participant T0 as Thread Group A
    participant S as Shared Memory
    participant T1 as Thread Group B

    T0->>S: Write tile segment
    T1->>S: Write tile segment
    Note over T0,T1: Block barrier
    T0->>S: Read complete tile
    T1->>S: Read complete tile
```

**Figure 3.6.3 — Block-level cooperation.** The barrier protects a phase transition so all participating threads observe the expected shared-memory state.

All non-exited threads in the block must reach a block barrier in a compatible control path. Placing a barrier inside divergent logic can deadlock or produce undefined behavior.

## Synchronization Is Not Communication by Itself

A barrier coordinates timing and memory visibility within its defined scope. It does not move data, choose ownership, or make unrelated memory safe automatically.

Correct cooperation requires:

- a shared storage location,
- one or more writers,
- a defined synchronization point,
- readers that access only after the dependency,
- no conflicting writes without ordering.

## Race Conditions

A race occurs when multiple execution agents access the same location, at least one access is a write, and the ordering is not defined.

Common CUDA races include:

- multiple threads writing one output element,
- reading shared memory before all writers finish,
- reusing a host buffer before an async copy completes,
- consuming data in another stream without an event dependency,
- freeing memory while queued work still references it.

Race conditions may disappear during debugging because instrumentation changes timing. Correctness must come from explicit ordering, not repeated successful runs.

## Atomic Operations

Atomic operations serialize a specific memory update so concurrent threads do not lose modifications. They are appropriate for counters, reductions, queues, and selected coordination patterns.

Atomics have trade-offs:

- contention can limit throughput,
- operation support depends on data type and architecture,
- atomicity does not automatically establish every surrounding dependency,
- a different algorithm may scale better.

Use atomics to protect the required operation, not as a substitute for understanding ownership.

## Error Categories

### Immediate API errors

These include invalid arguments, unsupported configurations, failed allocations, and other conditions detected during the API call.

### Kernel launch errors

An invalid launch configuration may be detected immediately after the launch.

```cpp
kernel<<<blocks, threads>>>(arguments);
cudaError_t launch_status = cudaGetLastError();
```

### Asynchronous execution errors

Illegal memory access, device-side assertion, and similar failures occur while the GPU executes. They are commonly reported by a later synchronization or API call.

```cpp
cudaError_t execution_status = cudaDeviceSynchronize();
```

Both checks are necessary during diagnosis because they answer different questions.

## A Practical Error-Checking Pattern

```cpp
#define CUDA_CHECK(call)                                                   \
    do {                                                                   \
        cudaError_t error = (call);                                        \
        if (error != cudaSuccess) {                                        \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",                 \
                    __FILE__, __LINE__, cudaGetErrorString(error));        \
            exit(EXIT_FAILURE);                                            \
        }                                                                  \
    } while (0)
```

Use the wrapper for API calls, then check the launch and synchronize at meaningful correctness boundaries during development.

Production systems may propagate errors instead of terminating, but they must preserve the same information: operation, device, stream, software version, and error string.

## Avoiding Accidental Serialization

A naive debug pattern calls `cudaDeviceSynchronize()` after every operation. This makes failures easier to localize but removes overlap and changes timing.

A disciplined workflow is:

1. use aggressive synchronization while isolating correctness,
2. identify the exact dependency,
3. replace global waits with stream ordering or events,
4. retain error checks at lifecycle boundaries,
5. remeasure both correctness and performance.

## Correctness Validation

GPU output should be compared with an independent reference when practical.

A useful strategy includes:

- deterministic small inputs with known answers,
- CPU reference computation,
- random and adversarial sizes,
- non-divisible dimensions,
- zero-length and boundary cases,
- tolerance appropriate to floating-point behavior,
- repeated runs under concurrency,
- memory and race analysis tools where available.

Do not validate only the average output. Compare every required element and report the first mismatch with index and values.

## Floating-Point Correctness

Parallel reductions may combine values in a different order than CPU code. Floating-point addition is not mathematically associative, so small differences can be legitimate.

Validation should use absolute and relative tolerances chosen for the algorithm. A tolerance must not be so wide that it hides genuine corruption.

## Production Architecture

Production CUDA services need an error policy, not only logging.

Decisions include:

- whether one failed request can be isolated,
- when a worker process must restart,
- whether the device context remains trustworthy,
- how the scheduler drains unhealthy replicas,
- which telemetry captures XID and application errors,
- how input shape and model version are attached to incidents.

A device-side fault can leave subsequent work failing until the process or context is recreated. Recovery should be tested rather than improvised during an outage.

## Production Troubleshooting

### Problem: Error appears on an unrelated API call

**Explanation**

A previous asynchronous operation failed. The later call is the point where the runtime reports the pending error.

**Diagnosis**

Temporarily synchronize after suspected kernels, check each launch, and narrow the failing interval.

### Problem: Results change between runs

Inspect shared-memory barriers, output ownership, atomics, cross-stream dependencies, host-buffer reuse, and memory initialization.

### Problem: Performance collapses after adding error checks

Determine whether device-wide synchronization was added inside the steady-state path. Keep immediate launch checks, but place blocking execution checks at justified boundaries.

### Problem: Service continues failing after one illegal access

The CUDA context may be unhealthy. Capture the original error, stop accepting new work, recreate the worker or context according to the service recovery design, and verify device health.

## Customer Scenario

A customer runs two inference stages in separate streams. Stage B sometimes reads incomplete output from Stage A. The team adds a global device synchronization, which fixes correctness but cuts throughput in half.

The architect replaces the device-wide barrier with an event recorded after Stage A and waited on by Stage B. The data dependency remains explicit while unrelated work can continue.

## Interview Preparation

### Conceptual Questions

1. Why can a kernel error appear during a later API call?
2. What is the difference between block and device synchronization?
3. Why can a program become correct after adding a blocking copy?

### Architecture Questions

1. Design an error-checking strategy for an asynchronous service.
2. Draw an event dependency between two streams.
3. Explain why all threads must reach a block barrier safely.

### Scenario Questions

1. Results vary between runs but no API call fails. What do you investigate?
2. Adding `cudaDeviceSynchronize()` fixes corruption. What does that imply?
3. An illegal access causes all later requests to fail. How should the service respond?

## Summary

CUDA correctness depends on explicit ordering. Streams order their own commands, events connect selected streams, barriers coordinate threads in a block, and device synchronization creates a broad host-visible completion point.

Errors must be checked twice: once for launch validity and again when asynchronous execution completes. Correctness must be proven with reference results, boundary cases, race analysis, and recovery testing.

## Key Takeaways

- CUDA work is asynchronous, so error reporting may be delayed.
- Synchronization has scope; use the narrowest scope that satisfies the dependency.
- A successful launch does not prove successful execution.
- Race conditions require ownership and ordering fixes, not repeated testing.
- Device-wide synchronization is useful for diagnosis but expensive in steady state.
- Production systems need a tested policy for context and worker recovery.

## Cross References

- Previous: [CUDA Memory Management and Data Movement](./chapter-05-cuda-memory-management-and-data-movement)
- Volume introduction: [CUDA Fundamentals](./index)
- Related lab: [Build and Validate a CUDA Vector Pipeline](./labs/lab-02-build-and-validate-a-cuda-vector-pipeline)
