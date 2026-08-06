---
title: "Chapter 06 — vLLM, TGI, SGLang, and LMDeploy"
sidebar_label: "06. Serving Engines Architecture"
description: "Architectural deep-dive into open-source LLM serving engines: vLLM PagedAttention virtual memory, TGI Rust router, SGLang RadixAttention prompt caching, and LMDeploy TurboMind C++ core."
---

# Chapter 06 — vLLM, TGI, SGLang, and LMDeploy

Selecting the right Large Language Model (LLM) serving engine is a foundational architectural decision for modern AI platform infrastructure. While proprietary frameworks like NVIDIA TensorRT-LLM provide high throughput through compilation, the open-source ecosystem has introduced groundbreaking serving engines—**vLLM**, **Text Generation Inference (TGI)**, **SGLang**, and **LMDeploy**—each optimized for distinct operational profiles.

Choosing among these engines requires evaluating fundamental design trade-offs: virtual memory KV cache management (PagedAttention), prompt prefix sharing data structures (RadixAttention), high-concurrency frontend routing (Rust vs Python async engines), and raw C++ execution efficiency (TurboMind). This chapter provides an architectural deep-dive into the internals, algorithms, memory models, and trade-offs of these four major serving frameworks.

---

## Production Scenario: Multi-Tenant Enterprise LLM Gateway

An enterprise platform engineering team was tasked with building a unified LLM inference gateway serving 10,000 requests per minute across a cluster of NVIDIA H100 GPUs. The incoming workload comprised four distinct traffic patterns:
1. **Multi-turn Customer Chatbots:** Highly repetitive system prompts with incremental user message turns (high KV cache prefix overlap).
2. **RAG Search Pipelines:** Long document contexts ($> 16,000$ tokens) with single-token output summaries.
3. **Structured Data Extraction:** Agents generating strict JSON objects based on Pydantic schemas.
4. **Real-time Code Autocompletion:** Ultra-low latency requirements ($p99 &lt; 15\text{ ms}$ Time-To-First-Token).

```
                      [ Incoming Multi-Tenant API Traffic ]
                                        │
                                        ▼
                         [ Enterprise API Gateway ]
                                        │
     ┌───────────────────┬──────────────┴───────────┬───────────────────┐
     ▼                   ▼                         ▼                   ▼
 [  vLLM  ]        [  TGI Engine  ]          [  SGLang  ]        [ LMDeploy ]
 PagedAttention     Rust Frontend Router      RadixAttention       TurboMind C++
 Virtual Memory     Safetensors Direct Mmap   Tree Cache Reuse     Fused GEMM Kernels
```

An initial single-engine rollout using a default vLLM cluster configuration encountered severe latency degradation under multi-turn chat sessions due to sub-optimal prefix caching policies. Meanwhile, attempts to handle structured JSON extraction via TGI introduced CPU-bound regex validation bottlenecks. To build a resilient, high-throughput serving architecture, the team conducted a deep architectural evaluation of each engine's internal components.

---

## Learning Objectives

By completing this chapter, you will be able to:

1. **Deconstruct** vLLM's PagedAttention virtual memory manager, including logical-to-physical block tables, copy-on-write fork mechanics, and CPU block swapping.
2. **Analyze** Hugging Face TGI's architecture, including its Rust gRPC frontend router, token streaming pipelines, and `safetensors` memory mapping.
3. **Evaluate** SGLang's RadixAttention algorithm, radix tree graph operations, LRU eviction policies, and zero-overhead structured decoding (JSON/regex).
4. **Examine** LMDeploy's TurboMind C++ core, fused attention kernels, and W4A16/AWQ quantitative execution speedups.
5. **Formulate** an engine selection matrix based on workload characteristics, prompt overlap ratios, latency targets, and GPU hardware generations.

---

## Comparative Serving Engine Topology

The high-level structural breakdown of all four serving engines is illustrated in **Figure 12.6.1**.

```mermaid
flowchart TD
    subgraph vLLM_Arch["vLLM Architecture"]
        vLLM_Async["AsyncLLMEngine (Python)"] --> vLLM_Scheduler["Scheduler (Continuous Batching)"]
        vLLM_Scheduler --> vLLM_MemMgr["BlockSpaceManager\n(PagedAttention)"]
        vLLM_MemMgr --> vLLM_Tables["Logical-to-Physical Block Table\n[Logical 0..N -> Physical Block P]"]
        vLLM_Tables --> vLLM_Kernels["PagedAttention CUDA Kernels"]
    end

    subgraph TGI_Arch["TGI Architecture"]
        TGI_Rust["Rust Web Server Router\n(Axum / gRPC Router)"] --> TGI_Queue["Batcher Queue\n(Token-Level Streaming)"]
        TGI_Queue --> TGI_Python["Python / C++ Execution Server"]
        TGI_Python --> TGI_Mmap["Safetensors Direct Zero-Copy Mmap"]
        TGI_Mmap --> TGI_Kernels["FlashAttention-2 / Custom Kernels"]
    end

    subgraph SGLang_Arch["SGLang Architecture"]
        SGL_Interpreter["SGLang Frontend Interpreter\n(Async Programming Model)"] --> SGL_Radix["RadixAttention Cache Manager\n(Radix Tree Graph Data Structure)"]
        SGL_Radix --> SGL_LRU["Radix Tree LRU Eviction & Lock-free Fork"]
        SGL_LRU --> SGL_Grammar["Compressed State Graph\n(Outlines / XGrammar JSON Decoding)"]
        SGL_Grammar --> SGL_Kernels["Custom PyTorch / C++ Kernels"]
    end

    subgraph LMDeploy_Arch["LMDeploy Architecture"]
        LMD_Client["Python / REST Client"] --> LMD_Turbo["TurboMind Engine Core (Pure C++)"]
        LMD_Turbo --> LMD_Batcher["C++ Request Scheduler"]
        LMD_Batcher --> LMD_FusedKernels["Fused MHA/GQA Kernels\n(AWQ / W4A16 Weight Quant)"]
        LMD_FusedKernels --> LMD_GPU["GPU Memory Execution Loop"]
    end

    style vLLM_Arch fill:#1f2937,stroke:#4b5563,color:#fff
    style TGI_Arch fill:#111827,stroke:#374151,color:#fff
    style SGLang_Arch fill:#1f2937,stroke:#4b5563,color:#fff
    style LMDeploy_Arch fill:#064e3b,stroke:#059669,color:#fff
```

*Figure 12.6.1: Architectural Internals of vLLM, TGI, SGLang, and LMDeploy Serving Engines.*

---

## HOW: Deep Architectural Comparison of Modern Serving Engines

### 1. vLLM and PagedAttention Virtual Memory Architecture

In traditional LLM serving, Key-Value (KV) cache tensors are allocated as continuous memory arrays dimensioned to the request's maximum potential sequence length (`S_max = 4096 or 32768`). Because actual generation length is unpredictable, this pattern causes massive memory waste:
- **Internal Fragmentation:** Unused space pre-allocated for tokens that are never generated.
- **External Fragmentation:** Unusable memory gaps between variable-sized contiguous allocations.
- **Reservation Waste:** Memory allocated for prompts before generation begins.

Traditional systems waste 60% - 80% of total GPU VRAM strictly on memory fragmentation.

#### Virtual Memory Analogy (OS Paging)
Inspired by virtual memory paging in operating systems, **vLLM** introduces **PagedAttention**. The KV cache is divided into fixed-size physical memory blocks, each holding Key and Value vectors for a fixed number of tokens (`B = 16 or 32`).

```
Logical KV Cache (Sequence View):
[ Block 0 (Tokens 0..15) ] ──► [ Block 1 (Tokens 16..31) ] ──► [ Block 2 (Tokens 32..47) ]

                                       │ (Block Table Mapping)
                                       ▼
Physical GPU Memory (Paged Allocations):
[ Physical Block 102 ] ───► Stores Logical Block 0
[ Physical Block 45  ] ───► Stores Logical Block 2  (Non-contiguous!)
[ Physical Block 80  ] ───► Stores Logical Block 1
```

- **Logical Blocks:** Virtual contiguous sequence space viewed by the attention calculation.
- **Physical Blocks:** Fixed-size physical memory chunks allocated non-contiguously in GPU VRAM by the `BlockSpaceManager`.
- **Block Table:** A dynamic mapping table maintained per request:

```text
BlockTable(r): LogicalBlockIndex -> PhysicalBlockIndex
```

#### PagedAttention CUDA Kernel Mechanics
During the attention operation, the PagedAttention CUDA kernel fetches Keys and Values dynamically by querying the sequence's Block Table inside thread blocks:

```text
A_{i, j} = softmax((Q_i * K_{BlockTable(j/blockSize)}[j % blockSize]^T) / sqrt(d))
```

This allows physical blocks to be scattered anywhere across physical HBM. Memory fragmentation drops to **less than 4%** (restricted strictly to the final incomplete physical block of size &lt; B).

#### Copy-on-Write (Forking) & Parallel Sampling
When a request forks multiple parallel output branches (e.g., beam search or multi-candidate sampling), vLLM creates a new Block Table referencing the parent's existing physical blocks while incrementing their **reference count**. Physical blocks are copied (Copy-on-Write) *only* when a child branch writes a new, distinct token to an incomplete block.

---

### 2. Text Generation Inference (TGI) Architecture

Developed by Hugging Face, **TGI** focuses on high-reliability production infrastructure through a decoupled two-tier architecture:

```
[ Client Request ] ──► [ Rust gRPC Frontend Router (Axum framework) ]
                                   │
                                   ├── Tokenization (HuggingFace Fast Tokenizers)
                                   ├── Request Validation & Scheduling
                                   └── SSE / gRPC Streaming Response
                                   │
                                   ▼ (gRPC over Unix Domain Socket)
                       [ Python / C++ PyTorch Engine ]
                                   │
                                   ├── Safetensors Zero-Copy Memory Map
                                   └── FlashAttention-2 / Custom Kernels
```

#### Rust Router & High-Concurrency Scheduler
The frontend router is written in **Rust** using the `Axum` and `tokio` async frameworks. It executes request validation, input tokenization (via Rust `tokenizers`), token-level request queuing, and response streaming completely independent of the Python GIL (Global Interpreter Lock). This guarantees that client connection bursts do not starve GPU execution threads.

#### `safetensors` Direct Memory Mapping
TGI uses the `safetensors` binary model format. Unlike standard PyTorch checkpoints (`.bin` / `.pt`) which use Python `pickle` (requiring full CPU deserialization and memory duplication), `safetensors` allows direct zero-copy memory mapping (`mmap`) from disk into GPU VRAM, enabling sub-second container cold-start times.

---

### 3. SGLang and RadixAttention Prompt Caching

While vLLM optimizes memory paging for individual sequences, **SGLang** (Structured Generation Language) focuses on optimizing KV cache reuse **across multiple distinct requests** through **RadixAttention**.

#### The Radix Tree Data Structure
SGLang maintains a global **Radix Tree** (compressed prefix tree) in host/device memory representing the KV cache state of all historical and active prompts served by the engine.

```
                    [ Root Node (Empty) ]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   "System: You are an AI..."       "User query: Explain..."
   (Tokens 0..128, Block P1)        (Tokens 0..64, Block P5)
            │
      ┌─────┴─────┐
      ▼           ▼
   "Turn 1..."  "Turn 2..."
   (Block P2)   (Block P3)
```

- **Nodes:** Represent token sub-sequences.
- **Edges:** Point to physical KV cache tensor allocations stored in GPU memory.
- **Automatic Prefix Caching (APC):** When a new request arrives, SGLang performs a prefix match search along the Radix Tree. If a matching token prefix is found, the engine reuses the existing KV cache blocks immediately **without re-executing prefill computation**.

#### LRU Eviction & Lock-Free Graph Operations
When GPU VRAM reaches capacity, SGLang applies an **Least Recently Used (LRU)** eviction policy to leaf nodes in the Radix Tree. Intermediate tree nodes with active child requests are protected from eviction.

#### Fast Structured Generation (JSON / Regex Constraints)
SGLang integrates high-performance structured decoding libraries (such as Outlines and XGrammar). Instead of parsing finite-state machine (FSM) regex rules on the CPU for every token step, SGLang pre-compiles regex schemas into compressed state graphs, executing token masking directly within GPU CUDA logits kernels.

---

### 4. LMDeploy and TurboMind Engine Core

**LMDeploy** (developed by OpenMMLab) addresses Python runtime overhead by implementing its execution core, **TurboMind**, entirely in **pure C++** (derived from NVIDIA FasterTransformer).

#### C++ Execution Pipeline
LMDeploy bypasses Python async loops completely during runtime generation. Request queues, batch schedulers, custom CUDA kernels, and memory pools operate inside C++ binary threads, minimizing CPU overhead to &lt; 5μs per token step.

#### Advanced Kernel Fusions & AWQ Precision
TurboMind features heavily fused multi-head attention (MHA) and grouped-query attention (GQA) kernels optimized for NVIDIA Ampere, Hopper, and Ada Lovelace architectures. It provides native support for **AWQ** and **GPTQ (W4A16)** 4-bit weight quantization, executing inline dequantization inside Tensor Core registers for maximum decoding bandwidth.

---

## Comprehensive Multi-Dimensional Engine Comparison Matrix

| Feature / Dimension | vLLM | Text Generation Inference (TGI) | SGLang | LMDeploy |
| :--- | :--- | :--- | :--- | :--- |
| **Core Architecture** | Python Async + C++/CUDA extensions | Rust Frontend Router + Python/C++ Backend | Python Frontend + Radix Tree Cache Manager | Pure C++ Engine Core (TurboMind) |
| **KV Cache Manager** | PagedAttention (Virtual Memory Paging) | Paged Attention + Prefill Cache | RadixAttention (Radix Tree Prefix Cache) | Fused Paged Memory Allocator |
| **Prefix Caching Strategy** | Automatic Prefix Caching (APC) via hash match | Block-level Prefix Reuse | Full Radix Tree Graph matching & LRU eviction | Static / Dynamic Block Reuse |
| **Structured Output Support** | Guided Decoding (Outlines / LM-Format-Enforcer) | Grammars / Regex (JSON schema) | **Native Fast Compressed State Graph (XGrammar)** | Schema-guided Json Decoding |
| **Primary Execution Advantage** | High throughput & broad community model support | Enterprise ops, Rust stability, safetensors cold starts | **Multi-turn Chat & RAG Prompt Reuse Speed** | **Ultra-low latency (Pure C++ execution engine)** |
| **Quantization Support** | FP8, INT8 (SmoothQuant), INT4 (AWQ/GPTQ) | FP8, INT8, AWQ, GPTQ, EETQ | FP8, INT8, AWQ, GPTQ | **Native Fused AWQ / W4A16 & INT8** |
| **Multi-GPU Scaling** | Tensor Parallel (Megatron) & Pipeline Parallel | Tensor Parallel (TP) & Sharded | Tensor Parallel & Pipeline Parallel | Tensor Parallel (TurboMind NCCL core) |
| **Inter-Token Latency (ITL)** | Low (15-25 ms) | Low (15-25 ms) | Low (12-22 ms) | **Extremely Low (8-14 ms)** |

---

## Worked Failure Scenarios

### Scenario 1: vLLM Physical Block Exhaustion Under Heavy RAG Workloads

#### Context
An enterprise document-processing team deployed vLLM serving Mistral-7B on 2x A100 (80GB) GPUs (TP=2) to process incoming legal RAG queries with long input context windows (`S_prompt ≈ 24,000` tokens). During peak traffic, response latency spiked from 1.2 seconds to over 45 seconds, accompanied by continuous engine log warnings: `[vLLM] Free physical blocks low. Swapping out requests to CPU RAM.`

#### Root Cause Analysis
The vLLM `BlockSpaceManager` was configured with default memory parameters (`gpu_memory_utilization=0.90`, `block_size=16`). Processing concurrent prompts of 24,000 tokens required allocating:

```text
Blocks Required Per Prompt = ceil(24000 / 16) = 1500 physical blocks
```

When 10 concurrent requests arrived simultaneously, they demanded 15,000 physical GPU memory blocks, which exceeded the physical GPU KV pool size. Instead of rejecting excess requests, vLLM's scheduler triggered **Request Preemption**, serializing active requests, swapping their KV blocks out over PCIe to host CPU RAM, and re-computing attention prefill steps once GPU memory freed up. This PCIe round-trip swapping destroyed decoding throughput.

#### Step-by-Step Resolution & Python Configuration Fix
1. Enabled Automatic Prefix Caching (`enable_prefix_caching=True`) to share KV blocks across overlapping system prompts.
2. Increased physical block size from 16 to 32 tokens to reduce block table tracking overhead.
3. Configured explicit preemption mode to **Recompute** instead of PCIe Swap, and implemented request queue shedding.

```python
from vllm import AsyncEngineArgs, AsyncLLMEngine

def create_resilient_vllm_engine():
    engine_args = AsyncEngineArgs(
        model="mistralai/Mistral-7B-Instruct-v0.2",
        tensor_parallel_size=2,
        gpu_memory_utilization=0.95,       # Maximize VRAM allocation for KV pool
        block_size=32,                     # 32 tokens/block for better indexing efficiency
        enable_prefix_caching=True,        # Reuse KV cache blocks for shared RAG system prompts
        max_num_seqs=64,                   # Bound maximum active concurrent sequences
        max_num_batched_tokens=32768,      # Cap token compute budget per iteration step
        swap_space=0,                      # Disable PCIe swapping; force recompute/queue shedding
    )
    
    # Initialize Engine
    engine = AsyncLLMEngine.from_engine_args(engine_args)
    return engine

if __name__ == "__main__":
    engine = create_resilient_vllm_engine()
    print("vLLM Engine initialized with prefix caching and zero-swap preemption policy.")
```

#### Verification
- Prefix caching matched 68% of incoming document headers, eliminating prefill computation for shared context.
- PCIe swapping overhead dropped to 0, stabilizing p99 response times at 1.8 seconds.

---

### Scenario 2: RadixAttention Cache Thrashing in SGLang under Non-Overlapping Prompts

#### Context
A software platform deployed SGLang to serve a coding assistant model. While performance was excellent for multi-turn chat sessions, latency degraded significantly (p90 TTFT increased by 400%) when executing automated unit-test generation tasks where input prompts shared zero common text prefixes.

#### Root Cause Analysis
SGLang's RadixAttention engine continuously adds new sequence nodes into its global Radix Tree. Under a workload consisting of non-overlapping, distinct prompts, the tree accumulated thousands of unique leaf nodes. 

Because total VRAM was capped (`mem_fraction_static=0.85`), the engine hit memory pressure limits, triggering frequent **LRU Eviction cycles**. The engine spent significant CPU cycles traversing, locking, and tearing down tree nodes only for newly allocated nodes to be evicted seconds later. This state—known as **Cache Thrashing**—negated the benefits of the Radix Tree.

#### Step-by-Step Resolution & Command-Line Tuning
1. Increased static memory allocation fraction for KV cache from 0.85 to 0.92.
2. Configured maximum tree node eviction thresholds to preserve core system prompt branches while instantly dropping non-reusable dynamic prompt nodes.

```bash
# Launch SGLang server with tuned memory fraction and prefix caching controls
python3 -m sglang.launch_server \
    --model-path Qwen/Qwen2.5-7B-Instruct \
    --tp 2 \
    --mem-fraction-static 0.92 \
    --schedule-conservativeness 1.0 \
    --enable-cache-report \
    --port 30000
```

#### Verification
- Server telemetry (`/get_model_info`) confirmed LRU tree eviction events dropped by 92%.
- Time-To-First-Token (TTFT) for unique non-overlapping prompts stabilized at 22 ms.

---

## Senior Interview Questions & Model Answers

### Question 1
**Explain mathematically how vLLM's PagedAttention eliminates external memory fragmentation and caps internal memory fragmentation compared to contiguous memory allocation.**

**Model Answer:**
In traditional contiguous allocation, a sequence is assigned a fixed memory tensor of size `S_max * D_kv`, where `S_max` is the maximum possible sequence length (e.g., 4096 tokens). If the actual generated sequence length is `S_actual = 500`, the remaining `(S_max - 500) * D_kv` bytes are reserved but unused, causing severe **internal fragmentation**. Furthermore, when variable-length requests terminate, they leave non-contiguous memory gaps across VRAM that cannot fit large new sequences, causing **external fragmentation**.

PagedAttention divides the KV cache into fixed-size physical blocks of size `B` tokens (e.g., `B=16`). 
1. **External Fragmentation:** Memory is allocated in uniform physical block sizes (`B * D_kv`). Because physical blocks do not need to be contiguous in physical memory, any free physical block anywhere in VRAM can be assigned to any request via the Block Table. Thus, **external fragmentation is completely eliminated (0%)**.
2. **Internal Fragmentation:** Memory is allocated dynamically one block at a time as new tokens are generated. Unused reserved space occurs *only* in the final active physical block of a sequence. The maximum memory wasted per sequence is strictly bounded by `(B - 1) * D_kv` bytes. For `B=16`, the internal memory fragmentation fraction is mathematically bounded by:

```text
Internal Fragmentation < B / S_actual
```

For a sequence of 500 tokens with `B=16`, internal fragmentation is &lt; 3.2%, compared to > 87% in contiguous allocation.

---

### Question 2
**Compare SGLang's RadixAttention data structure with vLLM's Automatic Prefix Caching (APC). How do their search overheads and cache eviction mechanisms differ?**

**Model Answer:**
Both systems aim to reuse KV cache blocks across requests, but they use different data structures and eviction strategies:

- **vLLM Automatic Prefix Caching (APC):** Uses a hash-table matching mechanism on physical blocks. Logical blocks of tokens are hashed (e.g., SHA-256 of token IDs). When a new prompt arrives, vLLM computes block-level hashes sequentially. If a block hash matches an existing block in the global block pool, its reference count is incremented.
  - *Eviction:* Relies on standard LRU queues over physical block indices.
  - *Limitation:* Matching operates strictly at discrete block boundaries (e.g., every 16 tokens). Partial sub-block matches are missed.

- **SGLang RadixAttention:** Maintains an explicit **Radix Tree** (compressed trie) data structure where nodes represent arbitrary-length token sequences and edges hold pointers to physical KV cache tensors.
  - *Search Overhead:* Prefix matching executes via a fast graph traversal along Radix Tree edges, matching arbitrary token sub-sequences without being constrained to fixed block boundaries.
  - *Eviction:* Operates directly on the tree structure using a specialized **Radix Tree LRU Eviction** algorithm. When memory is full, leaf nodes (oldest completed request turns) are evicted, while parent nodes (shared system prompts) remain pinned. This makes RadixAttention significantly more efficient for complex multi-turn agentic workflows and tree-search sampling.

---

### Question 3
**In what production environments would you select LMDeploy TurboMind or Hugging Face TGI over vLLM or SGLang?**

**Model Answer:**
- **Choose LMDeploy (TurboMind):** When the primary architectural objective is **ultra-low inter-token latency (ITL)** and minimum per-token CPU overhead for single-tenant or edge-cluster deployments. Because TurboMind is written entirely in pure C++ (derived from FasterTransformer), it eliminates Python async loop latency, GIL lock contention, and PyTorch runtime overhead. It is ideal for real-time speech-to-speech agents or code autocompletion where p99 per-token generation latency must stay under 10 ms.
- **Choose Hugging Face TGI:** When enterprise operational reliability, strict security, and cold-start deployment speed are paramount. TGI's decoupled Rust frontend router provides high isolation against HTTP/gRPC connection spikes, protecting GPU workers from connection starvation. Additionally, native `safetensors` direct zero-copy memory mapping enables rapid scaling in Kubernetes serverless environments (Knative/Keda) where container startup time must be minimized.

---

## Summary & Authoritative References

Modern LLM serving engines optimize distinct layers of the inference pipeline: vLLM revolutionizes GPU memory efficiency via PagedAttention virtual memory management; TGI provides robust enterprise serving through a Rust router and `safetensors` integration; SGLang accelerates prompt-heavy and structured generation workloads via RadixAttention; and LMDeploy maximizes raw execution speed through a C++ TurboMind core.

### References & Documentation
1. **vLLM: Efficient Memory Management for Large Language Model Serving with PagedAttention (SOSP 2023):** [https://arxiv.org/abs/2309.06180](https://arxiv.org/abs/2309.06180)
2. **SGLang: Efficient Execution of Structured Language Model Programs (NeurIPS 2024):** [https://arxiv.org/abs/2312.07104](https://arxiv.org/abs/2312.07104)
3. **Hugging Face Text Generation Inference (TGI):** [https://github.com/huggingface/text-generation-inference](https://github.com/huggingface/text-generation-inference)
4. **LMDeploy TurboMind Engine Documentation:** [https://github.com/ModelFoundry/lmdeploy](https://github.com/ModelFoundry/lmdeploy)
