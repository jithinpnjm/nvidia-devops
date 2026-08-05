---
title: Streams, Events, and Asynchronous Execution
description: Understand how CUDA orders work, overlaps independent operations, measures device timelines, and exposes synchronization mistakes.
sidebar_position: 8
tags:
  - cuda
  - streams
  - events
  - asynchronous-execution
---

# Streams, Events, and Asynchronous Execution

## Introduction

A GPU is valuable because it can keep many execution and data-movement resources busy at the same time. Yet a program that submits every operation to one serial queue and waits after each step can reduce an expensive accelerator to a sequence of isolated tasks.

CUDA streams provide ordered work queues. CUDA events provide device-side timeline markers. Together they allow applications to express dependencies without forcing the entire host process or device to stop.

The difficult part is not creating a stream. The difficult part is proving that the operations are independent, that memory remains valid, that synchronization occurs at the correct boundary, and that apparent overlap is real rather than assumed.

| Chapter field | Value |
|---|---|
| Volume | 03 — CUDA Fundamentals |
| Difficulty | Intermediate |
| Estimated reading time | 50 minutes |
| Primary focus | Ordering, concurrency, overlap, and timing |
| Previous | Synchronization, Errors, and Correctness |
| Next | Pinned Memory and Transfer Overlap |

## Story

An inference service copies input to the GPU, launches preprocessing, runs model execution, copies output back, and then starts the next request. GPU utilization oscillates between transfer and compute activity. Latency is acceptable, but throughput remains far below the device's expected capacity.

The service is correct but unnecessarily serialized. Engineers introduce two streams and divide requests into batches. While one batch executes, the next batch begins transferring. Throughput improves only after they also replace pageable host buffers with pinned memory and remove a hidden device-wide synchronization.

The lesson is architectural: concurrency appears only when the full dependency chain allows it.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain the ordering guarantees of a CUDA stream.
- Distinguish host asynchrony from device concurrency.
- Use events to express dependencies and measure device elapsed time.
- Identify operations that accidentally serialize multiple streams.
- Design a multi-stream pipeline with explicit ownership and synchronization.
- Troubleshoot overlap failures using timeline evidence.

## Big Picture

```mermaid
flowchart LR
    Host[Host Thread]
    S0[Stream 0]
    S1[Stream 1]
    Copy0[Copy Batch A]
    Kernel0[Compute Batch A]
    Return0[Return Batch A]
    Copy1[Copy Batch B]
    Kernel1[Compute Batch B]
    Return1[Return Batch B]

    Host --> S0
    Host --> S1
    S0 --> Copy0 --> Kernel0 --> Return0
    S1 --> Copy1 --> Kernel1 --> Return1
```

**Figure 3.7.1 — Independent ordered queues.** Operations inside one stream retain order. Operations in different streams may overlap when dependencies, memory type, and hardware capability permit.

## What a Stream Represents

A CUDA stream is an ordered sequence of operations submitted to a device. If operations A, B, and C are placed in the same stream, B begins only after the required completion of A, and C follows B.

That ordering guarantee is local to the stream. Two streams do not automatically wait for each other.

Typical stream operations include:

- Kernel launches
- Asynchronous memory copies
- Memory-set operations
- Event recording
- Stream waits on events
- Host callbacks or host functions where supported

A stream is not a CPU thread, hardware queue, or dedicated slice of the GPU. The runtime and driver map submitted work onto available hardware engines.

## Host Asynchrony Versus Device Concurrency

These terms are related but not identical.

| Concept | Meaning |
|---|---|
| Host-asynchronous API | The host call may return before device work completes |
| Device concurrency | Multiple device operations make progress during overlapping time windows |
| Overlap | Compute and transfer, or multiple kernels, execute concurrently |
| Parallel submission | Host threads submit work at the same time |

A call can be asynchronous from the host's perspective while the device still executes work serially. Conversely, the device can overlap operations even if one host thread submitted them sequentially to different streams.

:::important
Never infer device overlap from API names alone. Verify it using a profiler timeline or event-based measurements designed for the dependency graph.
:::

## Default Stream Behavior

CUDA supports a default stream and explicitly created non-default streams. Default-stream semantics can vary depending on compilation mode and runtime configuration, particularly around whether the default stream behaves as a process-wide legacy stream or a per-thread default stream.

For production code, ambiguity is dangerous. Teams should document which semantics they rely on and prefer explicit streams when concurrency and dependencies matter.

Legacy default-stream interactions can introduce synchronization with other streams. This may explain why a multi-stream design still behaves serially.

## Creating and Destroying Streams

A simplified lifecycle is:

```cpp
cudaStream_t stream;
cudaStreamCreate(&stream);

// Submit asynchronous work to stream.

cudaStreamSynchronize(stream);
cudaStreamDestroy(stream);
```

The production version should check every return value and define who owns the stream.

Useful creation options may include non-blocking behavior or priorities where the platform supports them. Stream priority influences scheduling preference but does not create hard real-time guarantees or preempt already executing work arbitrarily.

## Events as Timeline Markers

A CUDA event is recorded into a stream. It becomes complete when all earlier operations in that stream reach the required completion point.

Events support two major purposes:

1. **Dependency expression** — another stream waits for the event.
2. **Timing** — elapsed device time is measured between recorded events.

```mermaid
sequenceDiagram
    participant A as Stream A
    participant E as Event
    participant B as Stream B

    A->>A: Copy input
    A->>A: Preprocess kernel
    A->>E: Record ready event
    B->>E: Wait for ready event
    B->>B: Main compute kernel
```

**Figure 3.7.2 — Cross-stream dependency.** Stream B waits only for the required milestone instead of synchronizing the entire device.

A common pattern is:

```cpp
cudaEventRecord(inputReady, producerStream);
cudaStreamWaitEvent(consumerStream, inputReady, 0);
```

This preserves concurrency elsewhere while enforcing one dependency.

## Device Timing with Events

Host clocks can include submission overhead, scheduler delay, CPU activity, or unrelated synchronization. CUDA events measure time on the device timeline between two recorded markers.

```cpp
cudaEventRecord(start, stream);
myKernel<<<grid, block, 0, stream>>>(...);
cudaEventRecord(stop, stream);
cudaEventSynchronize(stop);

float milliseconds = 0.0f;
cudaEventElapsedTime(&milliseconds, start, stop);
```

Event timing is useful for a defined device interval. It is not automatically an end-to-end service latency measurement. Both are necessary in production.

## Synchronization Options

CUDA provides synchronization at different scopes.

| Mechanism | Scope | Typical use |
|---|---|---|
| `cudaDeviceSynchronize()` | All preceding work on the device for the process context | Debugging, phase boundary, broad completion |
| `cudaStreamSynchronize()` | One stream | Reuse stream-owned buffers or consume results |
| `cudaEventSynchronize()` | One event milestone | Wait for a specific dependency |
| `cudaStreamWaitEvent()` | Device-side stream dependency | Preserve host asynchrony and narrow dependency |
| Event query | Non-blocking completion check | Polling or progress logic |

Device-wide synchronization is simple but expensive because it removes overlap across independent streams.

## Designing a Pipeline

A robust pipeline assigns ownership and lifetime explicitly.

```mermaid
flowchart TD
    Slot0[Pipeline Slot 0]
    Slot1[Pipeline Slot 1]
    H0[Pinned Host Buffer 0]
    H1[Pinned Host Buffer 1]
    D0[Device Buffer 0]
    D1[Device Buffer 1]
    S0[Stream 0]
    S1[Stream 1]

    H0 --> S0 --> D0
    H1 --> S1 --> D1
```

**Figure 3.7.3 — Double-buffered ownership.** Each stream owns a separate host and device buffer slot until its completion event indicates safe reuse.

For each slot, define:

- Host input buffer
- Device input buffer
- Device output buffer
- Host output buffer
- Stream
- Completion event
- State: free, submitted, executing, complete

Without ownership rules, the host may overwrite a buffer while the device is still reading it.

## Conditions Required for Overlap

Overlap depends on several conditions:

- Operations must be in different streams when independence is required.
- Dependencies must not force serialization.
- Host buffers used by asynchronous copies usually need to be page-locked.
- The device must expose relevant copy and compute engine capability.
- Transfers must be large enough for overlap benefits to exceed overhead.
- Kernels must not consume all resources in a way that prevents useful concurrency.
- Hidden synchronization must be removed.

## Common Serialization Sources

| Source | Effect |
|---|---|
| Device-wide synchronization after every launch | Removes pipeline overlap |
| Legacy default-stream interaction | May synchronize otherwise independent streams |
| Pageable host memory for async copy | Runtime may stage or block |
| Reusing one buffer too early | Forces synchronization or causes corruption |
| Allocations in the hot path | Can add synchronization and allocator overhead |
| Dependency through shared output | Requires ordering even across streams |
| Very short operations | Launch and queue overhead dominate |

## Architecture Trade-offs

### More streams

More streams can expose concurrency, but they also increase queue depth, memory consumption, event management, and debugging complexity. Beyond a point, additional streams add overhead without increasing useful overlap.

### Latency versus throughput

Batching and pipelining often improve throughput by increasing concurrency. They may increase queueing latency. The correct design follows the service-level objective.

### Determinism versus utilization

Highly asynchronous pipelines can maximize device use but make failure attribution and timing more complex. Production systems need trace identifiers and per-stage metrics.

## Production Observability

A useful observability model includes:

- Host request latency
- Queueing time before GPU submission
- Host-to-device transfer duration
- Kernel duration
- Device-to-host transfer duration
- Stream queue depth
- Outstanding pipeline slots
- Completion-event latency
- GPU copy-engine activity
- GPU compute activity

A timeline should show whether idle gaps occur on the host, copy engines, or compute engines.

## Production Troubleshooting

### Problem: Multiple streams do not improve throughput

**Symptoms**

- Similar runtime with one and several streams
- Timeline shows serialized transfers and kernels
- CPU submission appears asynchronous

**Diagnosis**

1. Confirm buffers are pinned.
2. Check for default-stream work.
3. Search for `cudaDeviceSynchronize()` in the hot path.
4. Confirm operations use distinct buffers.
5. Inspect the profiler timeline for actual overlap.
6. Verify operation sizes and device engine capability.

**Root cause patterns**

- Hidden global synchronization
- Pageable host memory
- Dependency chain is inherently serial
- Work units are too small
- Kernel resource use prevents useful concurrency

### Problem: Intermittent corruption after adding streams

The likely cause is buffer reuse before completion. Add per-slot completion events, remove shared mutable buffers, and make ownership visible in code.

### Problem: Timing results appear impossible

Confirm start and stop events are recorded in the intended stream and that the measured interval includes the expected dependencies. Event timing does not include host work outside the interval.

## Customer Scenario

A customer serves image requests using one GPU. Their application reaches only moderate utilization even though requests queue during peaks. Profiling reveals a repeated pattern: host copy, preprocessing, inference, output copy, device synchronization.

The recommended design introduces bounded pipeline slots, pinned buffers, explicit streams, and event-based dependencies. The architect also preserves a single-stream mode for debugging and compares end-to-end latency percentiles, not only kernel time.

## Interview Preparation

### Conceptual Questions

1. What guarantee does a stream provide?
2. Why does an asynchronous API not guarantee overlap?
3. What is the difference between stream synchronization and device synchronization?

### Architecture Questions

1. Draw a double-buffered copy-and-compute pipeline.
2. Explain how events connect producer and consumer streams.
3. Describe how you would measure device time and end-to-end latency separately.

### Scenario Questions

1. Four streams perform no better than one. What do you inspect?
2. A service corrupts results only under concurrency. What ownership error is likely?
3. A timeline shows compute idle while copies run. Which design changes might help?

## Summary

Streams express ordered device work. Events mark completion points, measure device intervals, and create narrow cross-stream dependencies. They enable concurrency only when the application exposes independent work, uses suitable memory, avoids hidden synchronization, and preserves buffer lifetime.

The production goal is not the largest stream count. It is a bounded, observable pipeline that satisfies latency and throughput requirements without sacrificing correctness.

## Key Takeaways

- Operations are ordered within a stream.
- Different streams may overlap, but overlap is not guaranteed.
- Events provide precise device milestones and dependencies.
- Device-wide synchronization commonly destroys concurrency.
- Buffer ownership and lifetime are central to correctness.
- Profiler timelines are the evidence for real overlap.

## Cross References

- Previous: [Synchronization, Errors, and Correctness](./chapter-06-synchronization-errors-and-correctness)
- Next: [Pinned Memory and Transfer Overlap](./chapter-08-pinned-memory-and-transfer-overlap)
- Related lab: [Build an Overlapped CUDA Pipeline](./labs/lab-03-build-an-overlapped-cuda-pipeline)
