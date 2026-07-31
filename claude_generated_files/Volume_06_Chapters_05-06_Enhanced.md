# Chapter 5 — NVIDIA Network Operator and Kubernetes accelerated networking
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Understand the software automation layer that prepares nodes for high-performance network devices and secondary networks.

Network Operator automates deployment/configuration of networking components such as drivers, device plugins and CNI-related pieces for supported accelerated networking patterns. GPU Operator and Network Operator address different device stacks but may work together for GPU workloads requiring GPUDirect RDMA.

Kubernetes primary Pod networking may remain conventional while workloads receive additional high-performance interfaces via Multus/SR-IOV patterns. The design must define which traffic uses which network and how identity/policy/observability work across both.

## Targeted references
[NVIDIA Network Operator technical blog](https://developer.nvidia.com/blog/streamlining-kubernetes-networking-in-scale-out-gpu-clusters-with-the-new-nvidia-network-operator-1-0/) - Operator component model, accelerated network modes and GPUDirect context.

➕ **The "two networks per pod" architecture, drawn out — this is the mental model the original two paragraphs are describing:**
```
┌─────────────────────────────── Kubernetes Node ───────────────────────────────┐
│                                                                                 │
│   ┌──────────────────── Pod ────────────────────┐                             │
│   │                                              │                             │
│   │  eth0 (primary, CNI-managed, kube-proxy      │──── ClusterIP Services,     │
│   │  Services, DNS, control-plane traffic)       │     API calls, health checks│
│   │                                              │                             │
│   │  net1 (secondary, Multus + SR-IOV VF or      │──── raw RDMA/RoCE traffic,  │
│   │  macvlan, direct to physical NIC)             │     NCCL collective traffic│
│   │                                              │                             │
│   └──────────────────────────────────────────────┘                             │
│         ▲                                    ▲                                 │
│    standard CNI (Calico/Cilium/etc)    SR-IOV Device Plugin + Network Operator │
│                                          (bypasses kube-proxy/iptables entirely)│
└─────────────────────────────────────────────────────────────────────────────────┘
```
This is the concrete answer to "how do RDMA and Kubernetes coexist": they don't share a network — the primary CNI network handles everything Kubernetes-native (Service discovery, policy, observability agents), while the secondary SR-IOV/Multus network gives the training process a near-bare-metal path to the physical NIC, deliberately *outside* the overlay/iptables/kube-proxy path that would otherwise add latency and defeat GPUDirect RDMA entirely.

➕ **What Network Operator actually deploys — the component list the original paragraph names abstractly ("drivers, device plugins, CNI-related pieces"), made concrete:**
| Component | Role |
|---|---|
| MOFED driver container | Installs/manages the Mellanox OFED driver stack on the host, in-cluster, without a host-level package install |
| SR-IOV Network Device Plugin | Discovers NIC virtual functions (VFs) and advertises them as schedulable Kubernetes resources (e.g. `nvidia.com/roce_gdr` style resource names) |
| Multus CNI | Lets a Pod attach more than one network interface — the primary CNI network plus one or more secondary NetworkAttachmentDefinitions |
| RDMA shared/exclusive device plugin | Exposes RDMA devices (`/dev/infiniband/*`) into containers with the correct capability |
| NIC firmware/configuration operator pieces | Ensures link mode, VF count and firmware version match the reference architecture across the fleet |

➕ **Sample evidence a node is correctly prepared — the commands you'd actually run against a Network-Operator-managed node:**
```
$ kubectl get node gpu-node-07 -o json | jq '.status.allocatable' | grep -i rdma
"nvidia.com/roce_gdr": "8"                    ← 8 RDMA-capable VFs advertised as allocatable

$ kubectl describe node gpu-node-07 | grep -A3 "nvidia.com/roce_gdr"
  nvidia.com/roce_gdr  8            8
                                                ← Allocatable matches Capacity: none already claimed

$ kubectl get network-attachment-definitions -A
NAMESPACE   NAME             AGE
training    roce-net-1       14d
```
If `nvidia.com/roce_gdr` shows `0` allocatable on a node that otherwise looks healthy, the fault is almost always upstream of Kubernetes entirely — SR-IOV not enabled in BIOS, VF count not configured on the physical NIC, or the device plugin DaemonSet crash-looping — checking `kubectl get pods -n network-operator` for the device plugin's pod status is the fastest triage step.

➕ **Worked scenario — the identity/policy/observability gap the original text flags but doesn't resolve:**
> **Situation:** A security team asks "what NetworkPolicies apply to this training job's RDMA traffic?" during a compliance review.
> 1. The honest answer, and the one a Senior SA should give without flinching: **NetworkPolicy (Calico/Cilium-enforced) governs the primary CNI network only.** Traffic over the SR-IOV secondary interface bypasses the CNI's packet path entirely — it goes straight to the physical NIC/VF — so standard `NetworkPolicy` objects do not see or filter it.
> 2. Isolation for the RDMA network instead has to come from a different layer: VLAN/subnet segmentation on the physical fabric, VF-level configuration (trusted VF, spoof-check), or the fabric's own access control (partition keys on InfiniBand) — none of which show up in `kubectl get networkpolicy`.
> 3. Observability has the same gap: a service mesh sidecar or CNI-level flow log sees zero packets of the actual training traffic, because it never enters that path. Utilization/error monitoring for the RDMA network has to come from `ethtool`/`ibstat`/fabric telemetry (Chapters 2-4), not from Kubernetes-native network observability tooling.
> **Interview-ready line:** "Kubernetes NetworkPolicy secures the control-plane and service network — it has no visibility into an SR-IOV/RDMA secondary network by design, because that network is deliberately bypassing the CNI's enforcement path for performance. Compliance and observability for that traffic have to be designed at the fabric layer, not the Kubernetes layer."

➕ **Shortcut — one-liner to check whether GPU Operator and Network Operator are both healthy and actually cooperating on a node:**
```bash
kubectl get pods -n gpu-operator -n network-operator --field-selector=status.phase!=Running 2>/dev/null
# empty output = both operator stacks are fully reconciled on this node; anything listed is your starting point
```

## Practice
➕ 1. Explain to an application team why their `NetworkPolicy` allowing traffic only from a specific namespace does not restrict RDMA traffic between their training pods on the secondary network.
➕ 2. A node shows `nvidia.com/roce_gdr: 0` allocatable. List the three layers (BIOS/firmware, device plugin, Kubernetes scheduling) you'd check, in the order that finds the root cause fastest.

---
# Chapter 6 — Storage for AI: datasets, checkpoints and model distribution
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Design storage by access pattern, concurrency, locality and recovery behavior.

| Pattern | Infrastructure concern |
|---|---|
| Millions of small files | metadata operations, directory traversal, client concurrency |
| Large sequential dataset shards | aggregate throughput and client parallelism |
| Frequent checkpoints | write bursts, durability, checkpoint time, restart path |
| Model startup | artifact size, cache locality, parallel pulls, cold-start SLO |
| Vector/RAG stores | query latency, index durability, update pattern |

Parallel filesystems and high-performance object/file layers are common in AI/HPC, but no product name removes the need to measure the workload. Cache/local NVMe can absorb hot artifacts or preprocessing, while durable shared storage provides persistence. Model startup can become a fleet-wide network/storage event during scale-out.

## Worked scenario
**Situation:** GPU utilization oscillates: 100% for a few seconds, then near zero while training continues.

1. Compare GPU duty cycle with data-loader and storage metrics.
2. Measure step timeline: does the idle interval align with batch fetch/preprocessing?
3. Check CPU worker saturation, page cache behavior and storage latency/throughput.
4. Test larger prefetching/local cache or dataset sharding in a controlled run.
5. Only after data supply is ruled out should you focus on GPU kernel inefficiency.

**Conclusion:** Starved GPUs can be a storage/CPU input-pipeline problem.

➕ **The checkpoint-write path, drawn out — this is the "frequent checkpoints" row of the table, as a mechanism:**
```
GPU HBM (model/optimizer state) ──▶ Host pinned RAM ──▶ page cache ──▶ storage client
        (large, synchronous            (staging copy,        (buffered           (NFS/parallel-FS/
        GPU→CPU copy — this             blocks training        writes here        object client —
        is often what "pauses           if too slow)            can hide          may itself block
        training" during a                                     true storage       or throttle)
        checkpoint)                                             latency briefly)
```
The oscillation pattern in the worked scenario's "Situation" (100% then near-zero) has *two* structurally different root causes that share a symptom, and this diagram plus the dataset-loading diagram below are how you tell them apart: a **checkpoint stall** is periodic at a fixed step interval (matches your `--save_every_n_steps` config exactly) and blocks the GPU for the *entire* checkpoint duration; a **dataloader stall** (below) is periodic at the batch/shard boundary and is usually shorter and more frequent. Confusing the two sends you tuning the wrong subsystem.

➕ **The dataset-fetch path — the other half of the oscillation, and the more common root cause per the worked scenario's conclusion:**
```
storage (NFS/parallel-FS/object) ──▶ page cache ──▶ CPU decode/augment workers ──▶ pinned host buffer ──▶ GPU
         (network+disk latency,         (helps only         (CPU-bound —              (final PCIe hop —
          especially on cold/            on repeat reads,     JPEG decode, resize,       rarely the actual
          small-file access)             not first pass)      tensor conversion)         bottleneck)
```
The single highest-value diagnostic in this whole chapter: **capture GPU duty cycle on the same time axis as dataloader worker queue depth.** If the queue depth hits zero right before every GPU idle period, workers aren't producing batches fast enough — that's a CPU/storage-throughput problem, not a GPU problem, and matches step 5 of the worked scenario exactly ("only after data supply is ruled out should you focus on GPU kernel inefficiency").

➕ **Sample annotated evidence — the artifacts you'd actually gather for the worked scenario, in order:**
```
$ nvidia-smi dmon -s u -c 5
# gpu    sm   mem   enc   dec
    0    98    91     0     0     ← healthy window
    0     3     2     0     0     ← near-zero: this is the "near zero" half of the oscillation
    0     4     1     0     0
    0    97    90     0     0     ← back to healthy — total idle span ~2 samples ≈ matches batch-fetch interval
    0    98    92     0     0

$ iostat -x 1 3   (during the SAME idle window)
Device   r/s     rkB/s   await   %util
nvme0n1  12400   198400   0.31    88%      ← storage IS busy — this is doing real work, not sitting idle
```
The combination — GPU idle *and* storage busy, on the same timestamp — is the smoking gun for "data supply problem," and it's the specific evidence the worked scenario's step 1 ("compare GPU duty cycle with data-loader and storage metrics") is asking you to produce. GPU idle with storage *also* idle instead points at CPU-side decode/augmentation (check `mpstat`/per-core CPU, not storage) or a dataloader worker-count misconfiguration, not the storage layer at all — this distinction is worth stating explicitly, since "storage" gets blamed by default far more often than the evidence supports.

➕ **Model-startup as a fleet-wide event — the row the table names but doesn't quantify:**
> **Situation:** A 512-GPU inference deployment restarts simultaneously (rolling upgrade, or a bad node pool-wide event). Each node pulls the same 40GB model artifact from shared storage/registry at once.
> 512 nodes × 40GB = 20TB of near-simultaneous read demand against one storage backend/registry, in a burst measured in seconds-to-minutes, not the steady-state read pattern that backend was likely benchmarked against. This is structurally identical to a "thundering herd" cache-stampede problem, just at the storage layer instead of the application-cache layer.
> Mitigations, with the tradeoff each one makes explicit: (a) P2P/BitTorrent-style artifact distribution across nodes (e.g. Kraken, Dragonfly) — trades storage-backend load for node-to-node network load and added complexity; (b) staggered/rolling restart with a concurrency cap — trades total rollout time for reduced peak load; (c) local NVMe caching of the artifact with a warm-standby pool — trades storage capacity/cost for eliminated repeat-pull cost, but only helps repeat startups, not the first cold fleet-wide pull.
> **Interview-ready line:** "Model startup at fleet scale isn't a storage-capacity problem, it's a storage-concurrency problem — the artifact easily fits, the simultaneous fan-out of identical reads is what breaks the SLO."

➕ **Shortcut — the one question that separates all five rows of the pattern table, fast, in an interview:** *"Is the bottleneck bytes-per-second, operations-per-second, or simultaneous-clients? Small files = ops/sec (metadata), sequential shards = bytes/sec (throughput), checkpoints = sustained write bytes/sec + durability, model startup = simultaneous-clients (fan-out), vector/RAG = ops/sec at low latency (not throughput)."* Naming which of the three dominates for a given pattern is the fast way to pick the right storage design lever without reciting product names.

➕ **Additional practice for this chapter (the original Fourth Edition Practice section appears once, after Chapter 8 — see Volume_06_Chapters_07-08_Enhanced.md):**
➕ 1. Given `nvidia-smi dmon` showing GPU idle and `iostat` showing storage also idle during the same window (not busy), name the two most likely root causes and the single command you'd run next to distinguish between them.
➕ 2. Design the artifact-distribution strategy for a 1,024-node inference fleet restart, given a 60-second cold-start SLO and a 25GB model — state which mitigation from the model-startup scenario above you'd pick first and why.
