# Batch 13 Progress — AI Factory, Customer Workshops, Capstone (ZTH-21, ZTH-22, ZTH-24)

Note: each volume directory also contains `*-placeholder.md` stub files (empty section headers,
no content) alongside the real chapter files. These are excluded from review as non-content.

| Volume | File | Status | Severity Summary |
|---|---|---|---|
| ZTH-21 | index.md | done | low:1 (stub, "content to be developed") |
| ZTH-21 | chapter-01-ai-factory-fundamentals-and-design-principles.md | done | high:1, low:1 |
| ZTH-21 | chapter-02-gpu-compute-cluster-design.md | done | high:2, medium:1 (FP32 pattern + TFLOPS 1000x slip) |
| ZTH-21 | chapter-03-high-speed-networking-architecture.md | done | high:1, medium:1, low:1 (AllReduce BW 6x recurrence) |
| ZTH-21 | chapter-04-storage-infrastructure-for-ai-pipelines.md | done | high:1, low:1 (10^6 magnitude slip) |
| ZTH-21 | chapter-05-power-delivery-and-thermal-management.md | done | clean |
| ZTH-21 | chapter-06-software-stack-integration.md | done | low:1 |
| ZTH-21 | chapter-07-multi-node-distributed-training.md | done | clean |
| ZTH-21 | chapter-08-inference-serving-at-scale.md | done | high:1, medium:1 (1000x cost slip recurrence) |
| ZTH-21 | chapter-09-multi-region-deployment.md | done | clean |
| ZTH-21 | chapter-10-monitoring-and-operations.md | done | high:1 (fabricated DCGM field names recurrence) |
| ZTH-21 | chapter-11-capacity-planning-and-forecasting.md | done | high:1, medium:1 |
| ZTH-21 | chapter-12-cost-optimization-and-resource-efficiency.md | done | high:1, low:2 (PFLOPS 45x slip recurrence) |
| ZTH-21 | chapter-13-reference-architecture-100-gpu-training-cluster.md | done | high:1 (1000x $/TFLOP slip recurrence) |
| ZTH-21 | chapter-14-reference-architecture-multi-region-inference-deployment.md | done | high:1 (cost/1M-tokens slip recurrence, drives closing claim) |
| ZTH-21 | labs/lab-01-cluster-design-workshop.md | done | medium:1 |
| ZTH-21 | labs/lab-02-networking-simulation.md | done | high:1 (recurrence of AllReduce bandwidth-math pattern) |
| ZTH-21 | labs/lab-03-storage-pipeline-design.md | done | low:1 |
| ZTH-21 | labs/lab-04-capacity-planning-exercise.md | done | low:1 |
| ZTH-22 | index.md | done | clean |
| ZTH-22 | chapter-01-consulting-methodology-for-customer-engagement.md | done | high:1, low:1 (10x power-cost slip) |
| ZTH-22 | chapter-02-banking-and-financial-services.md | done | high:1, medium:1 (A100 FP64 spec fabricated) |
| ZTH-22 | chapter-03-generative-ai-and-large-language-models.md | done | high:2 (1000x cost-per-token slips, headline claims wrong) |
| ZTH-22 | chapter-04-automotive-and-autonomous-vehicles.md | done | high:1, low:1 (wrong-industry content mix-up) |
| ZTH-22 | chapter-05-pharmaceuticals-and-drug-discovery.md | done | high:1 (mutually inconsistent speedup figures) |
| ZTH-22 | chapter-06-telecommunications.md | done | clean |
| ZTH-22 | chapter-07-healthcare-and-medical-imaging.md | done | high:1 (7x inconsistent ROI benefit figure) |
| ZTH-22 | chapter-08-manufacturing-and-predictive-maintenance.md | done | high:1, medium:1 (SLA falsely marked met; ROI inconsistency) |
| ZTH-22 | chapter-09-scientific-research-and-simulation.md | done | high:1 (1000x petaflop-sec slip + 865x runtime mismatch) |
| ZTH-22 | labs/lab-01-banking-use-case-workshop.md | done | high:1 (impossible GPU memory readings, fabricated-output recurrence) |
| ZTH-22 | labs/lab-02-llm-serving-design.md | done | high:1 (throughput formula 8x off from stated conclusion) |
| ZTH-22 | labs/lab-03-edge-deployment.md | done | medium:1 (TOPS/TFLOPS mix-up) |
| ZTH-22 | labs/lab-04-medical-imaging-pipeline.md | done | high:1 (8.2ms vs 8sec self-contradiction, 1000x slip recurrence) |
| ZTH-24 | index.md | done | clean |
| ZTH-24 | chapter-01-cuda-kernel-optimization.md | done | high:1 (FLAGSHIP: entire project built on H100 FP32=1456 TFLOPS, real is ~67, 22x error) |
| ZTH-24 | chapter-02-allreduce-algorithm-design.md | done | high:1, medium:1 (IB bandwidth 32x self-contradiction) |
| ZTH-24 | chapter-03-distributed-training-fault-tolerance.md | done | medium:1 (ResNet-50 size 12x overstated) |
| ZTH-24 | chapter-04-observability-system-design.md | done | high:1 (100x data-point/storage slip, self-contradicted later in file) |
| ZTH-24 | chapter-05-troubleshooting-incident-response.md | pending | |
| ZTH-24 | chapter-06-mig-configuration-multi-tenant.md | pending | |
| ZTH-24 | chapter-07-kubernetes-gpu-scheduling.md | pending | |
| ZTH-24 | chapter-08-security-architecture-audit.md | pending | |
| ZTH-24 | chapter-09-capacity-planning-forecast.md | pending | |
| ZTH-24 | chapter-10-training-cluster-design.md | pending | |
| ZTH-24 | chapter-11-inference-serving-design.md | pending | |
| ZTH-24 | chapter-12-research-infrastructure-design.md | pending | |
