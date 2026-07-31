# Visual Reference Collection

## Purpose and safe use

This is a research and insertion backlog for the NVIDIA Senior DevOps and AI Infrastructure Academy. It covers the 162 site lessons, 67 Claude-generated enhancement files, and the fourth-edition source bundle.

Prefer **original, repository-owned diagrams** based on the briefs below. Use the linked official diagrams as technical references and provide an attribution link in the lesson. Do not download, crop, or rehost vendor documentation images until their terms permit that use. Kubernetes source diagrams are especially useful as style references; NVIDIA pages are the technical authority for NVIDIA-specific components.

Recommended output format: SVG for diagrams, WebP for photographs or screenshots, 16:9 for section heroes, and 3:2 or 4:3 for in-flow explainers. Every image needs descriptive alt text and a caption that says what the learner should notice.

## Curriculum map

| Volume | Core topics and learning points | Best visual treatment |
| --- | --- | --- |
| 01 Linux foundations | processes/threads, CPU pressure, memory/OOM, filesystems and block I/O, DNS/TCP/NAT/TLS, namespaces/cgroups, systemd, host readiness | process/lifecycle flows, kernel boundary diagrams, diagnostic decision trees |
| 02 Production Python | interpreter/object model, data structures, functions, files/config, exceptions, logging, subprocess, HTTP retries, OOP, concurrency, testing, profiling, CLI/CI | data-flow diagrams, state machines, sequence diagrams, decision tables |
| 03 Kubernetes platform | API server/etcd, scheduler, kubelet/CRI, networking, storage, RBAC, autoscaling, operators/GitOps, upgrades, admission/policy | cluster architecture, request paths, reconciliation loops, lifecycle diagrams |
| 04 GPU foundations | GPU execution/memory, PCIe/NVLink/NUMA, driver/CUDA/containers, GPU Operator, MIG/MPS/vGPU, DCGM, capacity and fleet lifecycle | hardware topology, software-stack layers, partition maps, health signal flow |
| 05 AI workloads | training, collectives/checkpoints, prefill/decode/KV cache, serving engines, autoscaling, disaggregated inference, RAG, tenancy, cost | data-path, timeline, queueing and control-loop diagrams |
| 06 HPC, networking and storage | distributed performance, Ethernet, RDMA/RoCE/InfiniBand, GPUDirect, Network Operator, storage hierarchy, Slurm, hybrid scheduling | rail-optimized fabric, GPU–NIC topology, data hierarchy, scheduler comparison |
| 07 Observability and reliability | metrics/logs/traces, SLOs, PromQL/cardinality, Kubernetes/GPU telemetry, alerts, incident response and game days | telemetry pipeline, trace waterfall, evidence tree, incident timeline |
| 08 Solutions architecture | discovery, data/control paths, trade-offs, Kubernetes vs Slurm, GPU sharing, PoCs, TCO, security, migration, communication | layered reference architecture, decision matrix, stakeholder views |
| 09 Interview practice | reasoning framework, coding and troubleshooting, AI/HPC architecture, whiteboarding, customer discovery, behavioral stories | answer-framework flow, annotated whiteboard, interview decision trees |

## Reference library

### Kubernetes and cloud-native diagrams

| ID | Reference | Best insertion targets | Original-diagram brief |
| --- | --- | --- | --- |
| K1 | [Kubernetes cluster architecture](https://kubernetes.io/docs/concepts/architecture/) | V03 ch. 1–3; V08 AI factory | Control plane, nodes, Pods, kubelet, CRI and network boundary; use colour only for control vs workload plane. |
| K2 | [Kubernetes scheduling framework](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/) | V03 ch. 2, deep dive 3; V09 question set C | Queue → filter → score → reserve → permit → bind; show where GPU topology and preemption influence a decision. |
| K3 | [Kubernetes Services and networking](https://kubernetes.io/docs/concepts/services-networking/) | V03 ch. 4, deep dive 5; V01 DNS/TCP | Client → Gateway/Ingress → Service → EndpointSlice → Pod; call out DNS and policy enforcement points. |
| K4 | [Kubernetes persistent volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) | V03 ch. 5; V05 checkpoints; V06 storage | PVC → StorageClass → provisioner → PV → CSI/backend, plus lifecycle/reclaim arrows. |
| K5 | [Kubernetes diagram guide](https://kubernetes.io/docs/contribute/style/diagram-guide/) | All web lessons | Adopt its caption, alt-text, Mermaid/SVG and visual grammar conventions. |

### GPU hardware, platform and telemetry

| ID | Reference | Best insertion targets | Original-diagram brief |
| --- | --- | --- | --- |
| G1 | [NVIDIA GPU Operator overview](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/) | V04 ch. 4, deep dive 4; V03 deep dive 8 | ClusterPolicy → Operator → driver, toolkit, device plugin, GFD and DCGM DaemonSets; show readiness dependency order. |
| G2 | [NVIDIA MIG partitioning concepts](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/latest/concepts.html) | V04 ch. 5/deep dive 5; V08 GPU sharing | A GPU rectangle split into SM and memory slices, then compare MIG, time slicing, MPS and vGPU in a four-column decision visual. |
| G3 | [GPUDirect RDMA overview](https://docs.nvidia.com/cuda/gpudirect-rdma/) | V06 ch. 4; V04 topology | Before/after paths: NIC → CPU memory → GPU versus NIC → GPU; annotate the shared PCIe-root-complex constraint. |
| G4 | [DCGM Exporter telemetry pipeline](https://docs.nvidia.com/datacenter/dcgm/latest/gpu-telemetry/dcgm-exporter.html) | V04 ch. 6; V07 ch. 5 | GPU/NVML → DCGM → exporter → Prometheus → Grafana/Alertmanager; label device and workload dimensions. |
| G5 | [NVIDIA HGX AI Factory network architecture](https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/network-logical-architecture.html) | V04 ch. 2; V06 fabric; V08 AI factory | One 4-node scalable unit with separate east/west RDMA, north/south and management planes. |
| G6 | [NVIDIA NVL72 components](https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/components.html) | V04 topology/capacity | A simplified scale-up versus scale-out comparison; do not reproduce the product diagram wholesale. |

### AI serving, training and RAG

| ID | Reference | Best insertion targets | Original-diagram brief |
| --- | --- | --- | --- |
| A1 | [NIM LLM architecture](https://docs.nvidia.com/nim/large-language-models/latest/reference/architecture.html) | V05 ch. 4; V09 AI architecture | Client → NIM proxy → engine, with liveness/readiness and metrics side paths. |
| A2 | [NIM multi-node deployment](https://docs.nvidia.com/nim/large-language-models/latest/deployment/multi-node-deployment.html) | V05 training/inference; V06 network | Leader/worker Pods, Ray control plane, TP within node and PP across nodes; use arrows sized by communication intensity. |
| A3 | [Dynamo overall architecture](https://docs.nvidia.com/dynamo/latest/design-docs/overall-architecture) | V05 ch. 6, deep dive 4; V08 decisions | Separate request, control and state planes; include Smart Router, Planner, KV block manager and NIXL. |
| A4 | [Dynamo architecture flow](https://docs.nvidia.com/dynamo/latest/design-docs/architecture-flow) | V05 prefill/decode and KV cache | Colour-coded sequence: request → prefill → KV transfer → decode → completion; pair it with a latency timeline. |
| A5 | [GPUDirect Storage design guide](https://docs.nvidia.com/gpudirect-storage/design-guide/) | V05 checkpoints; V06 ch. 6 | Dataset/checkpoint storage → DMA → GPU memory; contrast CPU bounce-buffer path. |
| A6 | [NVIDIA AI factory building blocks](https://docs.nvidia.com/enterprise-reference-architectures/white-paper/latest/key-building-blocks.html) | V08 layered architecture; V09 whiteboard | A layered AI factory: users/APIs, platform control, compute fabric, storage/data, observability/security. |

### HPC, network and scheduling

| ID | Reference | Best insertion targets | Original-diagram brief |
| --- | --- | --- | --- |
| H1 | [Slurm architecture](https://slurm.schedmd.com/overview.html) | V06 ch. 7, deep dive 5; V08 Kubernetes vs Slurm | User tools → slurmctld → slurmd compute nodes, with accounting and queue/partition concepts. |
| H2 | [Slurm topology guide](https://slurm.schedmd.com/topology.html) | V06 ch. 7–8 | Job placement over a leaf/spine topology; distinguish allocation proximity from network routing. |
| H3 | [NVIDIA InfiniBand rail-optimized topology](https://docs.nvidia.com/infiniband-cluster-bring-up-procedure.pdf) | V06 ch. 2–4, deep dives 1–3 | GPU rails → separate leaf switches → spine; show why rail alignment reduces expensive hops. |
| H4 | [GPUDirect RDMA in GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/gpu-operator-rdma.html) | V06 ch. 4–5 | Kubernetes-native stack: Pod → CUDA → GPU/NIC → RDMA fabric; show DMA-BUF as the recommended path. |
| H5 | [NVIDIA RTX PRO AI Factory overview](https://docs.nvidia.com/enterprise-reference-architectures/rtx-pro-ai-factory/latest/overview.html) | V06 network; V08 reference architectures | Use as a photographic/rack-context reference and render an original logical topology. |

### Observability, reliability and operations

| ID | Reference | Best insertion targets | Original-diagram brief |
| --- | --- | --- | --- |
| O1 | [Prometheus architecture](https://prometheus.io/docs/introduction/overview/) | V07 ch. 1–3; V04/V07 DCGM | Targets/exporters → scrape → TSDB → rules → Alertmanager/Grafana; include pull versus Pushgateway. |
| O2 | [OpenTelemetry observability primer](https://opentelemetry.io/docs/concepts/observability-primer/) | V07 ch. 1, 7, deep dive 3 | One request shown as a trace waterfall, correlated log line and metric time series. |
| O3 | [OpenTelemetry trace concepts](https://opentelemetry.io/docs/concepts/signals/traces/) | V07 ch. 7; V05 inference | Propagated trace context across gateway, router, serving engine and vector store. |
| O4 | [DCGM Exporter installation and component relationships](https://docs.nvidia.com/datacenter/dcgm/latest/installation/install-dcgm-exporter.html) | V07 GPU observability | Node-level components and failure boundaries: driver/NVML, DCGM, exporter, Operator and Prometheus. |
| O5 | [Linux cgroup v2 documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html) | V01 containers/resources; V03 node pressure | Hierarchical cgroups, controller limits and container namespace view; pair with an OOM evidence tree. |

## High-priority insertion backlog

Use these first. They create the most explanatory value across multiple lessons and avoid decorative imagery.

1. **Kubernetes request-to-Pod path** — V03 ch. 1/3/4; V01 DNS/TCP; V09 Kubernetes troubleshooting. References K1/K3. One diagram can be reused with highlighted segments per lesson.
2. **GPU software dependency stack** — V04 ch. 3/4, V03 deep dive 8, V07 DCGM. References G1/G4. Host driver → container toolkit → runtime → device plugin → workload → telemetry.
3. **GPU topology and data-motion map** — V04 ch. 2, V06 ch. 4, V05 collectives. References G3/G5. CPU/NUMA, PCIe root complex, NIC, GPU and NVLink paths.
4. **MIG and sharing decision visual** — V04 ch. 5, V08 capacity recommendation. Reference G2. Start with hard isolation vs sharing efficiency, then match workload type to option.
5. **LLM serving timeline** — V05 ch. 3/5/6, V07 inference observability, V09 AI architecture. References A3/A4. TTFT = queue + prefill; ITL = decode; make KV cache state visible.
6. **AI factory reference architecture** — V08 ch. 2/8, V09 whiteboard, V06 hybrid platform. References A6/G5. Layered view plus two overlay modes: training and inference.
7. **RDMA rail-optimized fabric** — V06 ch. 2–4, V04 topology, V09 HPC questions. References H3/H4. Include one good and one bad cross-rail path.
8. **Telemetry-to-decision loop** — V07 ch. 1–8, V04 DCGM, V05 autoscaling. References O1/O2/O4. Signals → correlation → hypothesis → safe mitigation → learning.
9. **Incident evidence tree** — V01 troubleshooting, V03 node pressure, V07 playbooks, V09 interview method. Draw original: symptom → scope → layers → evidence → reversible mitigation.
10. **Solutions-architecture whiteboard template** — V08 and V09. A reusable blank canvas: requirements, assumptions, data plane, control plane, security, SLOs, cost and open risks.

## Per-volume insertion guidance

### Volume 01 — Linux foundations

- Use original cutaway diagrams for process states, virtual memory/page-cache/OOM, file descriptor → VFS → block layer → device, and cgroup/namespace boundaries.
- Add a packet journey and TCP state diagram to networking; use a DNS resolution sequence, not a stock network photograph.
- Turn every incident exercise into an evidence tree with the first three safe commands at each branch.
- Reference O5 for cgroup semantics; use the systemd and Linux documentation as technical confirmation, but render a consistent academy style.

### Volume 02 — Production Python

- Use code-adjacent visuals: call stack and object references, `list`/`set`/`dict` selection map, retry state machine, producer/consumer backpressure, subprocess boundary, and test pyramid.
- Use simple original SVGs or Mermaid only; external photos add little instructional value here.
- The capstone should include CLI input → validation → collector → normalized record → report/exit-code data flow.

### Volume 03 — Kubernetes platform

- Put K1 in the API-server introduction and use cropped/re-rendered focus diagrams for scheduler, kubelet/CRI and networking chapters.
- Add lifecycle visuals for Pod creation, PVC binding, reconciliation, rolling upgrade and admission decision.
- Use K2 in scheduler deep dives and K3/K4 in networking/storage lessons; do not show Ingress as the future-facing default without pairing Gateway API language.

### Volume 04 — GPU foundations

- Prioritize topology over product photography: GPU execution/memory hierarchy, PCIe/NVLink/NVSwitch/NUMA, driver-to-container layers and MIG slices.
- Use G1 for Operator dependency order and G4 for health/telemetry. Attach the same topology graphic to failure-domain and performance lessons, highlighting a different failure point each time.

### Volume 05 — AI workloads

- Use an end-to-end training path: data → dataloader → GPUs/collectives → checkpoint store; then a serving path: request → queue → prefill → KV cache → decode → stream.
- For RAG, show ingest, chunk/embed/index and query/retrieve/rerank/generate as separate paths. For agentic systems, show bounded tool-loop, budget and tracing boundaries.
- References A1–A5 provide the most technically current visual anchors.

### Volume 06 — HPC, networking and storage

- Use a leaf/spine, rail-optimized fabric with explicit GPU/NIC affinity. H3 and G5 are the key references.
- Add before/after data paths for conventional DMA, GPUDirect RDMA and GPUDirect Storage.
- Show Kubernetes and Slurm as complementary control planes over shared compute/storage fabric, not as mutually exclusive brands.

### Volume 07 — Observability and reliability

- Use a three-signal correlation board (metrics, logs, traces), then add GPU signals and inference-specific TTFT/ITL views.
- O1 and O2 support a reusable Prometheus/OTel baseline. Every alert chapter needs a visual distinguishing symptom, saturation and root cause.
- Incident chapters should use timelines, blast-radius maps, hypothesis tables and decision/evidence trees.

### Volume 08 — Solutions architecture

- Use a repeatable layered AI-factory visual with overlays for security, governance, capacity, cost and observability.
- Decision work needs matrices and scenario diagrams, not generic datacenter images. Use the same base visual to demonstrate Kubernetes vs Slurm, GPU sharing and migration choices.
- H5 and A6 can inspire high-quality hero imagery; preserve the technical explanation in an original diagram.

### Volume 09 — Interview practice

- Build reusable interview visuals: clarify → model → hypothesize → test → recommend, a discovery-question map, an architecture whiteboard template and an incident evidence tree.
- Pair hard questions with an annotated “good answer” structure; visuals should expose reasoning and trade-offs, not give a memorized answer.

## Asset metadata template

Maintain a row per final asset in a future `public/img/visuals/manifest.json` or Markdown table:

| Field | Example |
| --- | --- |
| `id` | `v05-llm-serving-timeline` |
| `lesson` | `docs/volume-05/03-...md` |
| `purpose` | Explain TTFT versus ITL and where KV cache is reused. |
| `type` | Original SVG sequence/timeline |
| `reference_ids` | `A3, A4` |
| `source_url` | Official technical reference URL |
| `license_reviewed` | `false` until verified |
| `alt` | Request flow through queue, prefill, KV cache and decode workers. |
| `caption` | TTFT accumulates before first token; ITL repeats during decode. |

## Visual quality rules

- One visual, one teaching claim; split diagrams that try to teach topology, lifecycle and trade-offs simultaneously.
- Use the same symbols for control plane, data plane, storage, GPU and observability across the academy.
- Make data movement directional and label the expensive boundary: network hop, CPU bounce buffer, storage read, model load or cache miss.
- Pair diagrams with a worked scenario. A learner should be able to point to the bottleneck or failure domain.
- Avoid screenshots of dashboards unless the lesson teaches how to read that exact dashboard. Render representative charts with synthetic labels instead.
- Use photographs only for hardware orientation (rack, NIC/GPU placement) and keep them supplemental to original explanatory diagrams.
