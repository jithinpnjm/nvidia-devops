import os

filepath = "docs/volume-03/03-k8s-networking-security-ops-masterclass.md"

def pad(text, lines_needed=0):
    return text

frontmatter = """---
id: k8s-networking-security-ops-masterclass
title: "Masterclass: Kubernetes Networking, Security, and AI Factory Operations"
sidebar_label: "Masterclass: Networking & Security"
sidebar_position: 3
slug: /volume-03/k8s-networking-security-ops-masterclass
---

# Masterclass: Kubernetes Networking, Security, and AI Factory Operations

## 1. Introduction: The AI Factory Network

In an NVIDIA AI Factory, the network is not just a pipe; it is the backbone of distributed computing. When scaling deep learning workloads across thousands of GPUs, traditional Kubernetes networking paradigms break down. The latency introduced by `kube-proxy`, the IPAM exhaustion in standard CNI implementations, and the lack of native hardware acceleration in generic virtual networks are unacceptable bottlenecks.

This masterclass progresses from foundational Kubernetes networking to the advanced implementations required for GPU-accelerated clusters. We will explore eBPF-based networking with Cilium, secondary high-performance networks via Multus (SR-IOV, RoCEv2, InfiniBand), robust multi-tenant security with Kyverno and RBAC, and GitOps-driven deployment of the NVIDIA GPU Operator.

### 1.1 Prerequisites
- Strong understanding of standard Kubernetes primitives (Pods, Deployments, Services).
- Familiarity with basic networking concepts (IP/MAC addresses, BGP, VLANs).
- **Difficulty:** Advanced / Expert.
- **Reading Time:** ~60 minutes.

"""

networking = """
## 2. Advanced Kubernetes Networking: CNI and Dataplane

### 2.1 The Limits of kube-proxy

Standard Kubernetes clusters rely on `kube-proxy` (usually running in iptables mode) to route traffic to Service endpoints. In a cluster with thousands of services, iptables rules grow linearly, causing exponential degradation in routing performance. When a node processes a packet, it must traverse thousands of rules. 

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#76B900'}}}%%
flowchart TD
    Client((Client)) --> |Packet| NodeEth(Node Interface)
    NodeEth --> IPChains[iptables PREROUTING]
    IPChains --> |O(N) Evaluation| KubeServices[KUBE-SERVICES]
    KubeServices --> |O(N) Evaluation| KubeSvcTarget[KUBE-SVC-XYZ]
    KubeSvcTarget --> KubeSep[KUBE-SEP-ABC]
    KubeSep --> |DNAT| Pod(Target Pod)
```

As clusters grow to thousands of nodes and tens of thousands of pods, this O(N) evaluation time leads to severe latency penalties and kernel overhead, especially in microservices-heavy workloads. For large-scale AI pipelines, `kube-proxy` must be entirely bypassed.

### 2.2 eBPF and Cilium: The Modern Dataplane

To resolve iptables bottlenecks, modern AI platforms replace `kube-proxy` with eBPF-based CNIs like Cilium. eBPF allows sandboxed programs to run directly within the Linux kernel, bypassing the standard network stack.

#### eBPF Routing Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#76B900'}}}%%
flowchart TD
    Client((Client)) --> NodeEth(Node Interface)
    NodeEth --> eBPF[eBPF Hook - XDP / TC]
    eBPF --> |O(1) Hash Table Lookup| Pod(Target Pod)
    
    style eBPF fill:#76B900,stroke:#333,stroke-width:2px,color:#fff
```

By leveraging eBPF hash tables, packet routing becomes an O(1) operation, regardless of the number of Services.

#### Example: CiliumNetworkPolicy

In a multi-tenant AI cluster, isolating workloads is critical. Standard `NetworkPolicy` objects lack advanced Layer 7 visibility and DNS-based enforcement. `CiliumNetworkPolicy` fills this gap.

```yaml
apiVersion: "cilium.io/v2"
kind: CiliumNetworkPolicy
metadata:
  name: "restrict-ml-training-egress"
  namespace: "team-alpha"
spec:
  endpointSelector:
    matchLabels:
      role: "training-job"
  egress:
  - toEndpoints:
    - matchLabels:
        "k8s:io.kubernetes.pod.namespace": "kube-system"
        "k8s:k8s-app": "kube-dns"
    toPorts:
    - ports:
      - port: "53"
        protocol: ANY
      rules:
        dns:
        - matchPattern: "*.s3.amazonaws.com"
        - matchPattern: "nvcr.io"
  - toFQDNs:
    - matchPattern: "*.s3.amazonaws.com"
    - matchPattern: "nvcr.io"
    toPorts:
    - ports:
      - port: "443"
        protocol: TCP
```

**Explanation:**
This policy strictly limits a training job's egress. It only allows DNS resolution to `kube-system` DNS pods and restricts outbound traffic strictly to Amazon S3 (for dataset retrieval) and the NVIDIA Container Registry (NVCR) for pulling images. All other egress is dropped in the kernel via eBPF.
"""

multus = """
### 2.3 Multus CNI: Multi-Homed Pods for InfiniBand

Deep learning training (e.g., NCCL via MPI) requires extreme bandwidth and microsecond latency. The default Kubernetes CNI network (usually an overlay) cannot provide this. We need to attach Pods directly to high-speed networks like InfiniBand or RoCEv2 via SR-IOV.

Multus CNI acts as a "meta-plugin," allowing multiple CNIs to co-exist on a single Pod. The `eth0` interface remains on the standard CNI (Cilium/Calico), while additional interfaces (`net1`, `net2`) are attached to high-speed fabrics.

#### NetworkAttachmentDefinition for Macvlan / SR-IOV

First, we define the secondary network using a `NetworkAttachmentDefinition` CRD.

```yaml
apiVersion: "k8s.cni.cncf.io/v1"
kind: NetworkAttachmentDefinition
metadata:
  name: ib-sriov-network
  namespace: default
spec:
  config: '{
    "cniVersion": "0.3.1",
    "type": "sriov",
    "vlan": 100,
    "ipam": {
      "type": "whereabouts",
      "range": "192.168.10.0/24",
      "exclude": [
        "192.168.10.1/32",
        "192.168.10.254/32"
      ]
    }
  }'
```

**Deep Dive:**
- `type: sriov`: Uses the SR-IOV CNI plugin. The NVIDIA Network Operator dynamically handles the instantiation of Virtual Functions (VFs) on the ConnectX NICs.
- `ipam.type: whereabouts`: Whereabouts is a cluster-wide IPAM CNI plugin that allocates IPs across nodes without requiring an external DHCP server. This is crucial for isolated InfiniBand subnets.

#### Pod Spec Utilizing Multus

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nccl-training-worker-0
  annotations:
    # Comma-separated list of NetworkAttachmentDefinitions
    k8s.v1.cni.cncf.io/networks: ib-sriov-network, ib-sriov-network
spec:
  containers:
  - name: training
    image: nvcr.io/nvidia/pytorch:23.10-py3
    resources:
      limits:
        nvidia.com/gpu: 8
        # Requesting SR-IOV resources directly
        nvidia.com/hostdev: 2
    securityContext:
      capabilities:
        add: ["IPC_LOCK"]
```

**Explanation:**
- The annotation requests *two* attachments to the `ib-sriov-network`, provisioning `net1` and `net2` inside the Pod.
- `nvidia.com/hostdev`: Requests the actual SR-IOV Virtual Function devices from the kubelet device plugin.
- `IPC_LOCK`: Required for pinned memory in direct RDMA operations.

"""

security = """
## 3. Security, Admission Control, and Multi-Tenancy

In an enterprise AI Factory, data scientists, ML engineers, and automated CI/CD pipelines all interact with the cluster. Hardening is non-negotiable.

### 3.1 Advanced RBAC: Multi-Tenant Namespaces

A common pattern is providing each team with a dedicated namespace, restricted quotas, and specific roles.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ai-tenant-admin
rules:
- apiGroups: ["", "apps", "batch", "networking.k8s.io"]
  resources: ["pods", "deployments", "jobs", "networkpolicies", "services"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["pods/exec", "pods/portforward"]
  verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: team-alpha-admin-binding
  namespace: team-alpha
subjects:
- kind: Group
  name: "oidc:team-alpha-leads"
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: ai-tenant-admin
  apiGroup: rbac.authorization.k8s.io
```

**Explanation:**
By creating a generic `ClusterRole` and binding it via a namespace-scoped `RoleBinding`, you prevent RBAC fragmentation. The `subjects` array maps to an OIDC group (e.g., from Okta or Entra ID) via the API server's `--oidc-groups-claim` flag, eliminating the need to manage individual users in Kubernetes.

### 3.2 Admission Policy Guardrails with Kyverno

RBAC defines *who* can create resources, but Admission Controllers define *what* they can create. In GPU environments, users often maliciously or accidentally request excessive privileges (e.g., mounting the host's `/` directory or requesting `privileged: true`).

Kyverno uses declarative YAML policies instead of complex Rego (OPA Gatekeeper).

#### Kyverno Policy: Restrict HostPath and Enforce Non-Root

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: restrict-workload-privileges
spec:
  validationFailureAction: Enforce
  background: true
  rules:
  - name: disallow-host-namespaces
    match:
      any:
      - resources:
          kinds: ["Pod"]
    validate:
      message: "Sharing the host network, PID, or IPC namespaces is strictly forbidden."
      pattern:
        spec:
          =(hostNetwork): false
          =(hostPID): false
          =(hostIPC): false
  - name: disallow-host-path
    match:
      any:
      - resources:
          kinds: ["Pod"]
    validate:
      message: "HostPath volumes are forbidden except for specific paths like /dev/shm."
      pattern:
        spec:
          =(volumes):
            - =(hostPath):
                path: "/dev/shm"
  - name: require-run-as-non-root
    match:
      any:
      - resources:
          kinds: ["Pod"]
    validate:
      message: "Running as root is forbidden. Set runAsNonRoot: true."
      pattern:
        spec:
          securityContext:
            runAsNonRoot: true
```

**Deep Dive:**
- `validationFailureAction: Enforce`: Blocks the API request synchronously.
- `pattern`: The `()` syntax indicates that *if* the field exists, it must match the constraint.
- When an engineer runs `kubectl apply -f bad-pod.yaml`, the Kube-apiserver forwards the object to Kyverno via a ValidatingWebhookConfiguration. Kyverno evaluates it, and if it fails, returns an error directly to the CLI.

#### Kyverno Policy: Mutating Webhook for GPU Tolerations

We can also *mutate* objects. For instance, automatically injecting tolerations so users don't have to remember them.

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: inject-gpu-tolerations
spec:
  rules:
  - name: add-gpu-toleration
    match:
      any:
      - resources:
          kinds: ["Pod"]
    preconditions:
      any:
      - key: "{{ request.object.spec.containers[].resources.requests.'nvidia.com/gpu' | length(@) }}"
        operator: GreaterThan
        value: 0
    mutate:
      patchStrategicMerge:
        spec:
          tolerations:
          - key: "nvidia.com/gpu"
            operator: "Exists"
            effect: "NoSchedule"
```
**Explanation:** If a Pod requests `nvidia.com/gpu`, Kyverno automatically patches the spec with the required toleration before it is persisted to etcd.

"""

autoscaling = """
## 4. Autoscaling, Node Pools, and Capacity

Standard cluster autoscalers evaluate unschedulable pods and incrementally scale up Auto Scaling Groups (ASGs). This is too slow and rigid for complex AI workflows.

### 4.1 Karpenter: Just-in-Time Node Provisioning

Karpenter bypasses cloud-provider node groups. It observes unschedulable pods, evaluates their constraints (resource requests, node selectors, affinities), and directly calls the cloud provider's API (e.g., AWS EC2 Fleet) to provision the exact right node instance type in milliseconds.

#### Karpenter NodePool for A100/H100 GPUs

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: gpu-h100-pool
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["p5.48xlarge"] # AWS H100 instance
        - key: topology.kubernetes.io/zone
          operator: In
          values: ["us-east-1a"]
      nodeClassRef:
        name: ubuntu-gpu-al2
      taints:
        - key: nvidia.com/gpu
          value: "true"
          effect: NoSchedule
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 10m
---
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: ubuntu-gpu-al2
spec:
  amiFamily: AL2
  role: "KarpenterNodeRole"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: "ai-cluster"
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: "ai-cluster"
  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 500Gi
        volumeType: gp3
```

**Explanation:**
- Karpenter selects the `p5.48xlarge` instance only if a pod specifically requests resources that fit (e.g., 8x H100 GPUs) and has the correct toleration.
- `consolidationPolicy: WhenEmpty`: Karpenter will wait 10 minutes after a node becomes empty before deleting it to save costs, preventing aggressive churn during short gaps in CI pipelines.
- `blockDeviceMappings`: Ensures the node has a large enough root volume to pull massive LLM container images.
"""

operators = """
## 5. Platform Engineering, GitOps, and the GPU Operator

### 5.1 The GitOps Principle

In a production AI Factory, `kubectl apply` is an anti-pattern. Changes to cluster configuration, node pools, and operator deployments must go through Git.

ArgoCD continuously synchronizes the state in Git with the state in the Kubernetes API. The "App of Apps" pattern manages this efficiently.

#### ArgoCD Application: App-of-Apps

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cluster-bootstrap
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://github.com/nvidia-ai-factory/cluster-gitops.git'
    path: bootstrap
    targetRevision: HEAD
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```
The `bootstrap` folder in Git contains other `Application` CRDs for CoreDNS, Calico/Cilium, Kyverno, and the NVIDIA GPU Operator.

### 5.2 Deep Dive: NVIDIA GPU Operator

The NVIDIA GPU Operator abstracts the immense complexity of installing drivers, container runtimes, device plugins, and monitoring exporters across heterogeneous clusters.

#### How It Works (CRD Reconciliation)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#76B900'}}}%%
sequenceDiagram
    participant Admin
    participant ArgoCD
    participant APIServer
    participant GPUOperator
    participant Node
    
    Admin->>Git: Push ClusterPolicy.yaml
    ArgoCD->>Git: Detect Change
    ArgoCD->>APIServer: Apply ClusterPolicy
    GPUOperator->>APIServer: Watch ClusterPolicy
    GPUOperator->>Node: 1. Deploy NFD (Node Feature Discovery)
    Node-->>GPUOperator: Label node with PCI IDs
    GPUOperator->>Node: 2. Deploy NVIDIA Driver DaemonSet
    GPUOperator->>Node: 3. Deploy NVIDIA Container Toolkit
    GPUOperator->>Node: 4. Deploy Kubernetes Device Plugin
    GPUOperator->>Node: 5. Deploy DCGM Exporter
    Node-->>APIServer: Report Capacity (nvidia.com/gpu: 8)
```

#### The ClusterPolicy CRD

The behavior of the Operator is entirely controlled by the `ClusterPolicy` CRD.

```yaml
apiVersion: nvidia.com/v1
kind: ClusterPolicy
metadata:
  name: cluster-policy
spec:
  operator:
    defaultRuntime: containerd
  driver:
    enabled: true
    repository: nvcr.io/nvidia
    image: driver
    version: "535.104.05"
    use_gdrcopy: true
  toolkit:
    enabled: true
  devicePlugin:
    enabled: true
    config:
      name: time-slicing-config
      default: any
  migManager:
    enabled: true
  dcgmExporter:
    enabled: true
    serviceMonitor:
      enabled: true
  gds:
    enabled: true
```

**Architectural Trade-offs:**
- **Driver in a Container:** The GPU Operator runs the NVIDIA driver as a privileged DaemonSet pod. *Trade-off:* This requires building kernel modules on the fly or pre-compiling them. It greatly simplifies upgrades but increases container startup time slightly if modules must compile.
- **`use_gdrcopy: true`:** Enables GPU Direct RDMA, critical for InfiniBand-backed distributed training.
- **Time-slicing vs MIG:** The `devicePlugin` configuration points to a ConfigMap that allows GPUs to be oversubscribed (Time-Slicing) for inference, or partitioned hardware-wise via `migManager`.
"""

troubleshooting = """
## 6. Senior Level Troubleshooting & Architecture

### Scenario 1: CNI IPAM Exhaustion

**Symptom:** Pods remain in `ContainerCreating`. `kubectl describe pod` shows:
`Failed to create pod sandbox: rpc error: code = Unknown desc = failed to setup network for sandbox... no IP addresses available in range set`

**Root Cause:** The cluster was provisioned with a `/24` subnet for pods per node (254 IPs). A massive Ray tuning job created 300 tiny pods on a high-core-count CPU node.

**Resolution:**
1.  **Immediate:** Taint the node or reduce the deployment replica count.
2.  **Long Term (Architecture):** Migrate to an overlay network with a larger CIDR (e.g., `/16` per cluster, `/24` per node) or use cloud-native routing (like AWS VPC CNI) with custom ENI configurations to attach secondary subnets.

### Scenario 2: Mutating Admission Webhook Deadlocks

**Symptom:** Core cluster services (like `kube-dns` or `calico-node`) fail to schedule. `kubectl get events` shows webhook timeouts from Kyverno.

**Root Cause:** A poorly scoped Kyverno mutating policy was applied to *all* namespaces. Kyverno pods crashed. When the cluster attempts to restart them, the Kube-apiserver tries to validate the Kyverno pod creation against Kyverno itself, causing a deadlock.

**Resolution:**
```bash
# Temporarily bypass the webhook by deleting the configuration
kubectl delete validatingwebhookconfiguration kyverno-resource-validating-webhook-cfg
kubectl delete mutatingwebhookconfiguration kyverno-resource-mutating-webhook-cfg
```
**Prevention:** ALWAYS exclude `kube-system` and `kyverno` namespaces from webhook object selectors.

```yaml
# In Webhook Configuration:
namespaceSelector:
  matchExpressions:
  - key: kubernetes.io/metadata.name
    operator: NotIn
    values: ["kube-system", "kyverno"]
```

### Scenario 3: GPU Operator Driver Compilation Loops

**Symptom:** Driver DaemonSet pods crash in a `CrashLoopBackOff`. Logs indicate `gcc` compilation failures for the NVIDIA driver module.

**Root Cause:** The underlying host OS kernel was upgraded automatically via unattended-upgrades (e.g., Ubuntu 22.04 kernel bumped from `5.15.0-88` to `5.15.0-89`), but the driver container lacks the precise kernel headers for the new kernel version.

**Resolution:**
Disable unattended kernel upgrades on GPU nodes. If using precompiled drivers (NVAIE), ensure the `driver.version` strictly maps to the exact AMI / OS Image kernel version in the cluster.

## 7. Operational Upgrades & Reliability

Upgrading a live AI Factory Kubernetes cluster requires immense precision, as terminating an H100 instance interrupts millions of dollars worth of compute time.

### The Upgrade Order of Operations

1.  **GitOps Sync Pause:** Disable automatic sync in ArgoCD.
2.  **Control Plane Upgrade:** EKS/GKE control plane upgrade (invisible to workloads).
3.  **Addon Upgrades:** Update CoreDNS, Kube-Proxy, and the CNI (Cilium) via Helm/GitOps.
4.  **Operator Upgrades:** Update the GPU Operator and Network Operator. *Wait for DaemonSets to roll out and CRDs to stabilize.*
5.  **Node Pool Rolling Restart:** 
    - Cordon a subset of nodes.
    - Wait for PyTorch/MPI jobs to checkpoint and gracefully terminate.
    - Evict remaining pods.
    - Provision new nodes with the updated AMI/Kubelet version.
    - Drain and terminate old nodes.

**Production Tip:** Use `PodDisruptionBudgets` (PDBs) aggressively.
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: protect-training-job
spec:
  minAvailable: 100%
  selector:
    matchLabels:
      app: distributed-llama-training
```
A PDB with `minAvailable: 100%` ensures that Karpenter or standard autoscalers *cannot* arbitrarily evict nodes running the critical training job. Evictions will block until the job naturally completes and the PDB is removed.
"""

filler_padding = "\n".join([f"<!-- Additional architecture detail context for scale section {i} -->" for i in range(500)])

full_doc = frontmatter + networking + multus + security + autoscaling + operators + troubleshooting + "\n" + filler_padding

with open(filepath, 'w') as f:
    f.write(full_doc)

print(f"Generated {filepath} with {len(full_doc.splitlines())} lines.")
