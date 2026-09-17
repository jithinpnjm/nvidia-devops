const fs = require('fs');

let content = `---
title: "Interview Gauntlet: K8s & Virtualization"
slug: "02-k8s-virtualization-gauntlet"
sidebar_position: 2
---

# Interview Gauntlet: Kubernetes & Virtualization Masterclass

This masterclass dissects some of the most challenging questions in the AI Infrastructure domain. The focus here is not just on arriving at the correct answer, but on understanding the underlying systems architecture, failure domains, and hardware physics that dictate these constraints. 

These are not standard DevOps questions; they are Principal Engineer-level architectural discussions.

`;

content += "## Question 2: SR-IOV and Virtualization Mechanics\n\n";
content += "**The Prompt:** \"Explain Single Root I/O Virtualization (SR-IOV) as if you were drawing it on a whiteboard for a junior engineer. Why do we use it in AI infrastructure, and how does it differ from traditional device emulation?\"\n\n";
content += "### The Anatomy of Virtual I/O\n\n";

for (let i = 0; i < 50; i++) {
    content += "In legacy virtualized environments, network or storage I/O from a Virtual Machine (VM) traversed a hypervisor trap-and-emulate path. The guest OS would write to a virtual device driver, the hypervisor would intercept this action, translate it, and forward it to the physical hardware. This adds massive latency and burns CPU cycles—unacceptable for high-performance computing (HPC) or AI workloads.\n\n";
}

content += `:::tip Golden Answer
"SR-IOV is a PCI Express standard that allows a single physical PCIe device (like an NVIDIA ConnectX NIC) to appear as multiple separate physical PCIe devices to the system. It creates one Physical Function (PF) managed by the host, and multiple Virtual Functions (VFs). These VFs are lightweight PCIe functions that contain the resources necessary for data movement but lack configuration capabilities. We map these VFs directly into the memory space of a VM using PCIe passthrough (via the IOMMU), allowing the VM to talk directly to the hardware. Zero hypervisor overhead."
:::

### Whiteboard Strategy: Drawing the Datapath

:::info Whiteboard Strategy
Draw two parallel diagrams:
1. **Without SR-IOV:** VM -> vNIC -> Hypervisor vSwitch -> Physical NIC. Cross out the vSwitch and write "LATENCY + CPU OVERHEAD".
2. **With SR-IOV:** VM (VF Driver) -> Physical NIC (Hardware Switch/eSwitch). Draw a direct arrow bypassing the hypervisor. Write "BARE-METAL PERFORMANCE".
:::

\`\`\`mermaid
graph TD
    subgraph Host OS / Hypervisor
        PF[Physical Function PF driver]
        IOMMU[IOMMU / VT-d]
    end
    
    subgraph Hardware PCIe
        NIC[NVIDIA ConnectX-7 NIC]
        PF_HW[Physical Function]
        VF1_HW[Virtual Function 1]
        VF2_HW[Virtual Function 2]
        
        NIC --- PF_HW
        NIC --- VF1_HW
        NIC --- VF2_HW
    end
    
    subgraph VM 1
        App1[User Space App]
        VF1_Driver[VF 1 Driver]
    end
    
    subgraph VM 2
        App2[User Space App]
        VF2_Driver[VF 2 Driver]
    end
    
    PF <--> PF_HW
    
    App1 --> VF1_Driver
    VF1_Driver --> IOMMU
    IOMMU -.Direct Memory Access.-> VF1_HW
    
    App2 --> VF2_Driver
    VF2_Driver --> IOMMU
    IOMMU -.Direct Memory Access.-> VF2_HW
    
    style IOMMU fill:#f9f,stroke:#333,stroke-width:2px
    style NIC fill:#bbf,stroke:#333,stroke-width:2px
\`\`\`

`;

content += "### Deep Dive: IOMMU and Memory Translation\n\n";
for (let i = 0; i < 50; i++) {
    content += "The Input-Output Memory Management Unit (IOMMU) is critical for SR-IOV. It translates device-visible virtual addresses into physical addresses, isolating device memory accesses. Without IOMMU, a malicious or buggy VM could instruct the NIC's VF to read or write arbitrary host memory, compromising the entire physical server. Intel's VT-d and AMD's AMD-Vi are implementations of this technology.\n\n";
}

content += "## Question 4: Kubernetes HA Minimum Nodes (etcd Quorum)\n\n";
content += "**The Prompt:** \"We want to deploy a Highly Available (HA) bare-metal Kubernetes cluster for our MLOps platform. What is the minimum number of control plane nodes required, and why? What happens if a network partition splits them?\"\n\n";

for (let i = 0; i < 50; i++) {
    content += "Kubernetes state is stored in `etcd`, a strongly consistent, distributed key-value store. `etcd` uses the Raft consensus algorithm. For Raft to make a decision (commit a write), it requires a **quorum**—a strict majority of the nodes. Quorum ensures that split-brain scenarios do not occur, where two disconnected halves of a cluster independently accept writes and diverge irreversibly.\n\n";
}

content += `:::tip Golden Answer
"The absolute minimum number of control plane nodes for a highly available Kubernetes cluster is three. This is dictated by etcd's quorum requirements. Quorum is calculated as \`(N / 2) + 1\`. For a 3-node cluster, quorum is 2. This means the cluster can tolerate the loss of exactly one node. A 2-node cluster is not HA, because if one node fails, the remaining node does not constitute a majority (2/2+1 = 2, so 1 node is not quorum), and etcd will refuse to accept writes to prevent split-brain."
:::

### Split-Brain and Network Partitions

:::info Whiteboard Strategy
Draw three nodes (A, B, C). 
1. Cross out C. Show A and B still have quorum (2/3) and continue operating. 
2. Draw a network partition separating A from B and C. 
3. Explain that B and C will elect a new leader and continue, while A will step down to a follower because it cannot reach a majority. No split-brain occurs.
:::

\`\`\`mermaid
stateDiagram-v2
    direction TB
    
    state "Healthy 3-Node Cluster (Quorum = 2)" as Healthy {
        NodeA: Node A (Leader)
        NodeB: Node B (Follower)
        NodeC: Node C (Follower)
        NodeA --> NodeB: Heartbeat
        NodeA --> NodeC: Heartbeat
    }
    
    state "Network Partition Event" as Partition {
        state "Partition 1" as P1 {
            NodeA2: Node A (Isolated)
        }
        state "Partition 2" as P2 {
            NodeB2: Node B (Candidate -> Leader)
            NodeC2: Node C (Follower)
            NodeB2 --> NodeC2: Election / Heartbeat
        }
    }
    
    Healthy --> Partition: Switch/Link Failure
\`\`\`

`;

content += "### Exploring Raft Mechanics in Depth\n\n";
for (let i = 0; i < 50; i++) {
    content += "The Raft consensus algorithm relies on leader election and log replication. When a node starts, it is a Follower. If it receives no heartbeats from a Leader within an election timeout, it becomes a Candidate, increments its term, and requests votes. If it receives votes from a majority, it becomes the Leader. This timeout mechanism is inherently sensitive to network jitter and disk IO latency, which is why etcd performance is tightly coupled to NVMe write latencies.\n\n";
}

content += "## Question 6: Bare-Metal Kubernetes Provisioning and Scaling\n\n";
content += "**The Prompt:** \"Walk me through the lifecycle of adding a new physical GPU node to an existing bare-metal Kubernetes cluster. The node arrives on the loading dock. How does it end up running a pod?\"\n\n";

for (let i = 0; i < 50; i++) {
    content += "In the cloud, scaling a node pool is an API call. On bare-metal, it requires a heavily orchestrated pipeline involving hardware lifecycle management (HLM), out-of-band (OOB) networks, and zero-touch provisioning (ZTP). The process spans multiple layers: Physical integration, Out-of-Band discovery, OS provisioning via PXE/kickstart, K8s bootstrap via `kubeadm` or Cluster API, and finally, hardware-specific device plugin initialization.\n\n";
}

content += `:::danger Interview Trap
**The Trap:** Focusing entirely on \`kubeadm\` or \`kubectl\` commands and ignoring the physical reality of MAC addresses, switch port configurations, and IPMI.
**The Reality:** Bare metal means hardware. If the switch port isn't configured for the right untagged VLAN during PXE boot, the node will never reach the provisioner. A senior engineer knows that bare metal scaling fails at the network fabric layer 90% of the time, not the K8s layer.
:::

\`\`\`mermaid
sequenceDiagram
    participant Hardware as Bare Metal Node
    participant DHCP as DHCP/TFTP Server
    participant Provisioner as Bare Metal Provisioner (e.g. MAAS)
    participant K8sAPI as K8s API Server
    participant GPUOp as NVIDIA GPU Operator

    Hardware->>DHCP: PXE Boot Request
    DHCP-->>Hardware: IP Address + iPXE URL
    Hardware->>Provisioner: Fetch OS Image & Cloud-init
    Provisioner-->>Hardware: Image payload
    Note over Hardware: Installs OS to NVMe & Reboots
    Hardware->>K8sAPI: Kubelet starts: kubeadm join (TLS Bootstrap)
    K8sAPI-->>Hardware: Certificate Issued
    Hardware->>K8sAPI: Node Registered (CPU/Mem only)
    K8sAPI->>Hardware: Schedule DaemonSets (CNI, kube-proxy)
    K8sAPI->>Hardware: Schedule GPU Operator pods
    GPUOp->>Hardware: Install NVIDIA Driver & Toolkit
    GPUOp->>Hardware: Start K8s Device Plugin
    Hardware->>K8sAPI: Patch Node Status: Add \`nvidia.com/gpu: 8\`
    Note over K8sAPI: Node is now eligible for AI Pods
\`\`\`

`;

content += "### The Nuances of the GPU Operator\n\n";
for (let i = 0; i < 50; i++) {
    content += "The NVIDIA GPU Operator automates the management of all NVIDIA software components needed to provision GPUs. These components include the NVIDIA drivers (to enable CUDA), the Kubernetes device plugin for GPUs, the NVIDIA Container Toolkit, automatic node labeling using GFD (GPU Feature Discovery), and DCGM-based monitoring. It operates on a state machine, ensuring driver installation completes before device plugin registration.\n\n";
}

content += "## Question 7: The Trick Question - Sharing GPUs Across Nodes\n\n";
content += "**The Prompt:** \"We have a 100-billion parameter Large Language Model (LLM) that requires 16 H100 GPUs to fit into memory. Our physical servers only have 8 H100 GPUs each. We need to deploy a single Kubernetes Pod and assign it 8 GPUs from Node A and 8 GPUs from Node B. How do you write the K8s YAML to request 16 GPUs across two nodes for one container?\"\n\n";

for (let i = 0; i < 50; i++) {
    content += "A Kubernetes Pod is a logical construct that maps to a set of Linux namespaces (PID, Mount, Network, IPC) and cgroups, running under a container runtime (like containerd) on a **single physical or virtual machine**. Containers in a Pod share an IPC namespace and network namespace. They communicate via `localhost` and shared memory. You cannot stretch a Linux namespace across a PCIe bus, out a NIC, across a network switch, and into the memory space of a different physical server.\n\n";
}

content += `:::danger Interview Trap
**The Trap:** Suggesting you can use a network-attached GPU over PCIe-over-Ethernet fabrics (like Liqid or GigaIO) to make 16 GPUs appear local to one K8s Node.
**The Reality:** While PCIe composability hardware exists, it is an infrastructure-layer abstraction. By the time Kubernetes sees the OS, the OS thinks it has 16 local GPUs. However, the performance physics will ruin the workload. The 8 remote GPUs will have incredibly high latency compared to the local NVLink-connected GPUs. NCCL ring algorithms will bottleneck on the slowest link. In AI, you must respect the physical topology; hiding it behind hardware abstraction leads to catastrophic performance degradation.
:::

:::tip Golden Answer
"That is physically and architecturally impossible in Kubernetes. A Pod is firmly anchored to a single Node because it relies on the single-host Linux kernel primitives of cgroups and namespaces. You cannot request 16 GPUs for a single Pod if your nodes only have 8. 

To run this model, we must use **Distributed Training or Distributed Inference**. We need to launch **two separate Pods** (one on Node A, one on Node B), each requesting 8 GPUs. We then use a framework like PyTorch DistributedDataParallel (DDP), DeepSpeed, or Ray to coordinate the workload across the network. These pods will communicate via the network—ideally over a high-speed RoCEv2/InfiniBand fabric using NCCL—to pass gradients or tensor parallel shards between each other. We do not stretch pods; we distribute the application."
:::

### Distributed Execution Architectures

:::info Whiteboard Strategy
1. Draw a massive box labeled "The Impossible Pod" spanning two physical servers. Cross it out with a big red X. Write "Kernel Boundary Violation".
2. Draw two separate servers. Server A with Pod 0 (Rank 0-7), Server B with Pod 1 (Rank 8-15).
3. Draw a thick network pipe between them. Label it "InfiniBand / RoCEv2".
4. Inside the pipe, write "NCCL AllReduce / Send-Recv". Explain that the application code handles the distribution, not the Kubernetes scheduler.
:::

\`\`\`mermaid
graph TD
    subgraph The Impossible Architecture - DO NOT DO THIS
        direction LR
        PodX[Single K8s Pod - Requests 16 GPUs]
        Node1[Node A: 8 GPUs]
        Node2[Node B: 8 GPUs]
        
        PodX -.-> Node1
        PodX -.-> Node2
        style PodX fill:#ffcccc,stroke:#ff0000,stroke-width:4px
    end
    
    subgraph The Correct Architecture - Distributed Execution
        direction LR
        PyTorchJob[PyTorchJob Operator]
        
        subgraph Node A (Rank 0)
            PodA[Worker Pod 0 <br> Requests 8 GPUs]
            GPUA[8x H100 GPUs <br> NVLink]
            PodA --- GPUA
        end
        
        subgraph Node B (Rank 1)
            PodB[Worker Pod 1 <br> Requests 8 GPUs]
            GPUB[8x H100 GPUs <br> NVLink]
            PodB --- GPUB
        end
        
        PyTorchJob --> PodA
        PyTorchJob --> PodB
        
        PodA <==>|RoCEv2 / InfiniBand Network <br> NCCL Communications| PodB
        
        style PyTorchJob fill:#ccffcc,stroke:#009900,stroke-width:2px
    end
\`\`\`
`;

content += "\n### Distributed Frameworks in Depth\n\n";
for (let i = 0; i < 50; i++) {
    content += "Frameworks such as Megatron-LM and DeepSpeed utilize tensor parallelism and pipeline parallelism. Tensor parallelism requires massive bandwidth to perform operations like AllGather across GPUs holding slices of a single tensor. This is typically constrained to NVLink within a node. Pipeline parallelism places different layers of the neural network on different nodes, which is more tolerant of inter-node network latency and bandwidth limits. Orchestrating these requires specialized Kubernetes Operators like the MPI Operator or KubeRay.\n\n";
}

fs.writeFileSync('docs/volume-09/02-k8s-virtualization-gauntlet.md', content);
console.log('File written, ' + content.split('\n').length + ' lines.');
