---
title: "K8s Node & Storage Masterclass"
slug: "/volume-03/k8s-node-storage-masterclass"
sidebar_position: 2
---

# Masterclass: Kubernetes Node Operations, CRI, CSI, and Stateful Workloads

## 1. Introduction

Welcome to the ultimate deep dive into the Kubernetes Node layer and Storage subsystem, explicitly tailored for NVIDIA AI Infrastructure and high-performance computing environments.

While the Kubernetes Control Plane is the "brain" of the cluster, the nodes are the "muscle." In an AI Factory, these nodes are highly dense compute powerhouses—frequently equipped with 8x NVIDIA H100 or A100 GPUs, NVLink fabrics, NVSwitches, and heavily optimized PCIe topologies connecting to multi-terabyte NVMe storage or high-throughput network filesystems like WEKA, VAST, or DDN. 

Understanding how the Kubelet interfaces with the Container Runtime Interface (CRI) to spawn Pod sandboxes, inject GPUs, and wire up Container Storage Interface (CSI) volumes is non-negotiable for an AI Platform Engineer. If you cannot debug why a Pod is failing to mount a GPUDirect Storage (GDS) volume or why a `NodeNotReady` loop is crashing your training runs, your $300,000 node is an expensive paperweight.

This masterclass transitions from fundamental node mechanics to advanced container runtime manipulations, storage attachment pipelines, and stateful workload orchestration.

---

## 2. The Kubelet: The Node's Autonomous Agent

The Kubelet is the primary "node agent" that runs on each node. It registers the node with the API server using one of the cloud providers or a bare-metal identifier and continuously monitors the API Server for Pods assigned to its node.

### 2.1 The Sync Loop

The Kubelet does not create Pods; it executes Pod specifications. It operates on a declarative reconciliation loop, commonly called the "Sync Loop" or "PLEG" (Pod Lifecycle Event Generator).

1. **Observe:** Retrieve the desired state (PodSpecs bound to this node) from the API Server.
2. **Analyze:** Compare the desired state against the current state of the node (what containers are actually running, provided by the CRI).
3. **Act:** Invoke CRI, CNI, and CSI plugins to start, stop, or configure containers, networks, and storage to match the desired state.
4. **Report:** Update the API Server with the new status of the Pods and the Node.

### 2.2 Kubelet Architecture Diagram

```mermaid
sequenceDiagram
    participant API as API Server
    participant Kubelet
    participant PLEG as PLEG (Pod Lifecycle Event Generator)
    participant CRI as Container Runtime (Containerd)
    participant CSI as Storage Plugin
    participant CNI as Network Plugin

    API->>Kubelet: Watch: Pod Assigned to Node
    Kubelet->>CSI: NodeStageVolume / NodePublishVolume
    Kubelet->>CRI: RunPodSandbox
    CRI-->>Kubelet: Sandbox ID
    Kubelet->>CNI: Add Network (eth0) to Sandbox
    CNI-->>Kubelet: Network Configured
    Kubelet->>CRI: Pull Images
    Kubelet->>CRI: Create & Start Containers (with NVIDIA Runtime)
    CRI-->>Kubelet: Containers Running
    Kubelet->>API: Update Pod Status (Running)
    
    loop Every Second
        CRI->>PLEG: Container State Changes
        PLEG->>Kubelet: Event (e.g., Container Exited)
        Kubelet->>API: Update Status
    end
```

### 2.3 Deep Dive: Kubelet Configuration

In production, we configure the Kubelet via a `KubeletConfiguration` YAML file, not CLI flags. Let's look at an AI-optimized kubelet config.

```yaml
# /var/lib/kubelet/config.yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
address: 0.0.0.0
authentication:
  anonymous:
    enabled: false
  webhook:
    cacheTTL: 2m0s
    enabled: true
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt
authorization:
  mode: Webhook
  webhook:
    cacheDuration: 5m0s
    cacheAuthorizedTTL: 5m0s
    cacheUnauthorizedTTL: 30s
cgroupDriver: systemd
clusterDNS:
- 169.254.20.10 # NodeLocal DNSCache
clusterDomain: cluster.local
# --- Node Performance & AI Tuning ---
cpuManagerPolicy: static
topologyManagerPolicy: single-numa-node
# memoryManagerPolicy: Static   # requires reservedMemory to be configured; omit unless you need it
systemReserved:
  cpu: "2"
  memory: "4Gi"
kubeReserved:
  cpu: "2"
  memory: "4Gi"
evictionHard:
  memory.available: "2Gi"
  nodefs.available: "10%"
  nodefs.inodesFree: "5%"
  imagefs.available: "15%"
# Max pods reduced due to heavy AI workloads per node
maxPods: 30
podPidsLimit: 4096
# Maximum period between syncs of running containers and config
syncFrequency: 1m0s
```

#### Why these settings matter for AI:
- **`cgroupDriver: systemd`**: Modern Linux distributions use systemd to manage cgroups. Kubernetes must use the same cgroup driver as the container runtime (containerd) to avoid two different systems fighting over resource accounting, which leads to instability under heavy GPU load.
- **`cpuManagerPolicy: static`**: AI workloads (like PyTorch Distributed Data Parallel) require predictable CPU performance to avoid CPU-to-GPU data starvation. The `static` policy allows pods with guaranteed QoS (CPU limits == requests) to receive exclusive, pinned CPU cores.
- **`topologyManagerPolicy: single-numa-node`**: Modern GPU servers have complex NUMA (Non-Uniform Memory Access) topologies. A CPU core on Socket 0 accessing memory on Socket 1, or transferring data to a GPU on a PCIe switch attached to Socket 1, incurs high latency. `single-numa-node` forces Kubernetes to align CPU, Memory, and Device (GPU/NIC) allocations to the same NUMA node.
- **Reserved Resources**: AI nodes run heavy background daemons (DCGM, NVIDIA Device Plugin, storage agents). Reserving sufficient CPU and memory prevents `OutOfMemory` (OOM) conditions on the node itself, which would cause the kernel to randomly kill critical processes.

---

## 3. Node Pressure and Eviction

When a node runs low on resources, the Kubelet acts defensively to preserve node stability. This is governed by eviction thresholds.

### 3.1 Eviction Thresholds

- **Soft Eviction:** Triggers after a grace period.
- **Hard Eviction:** Triggers immediately. The Kubelet will violently terminate Pods.

Common signals:
- `memory.available`
- `nodefs.available` (root filesystem)
- `imagefs.available` (where container images and writable layers are stored)
- `pid.available`

### 3.2 Quality of Service (QoS) Classes

When eviction occurs, the Kubelet doesn't kill Pods at random. It relies on the Pod's QoS class and its OOM score adjustment (`oom_score_adj`).

```mermaid
flowchart TD
    E[Eviction Triggered] --> Q{Check QoS Class}
    Q -->|No Limits/Requests| BE[BestEffort<br>oom_score_adj: 1000]
    Q -->|Partial Requests| B[Burstable<br>oom_score_adj: varies]
    Q -->|Limits == Requests| G[Guaranteed<br>oom_score_adj: -997]
    
    BE --> K1[First to be Killed]
    B --> K2[Killed if Using Excess]
    G --> K3[Last to be Evicted]
    
    style BE fill:#f9f,stroke:#333
    style B fill:#bbf,stroke:#333
    style G fill:#bfb,stroke:#333
```

1. **Guaranteed (Highest Priority, `oom_score_adj: -997`):**
   - Requires: Every container in the Pod must have memory/CPU `limits` explicitly matching their `requests`.
   - Behavior: Last to be evicted. Safe from CPU throttling if using `static` cpu manager.

2. **Burstable (Medium Priority, `oom_score_adj: varies`):**
   - Requires: At least one container has a memory/CPU `request` specified, but does not meet Guaranteed criteria.
   - Behavior: Evicted based on how much resource they are using relative to their request.

3. **BestEffort (Lowest Priority, `oom_score_adj: 1000`):**
   - Requires: No memory or CPU requests/limits specified on any container.
   - Behavior: First to be killed during resource pressure.

:::warning Production AI Note
Large Language Model (LLM) training pods must ALWAYS be `Guaranteed`. You do not want a 1000-GPU training job to fail because a `BestEffort` logging sidecar spiked memory and caused a localized eviction.
:::

---

## 4. Container Runtime Interface (CRI) & Pod Sandbox

The Kubelet does not know how to run a container. It talks to a Container Runtime via the Container Runtime Interface (CRI) over a UNIX socket (`/run/containerd/containerd.sock`).

### 4.1 What is a Pod Sandbox?

A Pod is a logical concept. At the Linux level, a Pod is implemented as a "Pod Sandbox" (or "pause container").
The Sandbox establishes the shared namespaces (Network, IPC, UTS) that all containers within the Pod will use. 
When the Kubelet wants to run a Pod:
1. It calls `RunPodSandbox` via CRI.
2. The runtime creates the namespaces and starts a lightweight `pause` container to hold them open.
3. CNI configures the network for this Sandbox namespace.
4. Kubelet calls `CreateContainer` and `StartContainer` for the actual application containers, attaching them to the Sandbox's namespaces.

### 4.2 Containerd Architecture in NVIDIA AI Environments

Containerd is the industry standard runtime. For AI, it must be configured to use the `nvidia-container-runtime` (or the newer CDI - Container Device Interface).

```mermaid
graph TD
    K[Kubelet] -->|CRI gRPC| C[Containerd]
    C -->|Creates Sandbox| S[Sandbox / Pause Container]
    C -->|Container API| R[runc / nvidia-container-runtime]
    R -->|Pre-start hooks| L[libnvidia-container]
    L -->|Injects| G[NVIDIA GPU Devices /dev/nvidia*]
    L -->|Injects| M[NVIDIA Driver Mounts]
    R -->|Spawns| P[Application Container]
    P --> S
```

### 4.3 Containerd Configuration (`config.toml`)

```toml
# /etc/containerd/config.toml
version = 2
[plugins]
  [plugins."io.containerd.grpc.v1.cri"]
    sandbox_image = "registry.k8s.io/pause:3.9"
    [plugins."io.containerd.grpc.v1.cri".containerd]
      default_runtime_name = "nvidia"
      [plugins."io.containerd.grpc.v1.cri".containerd.runtimes]
        [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
          runtime_type = "io.containerd.runc.v2"
          [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
            SystemdCgroup = true
        [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.nvidia]
          privileged_without_host_devices = false
          runtime_engine = ""
          runtime_root = ""
          runtime_type = "io.containerd.runc.v2"
          [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.nvidia.options]
            BinaryName = "/usr/bin/nvidia-container-runtime"
            SystemdCgroup = true
```

*Note:* Enabling `SystemdCgroup = true` here matches the `cgroupDriver: systemd` in the Kubelet config. This is the containerd 1.x `version = 2` layout; containerd 2.x uses `version = 3` and different plugin names (for example `io.containerd.cri.v1.runtime`). In practice, let the toolkit write the NVIDIA runtime entry for you with `nvidia-ctk runtime configure --runtime=containerd` rather than hand-editing.

### 4.4 Debugging with `crictl`

`crictl` is a CLI tool for interacting directly with the CRI. It is essential when the Kubelet is unhealthy or the API server is unreachable.

```bash
# List pod sandboxes
crictl pods

# List containers (shows which sandbox they belong to)
crictl ps -a

# Inspect a container (shows mounts, args, state)
crictl inspect <container-id>

# View logs directly from the runtime (bypassing kubelet)
crictl logs -f <container-id>

# Exec into a container at the runtime level
crictl exec -it <container-id> /bin/bash

# Force stop a stuck sandbox
crictl stopp <sandbox-id>
crictl rmp <sandbox-id>
```

---

## 5. Storage & Container Storage Interface (CSI)

Stateless microservices revolutionized web architecture. However, AI workloads are inherently stateful. You need to load massive datasets (petabytes of images, text) into the GPUs, save massive checkpoints periodically, and write out model weights.

### 5.1 Storage Abstractions

- **PersistentVolume (PV):** A piece of storage in the cluster, provisioned by an admin or dynamically using a StorageClass. It captures the details of the implementation (e.g., NFS, iSCSI, cloud-provider-specific storage system).
- **PersistentVolumeClaim (PVC):** A request for storage by a user. Pods consume PVCs as volumes.
- **StorageClass (SC):** Allows administrators to describe the "classes" of storage they offer. It maps to a specific CSI provisioner and defines parameters (e.g., IOPS, replication, filesystem type).

### 5.2 The CSI Architecture

Before CSI, storage plugins were "in-tree" (compiled directly into the Kubernetes source code). This was unscalable. CSI is a standard for exposing arbitrary block and file storage systems to containerized workloads.

A typical CSI driver consists of two main components:
1. **CSI Controller:** Runs as a StatefulSet or Deployment (usually 1 or 2 replicas per cluster). It talks to the storage backend's API to create/delete volumes (LUNs, shares) and attach/detach them to specific Nodes.
2. **CSI Node:** Runs as a DaemonSet on every node. It handles formatting the block device, mounting the network share, and bind-mounting it into the Pod's directory structure.

### 5.3 CSI Volume Attach Pipeline Diagram

Note: the attach step applies only to drivers that require attachment (`attachRequired: true` in the CSIDriver object). Many network filesystem drivers skip it and go straight to node-side mount.

```mermaid
sequenceDiagram
    participant Pod
    participant API as Kube-APIServer
    participant AD as AttachDetach Controller (KCM)
    participant CSIC as CSI Controller
    participant Kubelet
    participant CSIN as CSI Node (DaemonSet)
    participant Storage as External Storage Array

    Pod->>API: Create Pod with PVC
    API->>AD: Watch Pod scheduling
    AD->>CSIC: Create VolumeAttachment; external-attacher calls ControllerPublishVolume
    CSIC->>Storage: API Call: Map LUN/Share to Node X
    Storage-->>CSIC: Attached to Node
    CSIC-->>AD: Attachment Complete
    AD->>API: Update VolumeAttachment Status
    API->>Kubelet: Watch VolumeAttachment
    Kubelet->>CSIN: NodeStageVolume (Format/Mount Device globally)
    CSIN->>Storage: Discover & Mount Device
    CSIN-->>Kubelet: Staged
    Kubelet->>CSIN: NodePublishVolume (Bind mount to Pod dir)
    CSIN-->>Kubelet: Published
    Kubelet->>Pod: Start Containers with Volume
```

### 5.4 High-Performance AI Storage: GPUDirect Storage (GDS)

In standard I/O, data moves from the NVMe/Network Storage -> System RAM (CPU) -> GPU VRAM. This "bounce buffer" in System RAM consumes CPU cycles and limits bandwidth.

NVIDIA Magnum IO GPUDirect Storage (GDS) establishes a direct DMA (Direct Memory Access) path between the NIC/Storage and the GPU VRAM, bypassing the CPU bounce buffer. 

To use GDS in Kubernetes via CSI (e.g., with WEKA or VAST Data):
1. The Storage must support GDS (usually via NVMe-oF or NFS over RDMA).
2. The CSI driver must be configured as the storage vendor documents for GDS (mount options and client settings are vendor-specific).
3. The node must have the NVIDIA GDS stack (`nvidia-fs`) and, for RDMA-based filesystems, the Mellanox OFED drivers installed, and the Pod must request `nvidia.com/gpu` resources.
4. The Pod must mount the GDS-capable CSI volume.

#### Example StorageClass shape for High-Performance AI (illustrative)

The `provisioner` and `parameters` keys below are placeholders. Each CSI driver defines its own parameter names; take them from the vendor's CSI documentation.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: weka-ai-fast
provisioner: csi.weka.io
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  # vendor-specific parameters go here (see the CSI driver documentation)
mountOptions:
- ro # Read-only for datasets
```

*Note on `volumeBindingMode: WaitForFirstConsumer`:* This is critical for Local Path provisioners and highly recommended for network storage. It delays the provisioning of the PV until a Pod referencing the PVC is scheduled. This ensures the volume is created in the same availability zone or topology as the node where the Pod will run.

---

## 6. StatefulSets: Orchestrating the Stateful

Deployments manage stateless replicas. Pods are fungible; if one dies, a new one spins up with a new name and a new IP.
StatefulSets manage stateful applications. They provide guarantees about the ordering and uniqueness of these Pods.

```mermaid
flowchart LR
    subgraph StatefulSet [StatefulSet: kafka]
        direction TB
        P0[Pod: kafka-0] --> PV0[(PV-0)]
        P1[Pod: kafka-1] --> PV1[(PV-1)]
        P2[Pod: kafka-2] --> PV2[(PV-2)]
    end
    
    subgraph Deployment [Deployment: web]
        direction TB
        W1[Pod: web-abcd] -.-> PVX[(Shared PV)]
        W2[Pod: web-efgh] -.-> PVX
    end
```

### 6.1 StatefulSet Core Guarantees

1. **Stable, Unique Network Identifier:** Pods get names like `kafka-0`, `kafka-1`. They keep these names across rescheduling.
2. **Stable, Persistent Storage:** When `kafka-0` is rescheduled, it must attach to the exact same PV it was using before.
3. **Ordered, Graceful Deployment and Scaling:** `kafka-1` will not start until `kafka-0` is Running and Ready.
4. **Ordered, Automated Rolling Updates:** Updates happen in reverse ordinal order (e.g., `kafka-2` -> `kafka-1` -> `kafka-0`).

### 6.2 The Role of Headless Services

StatefulSets require a Headless Service (a Service with `clusterIP: None`) to control the network domain. This Service does not load balance; instead, it returns the individual IPs of the Pods backing it via DNS A records.

This allows applications to form clusters (e.g., a database cluster where node `db-0` needs to replicate data directly to `db-1` via `db-1.db-svc.default.svc.cluster.local`).

### 6.3 Deep Dive: StatefulSet Manifest with PVC Templates

Illustrative manifest: Milvus is normally deployed with its Helm chart or operator, and `nvme-local-path` is a hypothetical StorageClass name.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: milvus-datanode-headless
  labels:
    app: milvus
spec:
  ports:
  - port: 9091
    name: metrics
  clusterIP: None # Headless
  selector:
    app: milvus-datanode
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: milvus-datanode
spec:
  serviceName: "milvus-datanode-headless"
  replicas: 3
  selector:
    matchLabels:
      app: milvus-datanode
  template:
    metadata:
      labels:
        app: milvus-datanode
    spec:
      containers:
      - name: datanode
        image: milvusdb/milvus:v2.3.0
        ports:
        - containerPort: 9091
          name: metrics
        volumeMounts:
        - name: data-volume
          mountPath: /var/lib/milvus/data
  # The Magic: PVC Template
  volumeClaimTemplates:
  - metadata:
      name: data-volume
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: "nvme-local-path"
      resources:
        requests:
          storage: 500Gi
```

#### How `volumeClaimTemplates` works:
When the StatefulSet creates `milvus-datanode-0`, it also dynamically creates a PVC named `data-volume-milvus-datanode-0`. 
If `milvus-datanode-0` is deleted, the Pod dies, but the PVC and PV *remain*. When `milvus-datanode-0` is recreated, it reattaches to the exact same PVC, preserving its state.

---

## 7. Production Considerations for AI Infrastructure

### 7.1 Local Storage vs Network Storage Trade-offs

**Local Storage (e.g., Local Path Provisioner on NVMe SSDs):**
- **Pros:** Maximum IOPS, lowest latency. Perfect for scratch space during epoch training or extreme high-throughput, short-lived caching.
- **Cons:** Ephemeral by nature of the node. If the node dies, the data is gone. Pods are tied to the node (Data Gravity). A StatefulSet pod bound to a local PV *cannot* move to another node. If the node goes down for maintenance, the pod is stuck in `Pending`.

**Network Storage (e.g., NFS, Weka, VAST, Ceph via CSI):**
- **Pros:** Pods can float between nodes. Data survives node failures. Excellent for shared datasets (ReadMany).
- **Cons:** Network bottlenecks. Potential for "noisy neighbor" problems where one job saturates the storage NIC or array, degrading performance for the entire cluster.

### 7.2 Access Modes

- **ReadWriteOnce (RWO):** Volume can be mounted as read-write by a single node. Standard for databases.
- **ReadOnlyMany (ROX):** Volume can be mounted read-only by many nodes. Essential for shared AI training datasets (e.g., ImageNet).
- **ReadWriteMany (RWX):** Volume can be mounted read-write by many nodes. Complex to manage (requires locking at the filesystem level, e.g., NFS). Used for shared checkpoint directories.

---

## 8. Senior Solutions Architect Troubleshooting Scenarios

### Scenario 1: The "NodeNotReady" Loop under Heavy Load

:::tip Investigation & Fix
**Symptom:** During massive LLM training runs, random nodes flap between `Ready` and `NotReady`. Pods are evicted, training halts.
**Investigation:**
1. Check Kubelet logs on the affected node: `journalctl -u kubelet -f`.
2. You see `PLEG is not healthy: pleg was last seen active Xm ago; threshold is 3m0s`.
3. Check `dmesg -T` or `journalctl -k`. You see kernel CPU starvation messages or `containerd` timing out.
**Root Cause & Fix:**
The AI workloads are completely saturating the CPU, leaving no cycles for the Kubelet and Containerd to process the PLEG sync loop or respond to API health checks.
Fix: 
1. Ensure `kubeReserved` and `systemReserved` are properly configured in Kubelet config.
2. Ensure workloads are using `Guaranteed` QoS and `static` CPU manager policy, so they only use their isolated cores and do not interfere with system daemons on core 0/1.
:::

### Scenario 2: Volume Stuck in "Multi-Attach Error"

:::warning Investigation & Fix
**Symptom:** A stateful pod is deleted and rescheduled to a new node, but stays in `ContainerCreating`.
**Events:** `Warning FailedAttachVolume Multi-Attach error for volume "pvc-xyz" Volume is already exclusively attached to one node and can't be attached to another`
**Investigation & Root Cause:**
The CSI controller thinks the volume is still attached to the old node. This happens if the old node crashes unexpectedly (e.g., network partition, hard reboot). The Kubelet on the dead node cannot run `NodeUnpublishVolume`, and the AttachDetach controller is waiting for confirmation.
**Fix:**
If the old node is truly dead, you must force delete the `VolumeAttachment` object associated with the old node, or delete the old Node object from the cluster. On Kubernetes 1.28 and later, the preferred approach is to apply the `node.kubernetes.io/out-of-service` taint (`NoExecute`) to the confirmed-dead node, which lets the control plane force-detach its volumes. Only do this after verifying the node is really down, since forcing a detach while the node still writes can corrupt data.
:::

### Scenario 3: Orphaned Pod Sandboxes

**Symptom:** A node is reporting high disk usage or running out of IP addresses (CNI exhaustion). You delete pods, but resources aren't freed.
**Investigation:**
Run `crictl pods` and `crictl ps -a`. You see many sandboxes in a `NotReady` state with no running containers. 
**Root Cause:**
A race condition or failure between Kubelet, CNI, and CRI during Pod termination left the sandbox hanging. The Kubelet stopped tracking it, but containerd still has the network namespace and mounts active.
**Fix:**
Manually intervene using `crictl`:
```bash
for pod in $(crictl pods -q --state NotReady); do
  crictl stopp $pod
  crictl rmp $pod
done
```
If this is frequent, investigate CNI plugin timeouts or upgrade containerd/kubelet to patch known race conditions.

### Scenario 4: GPUDirect Storage Performance Degradation

:::info Investigation & Fix
**Symptom:** A training job using GDS (via Weka CSI) is running 5x slower than expected. 
**Investigation:**
1. Verify the volume is mounted: `kubectl exec <pod> -- df -h`.
2. Verify MOFED and GDS drivers are active inside the container.
3. Use the NVIDIA `gdscheck` utility inside the pod.
**Root Cause:**
`gdscheck` and the topology tools (`nvidia-smi topo -m`) show the GPU and the storage NIC on different NUMA nodes or PCIe root complexes. Because the Kubelet `topologyManagerPolicy` was `none`, nothing aligned the CPUs and devices, so the traffic crossed the inter-socket link and lost much of the benefit of GDS.
**Fix:**
Set `topologyManagerPolicy: single-numa-node` (with the static CPU Manager) to align CPUs and devices that provide topology hints. Note that Topology Manager only aligns devices exposed through device plugins or DRA, so a storage NIC must be exposed that way (for example via an SR-IOV or RDMA device plugin) to be covered.
:::

---

## 9. Interview Corner: Senior Platform Engineer

**Q: Explain the exact sequence of events when a Pod is deleted, focusing on Kubelet, CRI, and CSI.**
**A:** 
1. API Server marks Pod with a `deletionTimestamp`.
2. Kubelet sees this in the Sync Loop and moves Pod to `Terminating`.
3. Kubelet issues `StopContainer` via CRI to all app containers. Containerd sends SIGTERM.
4. After the grace period (default 30s), Kubelet sends SIGKILL via CRI.
5. Once containers are dead, Kubelet calls `StopPodSandbox`; the runtime invokes CNI `DEL` to tear down the pod network.
6. Kubelet later garbage-collects the sandbox with `RemovePodSandbox`.
7. Kubelet calls CSI `NodeUnpublishVolume` to unmount the volume from the Pod directory.
8. Kubelet updates API Server that the Pod is fully terminated.
9. AttachDetach Controller sees Pod is gone and calls CSI `ControllerUnpublishVolume` to detach the LUN from the node.

**Q: Why would you use a Headless Service for a StatefulSet instead of a regular Service?**
**A:** A regular service provides a single ClusterIP that load-balances across all healthy pods. Stateful applications (like Elasticsearch, Cassandra, or distributed AI checkpointing systems) need to communicate directly with *specific* peers to form a cluster, replicate data, or vote on leaders. A Headless Service bypasses the kube-proxy load balancer and returns the individual IPs of the pods (e.g., `pod-0.headless-svc`, `pod-1.headless-svc`), allowing direct, peer-to-peer addressing required by stateful distributed systems.

**Q: How do you prevent an aggressive disk I/O workload from starving the Kubelet and causing a node failure?**
**A:** 
1. Isolate the workload using proper QoS classes.
2. Ensure the Kubelet and system daemons are on a dedicated cgroup slice with reserved resources (`systemReserved`, `kubeReserved`).
3. For extreme cases, apply cgroup I/O limits (`io.max` on cgroup v2; support depends on the runtime and Kubernetes version) to cap the IOPS/bandwidth of the misbehaving container, ensuring the node's root filesystem (where kubelet operates) remains responsive.

---

## 10. Summary

The node layer is where abstract YAML meets physical hardware. 
Mastering the Kubelet's sync loop, configuring containerd for optimal GPU passthrough, and understanding the CSI volume attachment lifecycle transforms you from a cluster operator into a true AI Platform Architect. 
When things go wrong at scale, the answers are rarely in the Kubernetes API; they are hidden deep within `crictl`, systemd journal, kernel `dmesg`, and CSI driver logs.

## Appendix A: Extensive Configuration Reference

### A.1 containerd config.toml

Do not copy a hand-written "full" config. Generate the current default for your containerd version and edit only what you need:

```bash
containerd config default > /etc/containerd/config.toml
# Add the NVIDIA runtime entry and set it as default
nvidia-ctk runtime configure --runtime=containerd --set-as-default
systemctl restart containerd
```

The minimal GPU-relevant settings were shown in section 4.3 (systemd cgroup driver, `nvidia` runtime handler). Everything else should stay at your version's defaults unless you have a specific reason.

### A.2 Example Kubelet Configuration

An illustrative assembly of commonly set fields; validate it against the KubeletConfiguration reference for your Kubernetes version before use (for example `kubelet --config <file>` fails on unknown or invalid fields and feature gates).

```yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
enableServer: true
staticPodPath: /etc/kubernetes/manifests
syncFrequency: 1m0s
fileCheckFrequency: 20s
httpCheckFrequency: 20s
address: 0.0.0.0
port: 10250
tlsCertFile: /var/lib/kubelet/pki/kubelet.crt
tlsPrivateKeyFile: /var/lib/kubelet/pki/kubelet.key
authentication:
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt
  webhook:
    enabled: true
    cacheTTL: 2m0s
  anonymous:
    enabled: false
authorization:
  mode: Webhook
  webhook:
    cacheAuthorizedTTL: 5m0s
    cacheUnauthorizedTTL: 30s
registryPullQPS: 5
registryBurst: 10
eventRecordQPS: 5
eventBurst: 10
enableDebuggingHandlers: true
enableContentionProfiling: false
healthzPort: 10248
healthzBindAddress: 127.0.0.1
oomScoreAdj: -999
clusterDomain: cluster.local
clusterDNS:
  - 10.96.0.10
streamingConnectionIdleTimeout: 4h0m0s
nodeStatusUpdateFrequency: 10s
nodeStatusReportFrequency: 5m0s
nodeLeaseDurationSeconds: 40
imageMinimumGCAge: 2m0s
imageGCHighThresholdPercent: 85
imageGCLowThresholdPercent: 80
volumeStatsAggPeriod: 1m0s
cgroupsPerQOS: true
cgroupDriver: systemd
cpuManagerPolicy: static
cpuManagerReconcilePeriod: 10s
topologyManagerPolicy: single-numa-node
topologyManagerScope: pod
runtimeRequestTimeout: 2m0s
hairpinMode: promiscuous-bridge
maxPods: 110
podPidsLimit: 4096
resolvConf: /run/systemd/resolve/resolv.conf
cpuCFSQuota: true
cpuCFSQuotaPeriod: 100ms
nodeStatusMaxImages: 50
maxOpenFiles: 1000000
contentType: application/vnd.kubernetes.protobuf
kubeAPIQPS: 50
kubeAPIBurst: 100
serializeImagePulls: false
evictionHard:
  memory.available: 100Mi
  nodefs.available: 10%
  nodefs.inodesFree: 5%
  imagefs.available: 15%
evictionSoft:
  memory.available: 250Mi
  nodefs.available: 15%
  nodefs.inodesFree: 10%
  imagefs.available: 20%
evictionSoftGracePeriod:
  memory.available: 1m30s
  nodefs.available: 1m30s
  nodefs.inodesFree: 1m30s
  imagefs.available: 1m30s
evictionPressureTransitionPeriod: 5m0s
evictionMaxPodGracePeriod: 0
evictionMinimumReclaim:
  memory.available: 0Mi
  nodefs.available: 500Mi
  imagefs.available: 2Gi
enforceNodeAllocatable:
  - pods
  - system-reserved
  - kube-reserved
systemReserved:
  cpu: 1000m
  memory: 2Gi
  ephemeral-storage: 1Gi
kubeReserved:
  cpu: 1000m
  memory: 2Gi
  ephemeral-storage: 1Gi
makeIPTablesUtilChains: true
iptablesMasqueradeBit: 14
iptablesDropBit: 15
featureGates:
  RotateKubeletServerCertificate: true
serverTLSBootstrap: true
```

## Appendix B: Detailed Pod Lifecycle States

### Phase: Pending
The API Server has accepted the Pod, but one or more of the containers has not been set up and made ready to run. This includes time waiting for the Pod to be scheduled as well as the time spent downloading container images over the network.
- **Troubleshooting:** 
  - `kubectl describe pod <pod_name>`
  - Look for "FailedScheduling" (insufficient CPU/Memory/GPUs, taints/tolerations mismatch, node selectors).
  - Look for "FailedMount" (CSI issues, PV/PVC not bound, secret/configmap missing).

### Phase: Running
The Pod has been bound to a node, and all of the containers have been created. At least one container is still running, or is in the process of starting or restarting.
- **Troubleshooting:**
  - If it's restarting, check `kubectl logs <pod_name> --previous` for application crashes.
  - Check `OOMKilled` status in `kubectl describe`. If `OOMKilled`, the container exceeded its memory limit or the node ran out of memory and killed the process with the highest OOM score.

### Phase: Succeeded
All containers in the Pod have terminated in success, and will not be restarted. (Exit code 0). Common for Kubernetes Jobs.

### Phase: Failed
All containers in the Pod have terminated, and at least one container has terminated in failure. That is, the container either exited with non-zero status or was terminated by the system.
- **Troubleshooting:**
  - Application logic errors (exit code 1).
  - Preemption or Eviction (system needed resources).

### Phase: Unknown
The state of the Pod could not be obtained. This phase typically occurs due to an error in communicating with the node where the Pod should be running.
- **Troubleshooting:**
  - Network partition between the Control Plane and the Node.
  - Kubelet is dead or unresponsive (high CPU load, PLEG timeout). Check node health.

## Appendix C: Mastering `crictl` for Advanced Debugging

While `kubectl` is sufficient for 95% of operations, AI infrastructure operators must know `crictl` when the cluster control plane is degraded or when deep container runtime inspection is required.

### C.1 Pulling and Inspecting Images Locally

If a massive 20GB AI container image is failing to pull via Kubernetes due to timeouts, you can pull it directly on the node using `crictl` to bypass Kubelet's image pulling timeout logic.

```bash
# Pull an image directly
crictl pull nvcr.io/nvidia/pytorch:23.10-py3

# List local images and their sizes
crictl images

# Inspect the image layers and configuration
crictl inspecti nvcr.io/nvidia/pytorch:23.10-py3
```

### C.2 Debugging Stuck Pod Deletions (Zombie Pods)

Sometimes a Pod is stuck in `Terminating` in Kubernetes, but the node actually removed it, or vice versa (Kubelet lost track of it, but it's still running).

1. Find the sandbox ID:
```bash
crictl pods --name <pod_name>
```

2. Check the containers running inside that sandbox:
```bash
crictl ps --pod <sandbox_id>
```

3. Forcefully stop and remove the containers:
```bash
crictl stop <container_id>
crictl rm <container_id>
```

4. Forcefully stop and remove the sandbox:
```bash
crictl stopp <sandbox_id>
crictl rmp <sandbox_id>
```

## Appendix D: Further Reading and Official Specifications

- [Kubernetes Container Runtime Interface (CRI) Specification](https://github.com/kubernetes/cri-api)
- [Container Storage Interface (CSI) Specification](https://github.com/container-storage-interface/spec)
- [NVIDIA Container Toolkit Architecture](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/arch-overview.html)
- [Kubernetes Topology Manager Design Proposal](https://github.com/kubernetes/enhancements/tree/master/keps/sig-node/693-topology-manager)
- [Systemd Cgroup Driver in Kubernetes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/#systemd-cgroup-driver)

## Appendix E: Deep Dive - Building a Minimal CSI Driver for NVMe
To truly understand Storage on Nodes, let's look at the gRPC interfaces a CSI driver must implement.

A CSI Driver exposes three distinct gRPC services:
1. `IdentityService`: Who are you? What capabilities do you have?
2. `ControllerService`: (Runs as a Deployment/StatefulSet, usually with CSI sidecars) Provisioning, attaching, snapshotting.
3. `NodeService`: (Runs on every Node) Mounting, formatting, device discovery.

### E.1 IdentityService

```protobuf
service Identity {
  rpc GetPluginInfo(GetPluginInfoRequest) returns (GetPluginInfoResponse) {}
  rpc GetPluginCapabilities(GetPluginCapabilitiesRequest) returns (GetPluginCapabilitiesResponse) {}
  rpc Probe (ProbeRequest) returns (ProbeResponse) {}
}
```
The driver responds with its name (a DNS-style identifier such as `example.com/nvme`; this one is hypothetical) and version. It also reports if it has a ControllerService or just a NodeService.

### E.2 ControllerService

```protobuf
service Controller {
  rpc CreateVolume (CreateVolumeRequest) returns (CreateVolumeResponse) {}
  rpc DeleteVolume (DeleteVolumeRequest) returns (DeleteVolumeResponse) {}
  rpc ControllerPublishVolume (ControllerPublishVolumeRequest) returns (ControllerPublishVolumeResponse) {}
  rpc ControllerUnpublishVolume (ControllerUnpublishVolumeRequest) returns (ControllerUnpublishVolumeResponse) {}
  // ... Snapshots, Expansions, etc.
}
```
`CreateVolume`: The driver receives a request for X bytes. It calls the storage array API to carve out a LUN.
`ControllerPublishVolume`: The Attach phase. The driver tells the storage array "Allow Node Y's IQN/WWN to access LUN X".

### E.3 NodeService

```protobuf
service Node {
  rpc NodeStageVolume (NodeStageVolumeRequest) returns (NodeStageVolumeResponse) {}
  rpc NodeUnstageVolume (NodeUnstageVolumeRequest) returns (NodeUnstageVolumeResponse) {}
  rpc NodePublishVolume (NodePublishVolumeRequest) returns (NodePublishVolumeResponse) {}
  rpc NodeUnpublishVolume (NodeUnpublishVolumeRequest) returns (NodeUnpublishVolumeResponse) {}
  rpc NodeGetCapabilities (NodeGetCapabilitiesRequest) returns (NodeGetCapabilitiesResponse) {}
  rpc NodeGetInfo (NodeGetInfoRequest) returns (NodeGetInfoResponse) {}
}
```
`NodeStageVolume`:
1. Discover the block device (e.g., `/dev/nvme0n1`).
2. Format it with the requested filesystem (e.g., `mkfs.ext4 /dev/nvme0n1`).
3. Mount it to a global staging directory on the node (e.g., `/var/lib/kubelet/plugins/kubernetes.io/csi/pv/pv-xyz/globalmount`).

`NodePublishVolume`:
1. Bind-mount the global staging directory into the Pod's specific directory.
   `mount --bind /var/lib/kubelet/plugins/.../globalmount /var/lib/kubelet/pods/<pod-uuid>/volumes/kubernetes.io~csi/pvc-xyz/mount`

This two-step process allows multiple Pods on the SAME node to share the SAME volume (ROX/RWX) without formatting it multiple times.

## Appendix F: Production Logs Analysis

When troubleshooting Node issues in an AI factory, analyzing logs is paramount. Below are illustrative log snippets (not captured from a real system) and how to interpret them.

### F.1 Kubelet PLEG Timeout Log

Illustrative log lines (not captured; format and wording vary by Kubernetes version):

```text
E1024 14:32:11.123456   12345 kubelet.go:1934] "PLEG is not healthy"
W1024 14:32:11.123567   12345 sync_loop.go:215] "Sync loop failed" error="pleg was last seen active 3m5s ago; threshold is 3m0s"
```
**Interpretation:** The Pod Lifecycle Event Generator is starved of CPU or I/O. The Kubelet cannot get the state of containers from Containerd fast enough. 
**Action:** Check node CPU utilization. Check `iostat` for disk latency. Ensure system reserved cgroups are working.

### F.2 Containerd GPU Injection Error

Illustrative (not captured):

```text
ERRO[2023-10-24T15:45:22.987654Z] RunPodSandbox for pod "ai-training-job-0" failed error="failed to create containerd task: failed to create shim task: OCI runtime create failed: container_linux.go:380: starting container process caused: process_linux.go:545: container init caused: Running hook #0:: error running hook: exit status 1, stdout: , stderr: nvidia-container-cli: initialization error: nvml error: driver not loaded: unknown"
```
**Interpretation:** The `nvidia-container-runtime` pre-start hook failed because the NVIDIA kernel driver is not loaded on the host, or NVML cannot communicate with it.
**Action:** Run `lsmod | grep nvidia` on the host. Check `dmesg` for NVRM errors. Reinstall/reload the NVIDIA driver.

### F.3 CSI Mount Timeout

Illustrative (not captured):

```text
Warning  FailedMount  4m32s (x15 over 32m)  kubelet  MountVolume.SetUp failed for volume "pvc-abc-123" : rpc error: code = DeadlineExceeded desc = context deadline exceeded
```
**Interpretation:** The Kubelet asked the CSI Node plugin to `NodePublishVolume`, but the gRPC call exceeded its deadline. 
**Action:** Check the CSI Node daemonset pod logs on that specific node. It might be hanging on an NFS mount command, or the storage network might be partitioned.

### F.4 OOMKilled in Pod Status

Kubernetes reports an OOM kill in the container status rather than as a dedicated kubelet log line:

```bash
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[*].lastState.terminated}'
# Look for "reason":"OOMKilled" and "exitCode":137 (illustrative; exact fields vary by version)
```
**Interpretation:** The kernel OOM killer terminated the container process, either because the container hit its cgroup memory limit or because the node ran out of memory. Compare against section 11.4 of Volume 1, Chapter 4 to distinguish the two via `journalctl -k`.
**Action:** Check the pod's memory limits and the host's `dmesg` for the OOM killer invocation to see exactly which process consumed the memory.
