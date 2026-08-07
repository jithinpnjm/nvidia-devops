# Batch 01 — GPU & CUDA Fundamentals — Progress

Volumes: ZTH-01 (What is AI Infrastructure), ZTH-02 (GPU Architecture), ZTH-03 (CUDA Fundamentals), F-04 (docs/volume-04, GPU execution/topology/driver-container stack).

Status values: pending / in-progress / done

| Volume | File | Status | Severity Summary |
|---|---|---|---|
| ZTH-01 | chapter-01-what-is-ai-infrastructure.md | done | low |
| ZTH-01 | chapter-02-why-cpus-became-insufficient.md | done | none |
| ZTH-01 | chapter-03-cpu-vs-gpu.md | done | low |
| ZTH-01 | chapter-04-what-happens-when-chatgpt-answers.md | done | none |
| ZTH-01 | chapter-05-ai-infrastructure-landscape.md | done | none |
| ZTH-01 | chapter-06-modern-ai-factory.md | done | none |
| ZTH-01 | chapter-07-nvidia-ecosystem-overview.md | done | none |
| ZTH-01 | chapter-08-enterprise-ai-platforms.md | done | none |
| ZTH-01 | chapter-09-volume-01-summary.md | done | none |
| ZTH-01 | labs/lab-01-inspect-an-ai-infrastructure-host.md | done | none |
| ZTH-01 | labs/lab-02-trace-an-ai-request-path.md | done | none |
| ZTH-02 | index.md | done | none |
| ZTH-02 | chapter-01-why-gpu-architecture-evolved.md | done | none |
| ZTH-02 | chapter-02-inside-a-modern-nvidia-gpu.md | done | none |
| ZTH-02 | chapter-03-threads-warps-blocks-and-sms.md | done | none |
| ZTH-02 | chapter-04-cuda-cores-tensor-cores-and-rt-cores.md | done | none |
| ZTH-02 | chapter-05-gpu-memory-hierarchy.md | done | none |
| ZTH-02 | chapter-06-scheduling-occupancy-and-instruction-dispatch.md | done | none |
| ZTH-02 | chapter-07-registers-shared-memory-and-local-memory.md | done | none |
| ZTH-02 | chapter-08-global-memory-l1-l2-and-hbm.md | done | none |
| ZTH-02 | chapter-09-divergence-coalescing-and-bottleneck-reasoning.md | done | none |
| ZTH-02 | chapter-10-gpu-topology-peer-access-and-data-paths.md | done | none |
| ZTH-02 | chapter-11-building-a-gpu-performance-model.md | done | none |
| ZTH-02 | chapter-12-volume-02-architecture-summary.md | done | none |
| ZTH-02 | labs/lab-01-inspect-gpu-architecture-and-topology.md | done | none |
| ZTH-02 | labs/lab-02-inspect-gpu-engine-and-memory-behavior.md | done | none |
| ZTH-02 | labs/lab-03-profile-memory-and-warp-efficiency.md | done | none |
| ZTH-02 | labs/lab-04-build-a-topology-aware-gpu-placement-plan.md | done | none |
| ZTH-03 | index.md | done | none |
| ZTH-03 | chapter-01-why-cuda-exists.md | done | none |
| ZTH-03 | chapter-02-cuda-software-stack.md | done | none |
| ZTH-03 | chapter-03-cuda-programming-and-execution-model.md | done | none |
| ZTH-03 | chapter-04-kernel-launch-configuration-and-indexing.md | done | none |
| ZTH-03 | chapter-05-cuda-memory-management-and-data-movement.md | done | none |
| ZTH-03 | chapter-06-synchronization-errors-and-correctness.md | done | none |
| ZTH-03 | chapter-07-streams-events-and-asynchronous-execution.md | done | none |
| ZTH-03 | chapter-08-pinned-memory-and-transfer-overlap.md | done | none |
| ZTH-03 | chapter-09-unified-memory-and-demand-paging.md | done | none |
| ZTH-03 | chapter-10-cuda-graphs-and-repeated-execution.md | done | none |
| ZTH-03 | chapter-11-compilation-binaries-and-compatibility.md | done | none |
| ZTH-03 | chapter-12-profiling-and-production-troubleshooting.md | done | none |
| ZTH-03 | chapter-13-volume-03-summary.md | done | none |
| ZTH-03 | labs/lab-01-inspect-and-validate-a-cuda-environment.md | done | none |
| ZTH-03 | labs/lab-02-build-and-validate-a-cuda-vector-pipeline.md | done | none |
| ZTH-03 | labs/lab-03-build-an-overlapped-cuda-pipeline.md | done | none |
| ZTH-03 | labs/lab-04-profile-and-diagnose-a-cuda-application.md | done | none |
| F-04 | 01-chapter-1-gpu-execution-and-memory-mental-model.md | done | low |
| F-04 | 02-chapter-2-pcie-nvlink-and-topology.md | done | none |
| F-04 | 03-chapter-3-driver-cuda-runtime-and-container-stack.md | done | none |
| F-04 | 04-chapter-4-kubernetes-device-plugins-and-gpu-operator.md | done | none |
| F-04 | 05-chapter-5-gpu-sharing-mig-time-slicing-mps-and-vgpu.md | done | none |
| F-04 | 06-chapter-6-gpu-telemetry-dcgm-and-health.md | done | none |
| F-04 | 07-chapter-7-capacity-and-failure-domain-design.md | done | none |
| F-04 | 08-senior-deep-dive-1-gpu-execution-model-without-cuda-programming-overload.md | done | low |
| F-04 | 09-senior-deep-dive-2-topology-pcie-nvlink-nvswitch-and-numa.md | done | none |
| F-04 | 10-senior-deep-dive-3-driver-cuda-compatibility-and-container-integration.md | done | none |
| F-04 | 11-senior-deep-dive-4-gpu-operator-as-a-dependency-reconciler.md | done | none |
| F-04 | 12-senior-deep-dive-5-sharing-mig-time-slicing-mps-and-vgpu.md | done | none |
| F-04 | 13-senior-deep-dive-6-dcgm-xid-ecc-and-health-semantics.md | done | none |
| F-04 | 14-senior-deep-dive-7-fleet-lifecycle-upgrades-draining-and-known-good-validation.md | done | none |

## Cross-curriculum check (ZTH-02/03 vs F-04)
- DONE — see findings.md "Cross-curriculum check" section. No contradictions found. One low-severity duplication finding (F-04 Ch1 vs ZTH-01/ZTH-03 foundational material). Volumes otherwise cover materially different territory (CUDA/microarchitecture-first vs infrastructure/platform-ops-first).

## Batch Status: ALL 4 VOLUMES COMPLETE (ZTH-01, ZTH-02, ZTH-03, F-04)
