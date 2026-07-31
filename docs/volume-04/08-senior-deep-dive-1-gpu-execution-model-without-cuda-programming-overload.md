---
title: "Senior Deep Dive 1 — GPU execution model without CUDA-programming overload"
slug: "senior-deep-dive-1-gpu-execution-model-without-cuda-programming-overload"
sidebar_position: 8
description: "Senior Deep Dive 1 — GPU execution model without CUDA-programming overload — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
A GPU is built to execute large amounts of parallel work. Streaming multiprocessors schedule warps of threads; Tensor Cores accelerate matrix operations used heavily by deep learning; HBM provides very high bandwidth but finite capacity. Workloads can be compute-bound, memory-bandwidth-bound, latency-bound, launch-bound or communication-bound. “GPU utilization 100%” does not identify which resource is limiting useful work.

Arithmetic intensity is a useful mental model: how much computation is performed per byte moved. Large matrix multiplies can reuse data effectively and become compute-bound. Decode phases in LLM inference often move weights and KV data repeatedly and can become memory-bandwidth-sensitive. This is why the same GPU can behave very differently for prefill and decode.
