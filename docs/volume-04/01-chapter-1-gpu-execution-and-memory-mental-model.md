---
title: "Chapter 1 - GPU execution and memory mental model"
slug: "chapter-1-gpu-execution-and-memory-mental-model"
sidebar_position: 1
description: "Chapter 1 - GPU execution and memory mental model — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
**VOLUME 4**

**GPU and Accelerated Computing Foundations**

Hardware, memory paths, drivers, CUDA, operators, sharing and operational health

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises

Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.

**Learning outcome:** Explain why GPUs favor throughput parallelism and how compute, HBM bandwidth and data movement become separate bottlenecks.

CPUs optimize low-latency general-purpose execution with sophisticated control flow and relatively few powerful cores. GPUs dedicate much more silicon to parallel execution and memory throughput. For infrastructure work, you do not need to write CUDA kernels to reason about the system, but you must distinguish compute occupancy from memory bandwidth, device memory capacity and host/device transfer costs.

| Resource | Question |
|---|---|
| Compute/SMs | Are execution units busy doing useful kernels? |
| HBM capacity | Does the model/batch/KV cache fit? |
| HBM bandwidth | Is performance limited by moving data inside device memory? |
| PCIe/NVLink | Is inter-device/host-device transfer the bottleneck? |
| NIC/fabric | Are distributed collectives/network transfers limiting scale? |

## 1.1 Utilization is not a complete performance model

A GPU can report high utilization while throughput is poor because the active kernel is inefficient, memory-bound, serialized by communication, or serving tiny batches with poor economics. Conversely, an interactive low-latency service may intentionally keep headroom. Always pair device metrics with workload outcomes such as samples/s, tokens/s, TTFT, step time or queue delay.

**First host-level orientation**
```
nvidia-smi
nvidia-smi dmon -s pucvmet
nvidia-smi topo -m
```

---

➕ **Mental-model diagram — where each of the five resources in the table above actually sits:**
```
┌───────────────────────────────── HOST ─────────────────────────────────┐
│  CPU cores            Pinned host memory                               │
│      │                      │                                          │
│      └──────────── PCIe / NVLink-C2C ───────────┐                      │
└───────────────────────────────────────────────────┼──────────────────────┘
                                                     │  ← bottleneck #4: PCIe/NVLink
┌────────────────────────────────── GPU ─────────────┼──────────────────────┐
│                                                     ▼                     │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   L2 cache                │
│   │  SM 0  │ │  SM 1  │ │  SM 2  │ │  SM N  │◀──────┐                    │
│   │ warps  │ │ warps  │ │ warps  │ │ warps  │       │                    │
│   │ Tensor │ │ Tensor │ │ Tensor │ │ Tensor │       │  ← bottleneck #1:  │
│   │  Core  │ │  Core  │ │  Core  │ │  Core  │       │    compute/SM      │
│   └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘       │    occupancy       │
│       └──────────┴──────────┴──────────┘            │                    │
│                        │                             │                    │
│                        ▼                             │                    │
│              ┌──────────────────┐                    │                    │
│              │   HBM (device    │◀───────────────────┘                    │
│              │   memory, e.g.   │   ← bottleneck #2: does it fit          │
│              │   80GB on H100)  │   ← bottleneck #3: bandwidth moving     │
│              └──────────────────┘     data between HBM and SMs           │
└──────────────────────────────────┼───────────────────────────────────────┘
                                    │
                          NVLink/NVSwitch to peer GPUs,
                          or NIC/RDMA fabric to other nodes
                          ← bottleneck #5: NIC/fabric for collectives
```
Every "GPU is slow" ticket in this role reduces to figuring out which of these five arrows is saturated — the rest of this volume is instrumentation for exactly that question.

➕ **Diagram: on-GPU memory hierarchy — capacity down, bandwidth/latency the opposite way**
```
        FASTEST / SMALLEST                                   SLOWEST / LARGEST
        ┌─────────────┐
        │  Registers  │  per-thread, KB-scale, ~1 cycle latency
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │ Shared mem/  │  per-SM, tens of KB, program-managed cache
        │   L1 cache   │
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │   L2 cache   │  shared across all SMs, tens of MB
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │     HBM      │  device memory, tens of GB (e.g. 80GB on H100),
        │ (device mem) │  highest capacity on-GPU, but far higher latency
        └──────┬──────┘  and lower effective bandwidth per byte than L2/registers
               │  PCIe / NVLink
        ┌──────▼──────┐
        │ Host (DRAM)  │  hundreds of GB-TB, slowest tier, crossed only
        └─────────────┘  for transfers this chapter calls out as bottleneck #4
```
Each step down this pyramid trades capacity for bandwidth and latency — a kernel that keeps its working set in registers/L1/shared memory never touches the HBM bandwidth ceiling from the diagram above; one that spills to HBM on every access is exactly the "memory-bandwidth-bound" case Chapter 1 diagnoses with `dmon`.

➕ **Annotated real `nvidia-smi` output (single-GPU node, field by field):**
```
$ nvidia-smi
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 550.90.07              Driver Version: 550.90.07      CUDA Version: 12.4      |
|-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |
|                                          |                        |               MIG M. |
|===========================================+========================+======================|
|   0  NVIDIA H100 80GB HBM3          On  | 00000000:1B:00.0 Off  |                    0 |
| N/A   52C    P0            312W / 700W |  71232MiB / 81559MiB |      97%      Default |
|                                          |                        |             Disabled |
+-----------------------------------------------------------------------------------------+
```
Reading order that matters in an incident: **`GPU-Util 97%`** looks great in isolation — but check **`Memory-Usage 71232/81559MiB`** (87% of HBM used, close to OOM headroom) and **`Pwr:Usage/Cap 312W/700W`** (only 45% of power budget) *together*. High util + low power draw + high memory pressure is the classic signature of a **memory-bandwidth-bound kernel** (SMs are busy waiting on HBM fetches, not doing FLOPs) — not a compute-bound one. `Perf P0` means the GPU is at its highest performance state (not throttled by power/thermal); if you saw `P2`/`P3` here instead, that's a different investigation entirely (clock throttling, covered in Chapter 6).

➕ **Annotated `nvidia-smi dmon -s pucvmet` output (the flag string is not arbitrary — `p`=power, `u`=utilization, `c`=clocks, `v`=violations/voltage, `m`=memory, `e`=ECC, `t`=temperature):**
```
$ nvidia-smi dmon -s pucvmet -c 3
# gpu    pwr  gtemp  mtemp    sm   mem   enc   dec   jpg   ofa  mclk  pclk
# Idx      W      C      C     %     %     %     %     %     %   MHz   MHz
    0    312     52     48    97    64     0     0     0     0  2619  1980
    0    308     52     48    96    61     0     0     0     0  2619  1980
    0    118     46     41    22     8     0     0     0     0  2619   990
```
The third sample is the interesting one: **`sm=22%`, `mem=8%`, `pclk` (SM clock) dropped from 1980→990MHz** while `mclk` (memory clock) held steady — this is a launch-bound / small-batch gap (the GPU ran out of queued work and clocked down), not thermal or power throttling (temps and power both dropped in step with utilization, not the other way around). Cross-reference: if `pclk` drops while `gtemp`/`mtemp` stay flat but power stays *high*, suspect thermal/power throttling instead — the *order* in which metrics move is the diagnostic signal, not any single column.

➕ **Extra worked scenario — prefill vs decode, the AI-infra consequence of "compute-bound vs memory-bound" that the JD expects you to know cold:**
> **Situation:** An LLM inference service reports 95% GPU utilization during prefill (processing the prompt) and also 95% during decode (generating tokens one at a time), yet decode throughput per GPU-second is far lower and TTFT-adjacent metrics look fine while tokens/s during generation is disappointing relative to the GPU's advertised FLOPs.
> 1. Prefill processes the whole prompt as one large matrix multiply — high arithmetic intensity, SMs stay fed from HBM efficiently, utilization number reflects real compute work. This is compute-bound.
> 2. Decode generates one token at a time — each step re-reads the full KV cache and model weights from HBM for comparatively little new compute. Arithmetic intensity collapses. SMs still show high "utilization" because they're issuing memory requests almost continuously, but they're stalled waiting on HBM bandwidth, not doing FLOPs. This is memory-bandwidth-bound.
> 3. `nvidia-smi dmon` distinguishes them: watch `mclk`/`mem%` (memory subsystem busy) versus effective FLOPs achieved (tokens/s × known FLOPs/token) — decode will show HBM traffic saturated relative to the tiny compute per step.
> 4. Operational consequence: batching more concurrent decode requests (continuous batching) raises arithmetic intensity per HBM fetch — same KV cache/weight read serves more sequences — which is *why* vLLM/TensorRT-LLM-style continuous batching exists, not just "for throughput" abstractly.
> **Interview-ready line:** "100% utilization tells you the SMs are busy, not what they're busy doing — prefill and decode can both show 95% util while one is compute-bound and the other is HBM-bandwidth-bound, and the fix for the second is batching, not more FLOPs."

➕ **Shortcut — one-liner to catch "high util, low power, high memory" (the memory-bound signature) without reading a dashboard:**
```bash
nvidia-smi --query-gpu=utilization.gpu,power.draw,power.limit,memory.used,memory.total --format=csv,noheader,nounits | \
  awk -F',' '{util=$1; pw=$2/$3*100; mem=$4/$5*100; printf "util=%s%% power=%.0f%% mem=%.0f%%", util, pw, mem;
  if (util+0>85 && pw<60) print "  <- HIGH UTIL / LOW POWER = memory-bandwidth-bound, not compute-bound"; else print ""}'
```

➕ **Practice (added — original chapter had no dedicated Practice section; this one anchors the chapter's core distinction):**
1. Given only `nvidia-smi dmon -s pucvmet` output with `sm=98%`, `pclk` at max, and `power.draw` near `power.limit`, argue whether the kernel is compute-bound or memory-bandwidth-bound, and name the one additional metric that would prove it either way.
2. Explain to an interviewer why "GPU utilization" as reported by `nvidia-smi` is a *busy/idle* signal, not a FLOPs-achieved signal, using the prefill/decode scenario above without reciting it verbatim.
3. ➕ Write the one-line `awk` triage above from memory during a mock interview; explain why `power.draw/power.limit` is a better throttling proxy than `temperature.gpu` alone (power caps trigger before thermal caps on most data-center GPUs under sustained load).
