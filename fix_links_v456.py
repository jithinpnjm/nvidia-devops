import os
import re

replacements = {
    "chapter-1-gpu-execution-and-memory-mental-model": "gpu-architecture-topology-masterclass",
    "chapter-2-pcie-nvlink-and-topology": "gpu-architecture-topology-masterclass",
    "chapter-3-driver-cuda-runtime-and-container-stack": "gpu-software-operator-masterclass",
    "chapter-4-kubernetes-device-plugins-and-gpu-operator": "gpu-software-operator-masterclass",
    "chapter-5-gpu-sharing-mig-time-slicing-mps-and-vgpu": "gpu-sharing-telemetry-masterclass",
    "chapter-6-gpu-telemetry-dcgm-and-health": "gpu-sharing-telemetry-masterclass",
    "chapter-7-capacity-and-failure-domain-design": "gpu-sharing-telemetry-masterclass",

    "chapter-1-classify-the-ai-workload-before-designing-infrastructure": "ai-workloads-training-masterclass",
    "chapter-2-training-architecture-compute-data-checkpoints-and-collectives": "ai-workloads-training-masterclass",
    "chapter-3-llm-inference-prefill-decode-batching-and-kv-cache": "llm-inference-serving-masterclass",
    "chapter-4-serving-frameworks-and-the-platform-boundary": "llm-inference-serving-masterclass",
    "chapter-5-autoscaling-inference": "ai-autoscaling-rag-masterclass",
    "chapter-6-distributed-and-disaggregated-inference": "ai-autoscaling-rag-masterclass",
    "chapter-7-state-caches-and-rag-dependencies": "ai-autoscaling-rag-masterclass",
    "chapter-8-security-and-tenancy-for-ai-platforms": "ai-autoscaling-rag-masterclass",
    "chapter-9-performance-and-cost-engineering": "ai-autoscaling-rag-masterclass",

    "chapter-1-distributed-systems-performance-for-gpu-jobs": "ai-networking-rdma-masterclass",
    "chapter-2-ethernet-fundamentals-for-ai-fabrics": "ai-networking-rdma-masterclass",
    "chapter-3-rdma-roce-and-infiniband": "ai-networking-rdma-masterclass",
    "chapter-4-gpudirect-rdma-nic-gpu-topology-and-nccl": "gpudirect-fabric-operator-masterclass",
    "chapter-5-nvidia-network-operator-and-kubernetes-accelerated-networking": "gpudirect-fabric-operator-masterclass",
    "chapter-6-storage-for-ai-datasets-checkpoints-and-model-distribution": "ai-storage-data-pipelines-masterclass",
    "chapter-7-slurm-scheduling-model": "distributed-orchestration-masterclass",
    "chapter-8-kubernetes-slurm-or-both": "distributed-orchestration-masterclass"
}

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    modified = False
    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)
            modified = True
            
    if modified:
        with open(filepath, 'w') as f:
            f.write(content)

for root, _, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or 'build' in root:
        continue
    for file in files:
        if file.endswith('.md') or file.endswith('.tsx') or file.endswith('.ts'):
            replace_in_file(os.path.join(root, file))
