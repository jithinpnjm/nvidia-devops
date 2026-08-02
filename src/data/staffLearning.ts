import type {ArchitectureScenario} from './architecture';
import type {Scenario} from './troubleshooting';

export type SystemComponent = {name: string; responsibility: string; watch: string};
export type Bottleneck = {location: string; pressure: string; symptom: string; evidence: string; guardrail: string};
export type TechnologyDecision = {choice: string; useWhen: string; why: string; alternatives: string; rejectWhen: string};
export type LearningBlueprint = {
  mentalModel: string;
  prerequisite: string;
  components: SystemComponent[];
  healthyFlow: string[];
  bottlenecks: Bottleneck[];
  operatingRules: string[];
};

const sharedCloudComponents: SystemComponent[] = [
  {name: 'Entry / identity', responsibility: 'Authenticate, authorize, rate-limit and establish the tenant/request context.', watch: 'Auth failures, rejected work, connection and request latency'},
  {name: 'Control plane', responsibility: 'Convert intent into desired state, placement and lifecycle actions.', watch: 'Reconcile latency, queue depth, API errors and stale desired state'},
  {name: 'Data plane', responsibility: 'Execute requests or jobs and move application/model data.', watch: 'Latency, errors, saturation, throughput and backpressure'},
  {name: 'State / artifacts', responsibility: 'Persist durable data, configuration, models, checkpoints and release evidence.', watch: 'I/O latency, capacity, replication lag, integrity and restore time'},
  {name: 'Telemetry plane', responsibility: 'Correlate user, request, workload, node and dependency evidence.', watch: 'SLIs, missing telemetry, cardinality, ingestion delay and cost'},
];

const architecturePresets: Record<ArchitectureScenario['category'], LearningBlueprint> = {
  'Cloud & Kubernetes': {
    mentalModel: 'Treat the platform as two coupled systems: a control plane that decides what should exist and a data plane that serves traffic. Availability requires independent failure domains, bounded dependencies and a tested degraded mode—not merely more replicas.',
    prerequisite: 'Be able to trace DNS → load balancer → ingress/gateway → service → Pod → dependency and separately Git/IaC → API → controller → scheduler → kubelet.',
    components: [
      ...sharedCloudComponents,
      {name: 'Failure-domain layer', responsibility: 'Spread capacity and state across zones/regions while keeping quorum and data consistency explicit.', watch: 'Zone concentration, unavailable replicas, quorum health and failover readiness'},
      {name: 'Capacity layer', responsibility: 'Translate demand, headroom, maintenance and failure reserve into allocatable resources.', watch: 'Queue age, unschedulable work, utilization, waste and scale latency'},
    ],
    healthyFlow: ['Client + identity', 'Global/region traffic policy', 'Gateway + admission', 'Service/workload pool', 'Stateful dependencies', 'Response + end-to-end telemetry'],
    bottlenecks: [
      {location: 'Gateway/ingress', pressure: 'Connections, TLS, request size or retry fan-out', symptom: '502/503, rising connect/TTFB or uneven backend load', evidence: 'Connection counters, route-level latency, retries/logical request and backend distribution', guardrail: 'Bounded retries, overload policy, timeout budget and connection-capacity tests'},
      {location: 'Scheduler/capacity', pressure: 'Fragmented CPU, memory, GPU or topology', symptom: 'Queue time grows while headline utilization looks acceptable', evidence: 'Pending reasons, allocatable-by-zone, topology and reservation fragmentation', guardrail: 'Service classes, topology-aware capacity model, reservations and failure reserve'},
      {location: 'Stateful dependency', pressure: 'Connections, IOPS, locks, replication or quorum', symptom: 'Tail latency and errors spread through healthy stateless replicas', evidence: 'Pool wait, dependency spans, server waits, lag and saturation', guardrail: 'Backpressure, isolation, connection budget, tested failover and restore'},
    ],
    operatingRules: ['Define SLO and overload behavior before autoscaling.', 'Separate regional failover from zonal high availability.', 'Validate restore and failover, not only backup and replica count.', 'Every controller and dependency needs an owner, latency budget and rollback.'],
  },
  'CI/CD & platform engineering': {
    mentalModel: 'A delivery platform is a policy-controlled state machine that turns reviewed source into verifiable production state. The artifact—not a rebuilt branch—is promoted, and every gate must produce evidence or a rollback decision.',
    prerequisite: 'Understand source, build, test, artifact, provenance, deploy, verify and rollback as distinct trust and failure boundaries.',
    components: [
      {name: 'Source + review', responsibility: 'Establish authorized intent, ownership and immutable revision.', watch: 'Review policy, branch protection, change size and bypass events'},
      {name: 'Build workers', responsibility: 'Execute isolated, reproducible builds with ephemeral identity.', watch: 'Queue SLO, saturation, cache correctness and worker compromise'},
      {name: 'Artifact + provenance', responsibility: 'Store immutable images/packages plus SBOM, signatures and attestations.', watch: 'Digest mismatch, unsigned artifacts, vulnerability and retention'},
      {name: 'Policy / promotion', responsibility: 'Evaluate risk and promote the same digest through environments.', watch: 'Gate decisions, exceptions, environment drift and approval latency'},
      {name: 'Deployment controller', responsibility: 'Reconcile desired release, canary it and roll back on guardrails.', watch: 'Reconciliation, rollout health, SLO delta and rollback duration'},
      {name: 'Developer portal', responsibility: 'Expose golden paths without hiding ownership, cost or production evidence.', watch: 'Adoption, lead time, failure rate, cognitive load and support tickets'},
    ],
    healthyFlow: ['Reviewed change', 'Hermetic build + tests', 'Signed immutable artifact', 'Policy + staged promotion', 'Canary/blue-green rollout', 'SLO verification + audit'],
    bottlenecks: [
      {location: 'Runner pool', pressure: 'Burst concurrency, quota or long jobs', symptom: 'Hotfix waits behind low-priority work', evidence: 'Queue time vs execution time, utilization, autoscaler and cloud quota', guardrail: 'Protected capacity, priority, concurrency limits and pre-warmed runners'},
      {location: 'Security gates', pressure: 'Slow scans, noisy findings or manual exceptions', symptom: 'Teams bypass controls or releases stall', evidence: 'Gate latency, false-positive rate, exception age and bypass audit', guardrail: 'Risk-tiered gates, expiring exceptions, cached evidence and ownership'},
      {location: 'Deployment', pressure: 'Large blast radius, incompatible state or weak verification', symptom: 'Fast rollout creates widespread correlated failure', evidence: 'Canary SLI delta, schema compatibility, error budget and rollback time', guardrail: 'Progressive delivery, expand/contract state changes and automatic rollback'},
    ],
    operatingRules: ['Build once and promote by digest.', 'Use short-lived workload identity; never distribute long-lived cloud keys.', 'A green deployment means user SLIs passed, not merely that Pods became Ready.', 'Golden paths must have escape hatches with visible ownership and risk.'],
  },
  'GPU platform': {
    mentalModel: 'A GPU platform is a capacity, topology and lifecycle product. Kubernetes policy can allocate a resource, but useful GPU goodput also depends on driver/runtime compatibility, device health, NUMA/GPU/NIC locality, workload shape and fair queueing.',
    prerequisite: 'Distinguish physical GPU, MIG partition, time-slice, advertised extended resource and actual useful accelerator work.',
    components: [
      {name: 'GPU hardware + topology', responsibility: 'Provide accelerator, memory, NVLink/PCIe and locality boundaries.', watch: 'Xid/ECC, thermals, clocks, link health and topology'},
      {name: 'Driver + container stack', responsibility: 'Expose hardware through kernel driver, NVML, runtime/CDI and user libraries.', watch: 'Compatibility, module/NVML errors and device visibility'},
      {name: 'GPU Operator operands', responsibility: 'Reconcile driver/toolkit/device-plugin/DCGM/MIG lifecycle.', watch: 'Operand readiness, allocatable resources and upgrade state'},
      {name: 'Scheduler / queue', responsibility: 'Place full GPU, MIG or shared workloads against quota, priority and topology.', watch: 'Queue time, fragmentation, preemption and unschedulable reasons'},
      {name: 'Tenant workload', responsibility: 'Convert reserved GPU time into training progress or inference tokens.', watch: 'Goodput, utilization, memory, job outcome and cost'},
      {name: 'DCGM + observability', responsibility: 'Correlate GPU UUID, node, Pod, tenant and workload health/performance.', watch: 'Metric continuity, actionable health events and per-tenant efficiency'},
    ],
    healthyFlow: ['Qualified node + firmware', 'Driver/NVML/runtime', 'Device plugin advertises resource', 'Queue + topology placement', 'Container uses GPU', 'DCGM + workload goodput prove value'],
    bottlenecks: [
      {location: 'Allocation', pressure: 'MIG geometry or topology fragmentation', symptom: 'Jobs wait despite idle slices/GPUs', evidence: 'Requested resource, geometry, topology and queue reason', guardrail: 'Capacity products, gang placement and defragmentation policy'},
      {location: 'Data/fabric feed', pressure: 'Storage, CPU preprocessing or network collectives', symptom: 'Low GPU activity with healthy hardware', evidence: 'Per-rank iteration, I/O wait, network counters and GPU active cycles', guardrail: 'End-to-end benchmarks and admission health gates'},
      {location: 'Lifecycle', pressure: 'Mixed driver/CUDA/firmware versions', symptom: 'Node cohort loses devices or workload compatibility', evidence: 'Compatibility inventory, NVML/operator logs and canary matrix', guardrail: 'Hardware-cohort canary, drain, health gate and known-good rollback'},
    ],
    operatingRules: ['Optimize successful work per GPU-hour, not nvidia-smi utilization alone.', 'Treat sharing choice as an isolation and predictability decision.', 'Canary every hardware/firmware cohort represented in the fleet.', 'Quarantine health failures before reusing the node.'],
  },
  'Training & HPC': {
    mentalModel: 'Distributed training behaves like one large synchronous machine: the slowest rank, failed link or blocked checkpoint can stall all reserved GPUs. Compute, fabric, storage, scheduler and recovery must be designed and benchmarked together.',
    prerequisite: 'Understand rank, collective, topology, gang scheduling, checkpoint/RPO and scaling efficiency.',
    components: [
      {name: 'Scheduler + launcher', responsibility: 'Atomically allocate topology-compatible nodes and start every rank.', watch: 'Queue reason, launch time, rank/process state and fair-share'},
      {name: 'GPU compute domain', responsibility: 'Execute kernels and exchange data across local NVLink/PCIe.', watch: 'Per-rank step time, clocks, ECC, memory and skew'},
      {name: 'NCCL/MPI communication', responsibility: 'Bootstrap ranks and execute cross-node collectives.', watch: 'Collective latency/bandwidth, timeouts, rail choice and retransmits'},
      {name: 'Compute fabric', responsibility: 'Provide predictable RDMA path with correct topology and congestion control.', watch: 'Link state/rate, drops, ECN/PFC, errors and asymmetry'},
      {name: 'Dataset/checkpoint storage', responsibility: 'Feed batches and persist recoverable progress without stalling ranks.', watch: 'Read/write throughput, small-file metadata, checkpoint and restore time'},
      {name: 'Health + telemetry', responsibility: 'Detect stragglers and exclude degraded nodes before allocation.', watch: 'DCGM, fabric counters, node health, goodput and failure recurrence'},
    ],
    healthyFlow: ['Scheduler gang allocation', 'Rank launch + topology mapping', 'Dataset preprocessing/feed', 'Forward/backward compute', 'NCCL collective synchronization', 'Checkpoint + progress telemetry'],
    bottlenecks: [
      {location: 'One rank/node', pressure: 'Thermal, CPU, NUMA, GPU or I/O degradation', symptom: 'All ranks wait and iteration variance rises', evidence: 'Per-rank step time, GPU clocks, CPU/NUMA and link counters', guardrail: 'Preflight qualification, skew alert and automatic quarantine'},
      {location: 'Collective fabric', pressure: 'Oversubscription, loss, bad rail or locality', symptom: 'Scaling efficiency collapses as nodes are added', evidence: 'nccl-tests, per-port counters, selected interfaces and topology', guardrail: 'Validated rail design, QoS and topology-aware placement'},
      {location: 'Checkpoint/storage', pressure: 'Synchronized write burst or slow restore', symptom: 'Periodic GPU idle and RTO breach', evidence: 'Checkpoint duration, storage latency/throughput and restore drill', guardrail: 'Async/local staging, durable copy and measured RPO/RTO'},
    ],
    operatingRules: ['Benchmark single GPU → single node → multi-node before sizing.', 'Measure scaling efficiency and goodput, not reserved GPU utilization.', 'Checkpoint success is incomplete until restore is timed and validated.', 'Separate management, compute-fabric and storage failure domains.'],
  },
  'Inference & GenAI': {
    mentalModel: 'Inference capacity is token- and memory-shaped, not request-shaped. Prefill and decode stress different resources; batching improves throughput but can violate tail latency, while KV cache and model residency determine concurrency.',
    prerequisite: 'Distinguish TTFT, inter-token latency, tokens/s, prompt/output distribution, continuous batching and KV cache.',
    components: [
      {name: 'Identity-aware gateway', responsibility: 'Authenticate, quota, route, bound requests and enforce overload policy.', watch: 'RPS/tokens, rejection, queue age and tenant distribution'},
      {name: 'Router / scheduler', responsibility: 'Choose model/version/pool and batch compatible requests.', watch: 'Batch size, wait time, routing skew and replica saturation'},
      {name: 'Serving runtime', responsibility: 'Load model, manage KV cache and execute prefill/decode.', watch: 'TTFT, ITL, tokens/s, cache pressure and GPU memory'},
      {name: 'Model/artifact plane', responsibility: 'Validate, sign, optimize, distribute and cache immutable model versions.', watch: 'Load time, cache hit, digest, rollout and rollback'},
      {name: 'GPU pool', responsibility: 'Provide topology/capacity classes matched to model and SLO.', watch: 'Useful tokens/GPU, health, fragmentation and warm capacity'},
      {name: 'Evaluation/telemetry', responsibility: 'Tie latency, quality, safety and cost to tenant/model/prompt class.', watch: 'SLO, groundedness/quality, safety, cost and version regression'},
    ],
    healthyFlow: ['Authenticated token-budgeted request', 'Route + bounded queue', 'Continuous batch', 'Prefill + KV allocation', 'Decode + stream', 'SLO/quality/cost record'],
    bottlenecks: [
      {location: 'Admission/queue', pressure: 'Burst tokens or long prompts', symptom: 'TTFT rises before GPU reaches simple utilization threshold', evidence: 'Queue age, waiting tokens, prompt distribution and rejection', guardrail: 'Token-aware admission, bounded queue and service tiers'},
      {location: 'GPU memory/KV', pressure: 'Active sequences and context length', symptom: 'OOM, eviction or reduced concurrency', evidence: 'KV occupancy, active tokens, memory and request shape', guardrail: 'Concurrency/context caps, paging/offload policy and capacity tests'},
      {location: 'Batching/runtime', pressure: 'Mixed prefill/decode and model versions', symptom: 'Throughput gain but P95 latency/quality regression', evidence: 'TTFT/ITL by prompt class, tokens/s and canary evaluation', guardrail: 'Representative benchmark matrix and automatic SLO rollback'},
    ],
    operatingRules: ['Capacity-plan from prompt/output distributions and concurrency.', 'Define explicit reject/degrade behavior before overload.', 'Canary latency, throughput and quality together.', 'Keep warm capacity for strict TTFT tiers; scale-to-zero is an SLO decision.'],
  },
  'Reliability & operations': {
    mentalModel: 'Reliability is a control loop: define user-visible SLOs, observe error-budget consumption, isolate failure domains, choose the least-destructive response and prove recovery. Redundancy without tested failover is only inventory.',
    prerequisite: 'Know SLI/SLO/error budget, detection vs diagnosis, mitigation vs repair, RPO/RTO and failure-domain boundaries.',
    components: sharedCloudComponents,
    healthyFlow: ['User journey defines SLI', 'Telemetry measures good/bad events', 'Alert uses actionable burn', 'Incident contains impact', 'Mechanism is proven', 'Recovery + prevention are verified'],
    bottlenecks: [
      {location: 'Telemetry', pressure: 'Cardinality, sampling, missing labels or ingestion delay', symptom: 'Blind incident or expensive/slow queries', evidence: 'Target health, series count, dropped samples and pipeline lag', guardrail: 'Telemetry SLO, budgets, recording rules and ownership'},
      {location: 'Shared dependency', pressure: 'Retry/load amplification or hidden coupling', symptom: 'Multiple healthy services fail together', evidence: 'Traces, logical requests vs attempts, dependency saturation and deadlines', guardrail: 'Bulkheads, retry ownership, backpressure and graceful degradation'},
      {location: 'Recovery path', pressure: 'Untested failover/restore or stale runbook', symptom: 'Redundancy exists but RTO/RPO is missed', evidence: 'Drill result, restore integrity, failover time and operator steps', guardrail: 'Automated game days and restore/failover acceptance tests'},
    ],
    operatingRules: ['Page on user impact or imminent exhaustion, not every anomaly.', 'State what is healthy, failed and still unknown.', 'Contain first when blast radius is growing; preserve evidence before destructive repair.', 'Close only after the original user-visible symptom and rollback point are validated.'],
  },
  'Security & edge': {
    mentalModel: 'Security architecture is identity, policy and evidence applied at every trust boundary. Availability remains a security property: a control that cannot be operated, rotated or recovered safely becomes a production failure source.',
    prerequisite: 'Identify human/workload identity, data classification, trust boundary, policy decision point and audit trail.',
    components: [
      {name: 'Identity provider', responsibility: 'Issue short-lived human/workload identity with lifecycle controls.', watch: 'Token errors, clock, issuance, revocation and privilege use'},
      {name: 'Policy decision/enforcement', responsibility: 'Evaluate least privilege and enforce at API, network and workload boundaries.', watch: 'Allow/deny decision, policy drift, bypass and latency'},
      {name: 'Secrets/keys', responsibility: 'Protect and rotate credentials, encryption keys and signing material.', watch: 'Age, access, rotation success and blast radius'},
      {name: 'Supply chain', responsibility: 'Prove source, artifact, dependency and deployment provenance.', watch: 'Signature, SBOM, vulnerabilities and exceptions'},
      {name: 'Audit/detection', responsibility: 'Record decisions and detect misuse without leaking sensitive content.', watch: 'Coverage, integrity, retention, alert quality and investigation time'},
    ],
    healthyFlow: ['Identity issuance', 'Authenticated request/workload', 'Policy decision', 'Enforcement at boundary', 'Protected data/action', 'Immutable audit + detection'],
    bottlenecks: [
      {location: 'Identity/token path', pressure: 'Clock, JWKS, rate or dependency failure', symptom: 'Intermittent auth failure or lockout', evidence: 'Token claims, time offset, issuer/JWKS and node correlation', guardrail: 'Time SLO, caching, break-glass and multi-path validation'},
      {location: 'Policy layer', pressure: 'Complexity, non-determinism or broad default deny', symptom: 'Drift loops, hidden outage or unsafe bypass', evidence: 'Decision logs, audit events, dry run and ownership', guardrail: 'Policy tests, staged enforcement and expiring exceptions'},
      {location: 'Privileged node agent', pressure: 'Host access and broad permissions', symptom: 'Large blast radius if compromised or misconfigured', evidence: 'RBAC, runtime privileges, host mounts and audit', guardrail: 'Dedicated pools, least privilege, signing and tight lifecycle ownership'},
    ],
    operatingRules: ['Name the exact trust boundary; namespaces are not physical isolation.', 'Prefer short-lived federated identity over distributed secrets.', 'Test rotation, revocation and break-glass paths.', 'Treat retrieved/model/user content as untrusted input.'],
  },
  'Migration & economics': {
    mentalModel: 'A migration is a sequence of reversible risk reductions, and TCO is the cost of delivering the SLO—not the sticker price of compute. Baseline demand, dependencies, operational ownership and exit criteria before choosing a target.',
    prerequisite: 'Understand baseline, dependency inventory, wave, coexistence, rollback, acceptance gate and unit economics.',
    components: [
      {name: 'Discovery/baseline', responsibility: 'Measure workload, dependency, SLO, cost and skill constraints.', watch: 'Coverage, unknown owners, peak shape and hidden licenses'},
      {name: 'Target landing zone', responsibility: 'Provide identity, network, policy, observability and cost controls before workloads.', watch: 'Control readiness, quota, connectivity and operational gaps'},
      {name: 'Migration factory', responsibility: 'Classify, transform, test and move workloads in bounded waves.', watch: 'Lead time, defect/rollback rate, blocked dependencies and variance'},
      {name: 'Coexistence/data sync', responsibility: 'Keep old/new paths consistent during cutover and rollback window.', watch: 'Lag, divergence, dual-write errors and data integrity'},
      {name: 'FinOps/operations', responsibility: 'Measure unit cost, commitments, utilization and human operating effort.', watch: 'Cost per outcome, idle capacity, egress, support and SLO misses'},
    ],
    healthyFlow: ['Inventory + baseline', 'Classify + target design', 'Landing-zone readiness', 'Pilot/wave migration', 'Observe + reconcile', 'Cut over + retire after exit gate'],
    bottlenecks: [
      {location: 'Discovery', pressure: 'Unknown dependencies and ownership', symptom: 'Late blockers and failed cutovers', evidence: 'Traffic/dependency map, owner coverage and change history', guardrail: 'Automated discovery plus owner sign-off and pilot'},
      {location: 'Data/coexistence', pressure: 'Replication lag or incompatible schema', symptom: 'Rollback loses or corrupts writes', evidence: 'Lag, reconciliation, integrity and compatibility tests', guardrail: 'Expand/contract, dual-path validation and explicit rollback window'},
      {location: 'Economics', pressure: 'Idle reserve, egress, licenses and operations', symptom: 'Target is technically successful but costs more', evidence: 'Unit cost, utilization, support effort and SLO penalty', guardrail: 'Workload-shaped model, sensitivity analysis and post-wave cost gate'},
    ],
    operatingRules: ['Migrate by dependency-aware waves, not organization chart.', 'Prove rollback while coexistence is still available.', 'Compare cost at equal SLO, resilience and operating effort.', 'Retire the old path only after reconciliation and acceptance evidence.'],
  },
};

const technologyDecisions: Record<ArchitectureScenario['category'], TechnologyDecision[]> = {
  'Cloud & Kubernetes': [
    {choice: 'Kubernetes', useWhen: 'Many long-running services need common policy, portability, progressive delivery and a platform team can own Day-2 operations.', why: 'A reconciliation API and shared scheduling/policy layer reduce duplicated operational machinery across services.', alternatives: 'Managed serverless/containers for simpler stateless services; VMs for legacy or appliance-shaped workloads.', rejectWhen: 'The estate is small, scale-to-zero dominates, or the team cannot safely operate upgrades, networking, security and capacity.'},
    {choice: 'PostgreSQL / relational SQL', useWhen: 'Transactions span related entities, constraints matter, access patterns evolve and joins are part of the domain.', why: 'ACID transactions, relational constraints and flexible query planning protect correctness while the model changes.', alternatives: 'DynamoDB/Bigtable for known key-based access at massive scale; document DB for document-shaped aggregates.', rejectWhen: 'The dominant path is predictable key-value access at extreme scale and relational/transactional features add cost without value.'},
    {choice: 'DynamoDB / managed key-value', useWhen: 'Access patterns and partition keys are known, per-request latency must remain predictable at high scale and operational overhead should be minimal.', why: 'Automatic partitioning, managed availability and request-driven capacity fit key-addressable state without joins.', alternatives: 'PostgreSQL for relational integrity/ad-hoc queries; Redis for ephemeral cache/state; object storage for blobs.', rejectWhen: 'You need joins, multi-entity relational constraints, broad ad-hoc queries, or cannot design a non-hot partition key.'},
    {choice: 'Redis cache', useWhen: 'Repeated reads or expensive computation can tolerate bounded staleness and origin load needs protection.', why: 'Low-latency in-memory access can absorb bursts and decouple user latency from slower durable stores.', alternatives: 'CDN/edge cache, in-process cache, database read replicas or no cache.', rejectWhen: 'The data cannot tolerate stale/evicted values, invalidation is unsolved, or Redis would become the only copy of durable truth.'},
  ],
  'GPU platform': [
    {choice: 'Full GPU allocation', useWhen: 'Training, large memory footprints or deterministic latency/throughput require the complete device and interconnect.', why: 'Avoids sharing interference and preserves memory, bandwidth and topology for one workload.', alternatives: 'MIG for hard partitions; time-slicing for trusted low-duty-cycle work.', rejectWhen: 'Workloads consistently use a small fraction of memory/compute and utilization loss outweighs predictability.'},
    {choice: 'MIG', useWhen: 'Supported GPUs serve repeatable smaller profiles that need hardware-backed memory/compute partitioning and predictable isolation.', why: 'Creates schedulable isolated GPU instances with stronger boundaries than time-slicing.', alternatives: 'Full GPU for large/latency-critical jobs; time-slicing for elastic trusted bursts.', rejectWhen: 'Required profile/geometry is unsupported, workloads need full NVLink/device memory, or frequent geometry changes create fragmentation and drain cost.'},
    {choice: 'Time-slicing', useWhen: 'Trusted, bursty, low-duty-cycle workloads tolerate weak isolation and variable latency.', why: 'Raises occupancy without permanently fixing MIG geometry.', alternatives: 'MIG for stronger isolation; full GPU for predictability.', rejectWhen: 'Tenants are untrusted, memory isolation is required, or SLOs cannot tolerate noisy neighbors.'},
    {choice: 'H100/A100 class', useWhen: 'Large-model training/inference needs high memory bandwidth, tensor throughput, large HBM and fast multi-GPU interconnect.', why: 'Better time-to-train and large-model capacity can outweigh the higher hourly price when accelerators are kept productive.', alternatives: 'L4/T4 for smaller inference, media and cost-sensitive low-throughput workloads; CPU for tiny/infrequent models.', rejectWhen: 'The model fits a smaller accelerator and latency/throughput targets are met more cheaply on L4/T4.'},
    {choice: 'L4/T4 class', useWhen: 'Smaller inference, video or light GPU workloads prioritize cost/power density over maximum training performance.', why: 'Lower acquisition/hourly cost and power can improve cost per request for models that fit memory and SLO.', alternatives: 'A100/H100 for large models, high concurrency or training; MIG on larger GPUs for consolidated isolated inference.', rejectWhen: 'Model memory, TTFT, batch throughput or multi-GPU training requires higher HBM bandwidth/capacity and interconnect.'},
  ],
  'Training & HPC': [
    {choice: 'Slurm', useWhen: 'Tightly coupled batch jobs need mature gang scheduling, topology, reservations, fair-share and an established research workflow.', why: 'Its scheduling/accounting model is purpose-built for queued HPC jobs and finite accelerator partitions.', alternatives: 'Kubernetes for service-oriented/cloud-native delivery; a bounded hybrid with shared identity/artifacts.', rejectWhen: 'The dominant workload is long-running services with Kubernetes-native deployment and tenancy patterns.'},
    {choice: 'Kubernetes', useWhen: 'Training is integrated with cloud-native pipelines/operators and platform consistency matters more than legacy HPC workflow.', why: 'One API can join data, training, serving, policy and GitOps when gang/topology requirements are met by the chosen stack.', alternatives: 'Slurm for mature HPC batch; managed training service for reduced operations.', rejectWhen: 'Scheduler extensions cannot meet topology, gang, fair-share and scale requirements without excessive complexity.'},
    {choice: 'InfiniBand', useWhen: 'Large synchronous collectives need consistently low latency/high bandwidth and the organization can operate a dedicated HPC fabric.', why: 'A purpose-built RDMA fabric and mature HPC tooling reduce variance at scale.', alternatives: 'RoCE for integration with an Ethernet estate; TCP for small/non-sensitive jobs.', rejectWhen: 'Scale does not justify a dedicated fabric or the team lacks the operational capability.'},
    {choice: 'RoCE', useWhen: 'RDMA performance is required within an Ethernet operating model and lossless/QoS/congestion controls can be engineered end to end.', why: 'Converges network skills and hardware while enabling RDMA-capable GPU communication.', alternatives: 'InfiniBand for dedicated predictable HPC; TCP for smaller scale.', rejectWhen: 'PFC/ECN/QoS cannot be consistently controlled across the full path or shared traffic causes unacceptable variance.'},
  ],
  'Inference & GenAI': [
    {choice: 'NVIDIA NIM / Triton-style managed serving runtime', useWhen: 'Multiple model versions need standardized loading, batching, metrics, optimization and rollout behavior.', why: 'A serving layer centralizes performance controls and observability instead of rebuilding them in each application.', alternatives: 'Framework-native server for simple cases; managed cloud model endpoint for low operational ownership.', rejectWhen: 'A highly specialized runtime materially outperforms it or the workload is too small to justify a platform layer.'},
    {choice: 'H100/A100 serving pool', useWhen: 'Large models, high concurrency or strict TTFT require large HBM and high tensor/memory throughput.', why: 'More expensive accelerators may deliver lower cost per token when they keep bigger batches/models inside the SLO.', alternatives: 'L4/T4 for smaller models and moderate traffic; CPU for embeddings/tiny models where proven.', rejectWhen: 'Measured tokens per euro at the target SLO is better on a smaller GPU.'},
    {choice: 'Dedicated replicas', useWhen: 'Regulation, data isolation, model customization or deterministic capacity prevents safe sharing.', why: 'Removes cross-tenant cache/interference risk and creates a clear capacity/security boundary.', alternatives: 'Shared multi-tenant pools with quota and isolation; MIG partitions.', rejectWhen: 'Traffic is sparse and dedicated warm capacity creates unacceptable idle cost without a hard isolation requirement.'},
    {choice: 'Token-aware queue/admission', useWhen: 'Prompt/output lengths vary enough that request count does not represent cost.', why: 'Queued tokens and KV demand predict saturation better than raw RPS.', alternatives: 'Simple request concurrency for uniform workloads; asynchronous batch queue for offline tier.', rejectWhen: 'Traffic shape is demonstrably uniform and simpler concurrency limits meet every SLO.'},
  ],
  'CI/CD & platform engineering': [
    {choice: 'GitHub Actions / managed CI', useWhen: 'Repositories, reviews and identity already live in GitHub and managed control-plane simplicity is valuable.', why: 'Tight source integration, reusable workflows and OIDC reduce custom CI control-plane ownership.', alternatives: 'GitLab CI, Jenkins, Tekton/Argo Workflows or cloud-native build services.', rejectWhen: 'Air-gap, custom scheduling, data residency or scale economics require a separately operated system.'},
    {choice: 'GitOps deployment', useWhen: 'Declarative environments need audited reconciliation, drift detection and pull-based credentials.', why: 'Separates build from deployment and makes desired state/version history reviewable.', alternatives: 'Pipeline push deploy for simple estates; platform API that writes desired state.', rejectWhen: 'Resources are highly imperative/ephemeral or reconciliation ownership and secret boundaries are not designed.'},
    {choice: 'Progressive delivery', useWhen: 'User SLIs can compare a small release cohort against baseline and rollback is safe.', why: 'Limits blast radius and turns production behavior into a release gate.', alternatives: 'Blue/green for atomic environment switch; rolling for low-risk stateless changes.', rejectWhen: 'Traffic cannot be segmented, state/schema is incompatible, or metrics lack sensitivity to detect regression.'},
  ],
  'Reliability & operations': [
    {choice: 'Multi-window burn-rate alert', useWhen: 'An SLO and error budget exist and paging should reflect both fast and sustained user impact.', why: 'Balances sensitivity to severe incidents with protection from short harmless noise.', alternatives: 'Static threshold for hard capacity/safety limits; anomaly detection as supporting signal.', rejectWhen: 'The SLI is not trustworthy or the action/owner for budget burn is undefined.'},
    {choice: 'OpenTelemetry', useWhen: 'Cross-service correlation and vendor-neutral collection are required across metrics, logs and traces.', why: 'Standard instrumentation/context and collector pipelines reduce per-vendor coupling.', alternatives: 'Vendor-native agents for simpler estates; Prometheus-only where traces/log correlation is unnecessary.', rejectWhen: 'Operating collector pipelines adds more complexity than the small system needs.'},
  ],
  'Security & edge': [
    {choice: 'OIDC/workload identity', useWhen: 'Humans and workloads can exchange short-lived identity for scoped access.', why: 'Eliminates broad long-lived keys and centralizes lifecycle, policy and audit.', alternatives: 'mTLS/SPIFFE for workload identity; tightly managed static secrets only for unsupported legacy systems.', rejectWhen: 'The target cannot validate/exchange tokens and a secure broker/proxy cannot be introduced.'},
    {choice: 'Dedicated security boundary', useWhen: 'Compliance, hostile tenancy or privileged host agents make logical isolation insufficient.', why: 'Reduces shared-kernel/hardware/control-plane blast radius and simplifies evidence.', alternatives: 'Namespace/RBAC/network policy for compatible trust; dedicated node pool as intermediate boundary.', rejectWhen: 'Requirements permit logical isolation and the cost/operational duplication is not justified.'},
  ],
  'Migration & economics': [
    {choice: 'Replatform', useWhen: 'A bounded platform change removes meaningful operational burden without redesigning the business application.', why: 'Captures managed/platform benefits with lower risk than a rewrite.', alternatives: 'Rehost for speed; refactor when architecture blocks SLO/scale/cost; retain/retire where justified.', rejectWhen: 'Platform incompatibility forces deep code change but is being hidden as a low-risk move.'},
    {choice: 'One-year commitment', useWhen: 'A stable measured baseline remains after rightsizing and failure/seasonal reserve.', why: 'Captures discount while limiting lock-in against uncertain growth and architecture change.', alternatives: 'On-demand for variable/uncertain load; longer commitments for highly stable baseline.', rejectWhen: 'Demand, region, machine family or platform migration remains materially uncertain.'},
  ],
};

export const architectureLearning = (scenario: ArchitectureScenario): LearningBlueprint => architecturePresets[scenario.category];
export const technologyDecisionsForArchitecture = (scenario: ArchitectureScenario): TechnologyDecision[] => technologyDecisions[scenario.category];

const incidentPresetFor = (scenario: Scenario): LearningBlueprint => {
  if (scenario.category === 'GPU/Driver') return architecturePresets['GPU platform'];
  if (['Networking/Fabric', 'Slurm/HPC'].includes(scenario.category)) return architecturePresets['Training & HPC'];
  if (['Change Management', 'IaC (Ansible/Terraform)', 'CI/CD & Delivery'].includes(scenario.category)) return architecturePresets['CI/CD & platform engineering'];
  if (['Security', 'Security/IAM'].includes(scenario.category)) return architecturePresets['Security & edge'];
  if (scenario.category === 'Observability') return architecturePresets['Reliability & operations'];
  if (['Database & Cache', 'Messaging & Streaming', 'Distributed Systems', 'General SRE', 'Cloud Networking', 'Linux/Systems', 'Automation & Python', 'Storage & Data'].includes(scenario.category)) return architecturePresets['Reliability & operations'];
  return architecturePresets['Cloud & Kubernetes'];
};

export const troubleshootingLearning = (scenario: Scenario): LearningBlueprint => {
  const preset = incidentPresetFor(scenario);
  return {
    ...preset,
    mentalModel: `${preset.mentalModel} For this incident, learn the healthy path first, then locate where “${scenario.title}” breaks that path.`,
    healthyFlow: ['User/workload symptom', ...preset.healthyFlow.slice(1, 5), 'SLI + targeted validation'],
    operatingRules: [
      `Leading mechanism: ${scenario.expectedRootCause}`,
      ...preset.operatingRules,
    ],
  };
};
