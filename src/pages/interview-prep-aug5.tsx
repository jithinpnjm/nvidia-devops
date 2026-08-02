import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import {scenarios as troubleshootingScenarios} from '@site/src/data/troubleshooting';
import {architectureScenarios} from '@site/src/data/architecture';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

const troubleshootingPicks = [
  'xid', 'roce', 'lustre-mds-metadata-bottleneck', 'high-load', 'crashloop', 'bcm-category-drift', 'cicd-emergency-override-bypass',
];

const architecturePicks = [
  'multi-tenant-gpu-platform', 'distributed-training-256', 'hybrid-kubernetes-slurm', 'fleet-upgrade',
  'bcm-fleet-provisioning-at-scale', 'ai-cluster-data-center-network-architecture',
];

const fundamentals = [
  {
    topic: 'Linux / systems',
    points: [
      'Process vs. thread: separate address space vs. shared address space within a process.',
      'A process moves through run → sleep (waiting on I/O) → runnable (ready, waiting for CPU) — high load with idle CPU almost always means many processes stuck in uninterruptible sleep (disk/network I/O), not a CPU problem.',
      'File descriptors are finite per-process; exhaustion looks like "cannot open" errors under load, not slowness.',
      'systemd unit ordering (After=/Requires=) matters most for hardware-dependent services (e.g. a GPU-dependent service starting before the driver unit is ready).',
    ],
    volumeLink: {label: 'Volume 1, Chapter 1', to: '/curriculum/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load'},
  },
  {
    topic: 'Networking',
    points: [
      'DNS → TCP handshake → TLS handshake → application request, in that order — always isolate which layer failed before guessing.',
      'NAT port exhaustion and conntrack table limits both cause intermittent, load-correlated connection failures that look identical to "flaky network" until you check the specific table/limit.',
      'RoCE needs lossless Ethernet (PFC/ECN) end-to-end; one misconfigured hop degrades throughput without dropping the link.',
    ],
    volumeLink: {label: 'Volume 1, Chapter 4', to: '/curriculum/volume-01/chapter-4-networking-ip-routes-sockets-tcp-dns-nat-and-tls'},
  },
  {
    topic: 'GPU / CUDA',
    points: [
      'Driver → CUDA toolkit → cuDNN/NCCL → framework (PyTorch/TensorFlow) is the dependency stack; a version mismatch anywhere in that chain is the most common "GPU not visible" root cause.',
      'An Xid error is the GPU driver reporting a hardware/driver-level fault via the kernel log — always check `dmesg`/`nvidia-smi -q` for the Xid code before assuming a workload bug.',
      '`nvidia-smi` utilization percentage is evidence, not proof, of good throughput — MIG partitioning, NUMA/topology mismatch, or NCCL communication overhead can all show "GPU busy" while the job is actually stalled.',
    ],
    volumeLink: {label: 'Volume 4, Chapter 1', to: '/curriculum/volume-04/chapter-1-gpu-execution-and-memory-mental-model'},
  },
  {
    topic: 'AI / ML workloads',
    points: [
      'Training (compute + memory heavy, long-running, checkpoint-recoverable) and inference (latency-sensitive, short bursts, availability-critical) need opposite infrastructure priorities — classify the workload before designing for it.',
      'Data-loader/storage starvation (GPU idle, storage or CPU busy) is a far more common cause of low GPU utilization than an inefficient kernel.',
    ],
    volumeLink: {label: 'Volume 5, Chapter 1', to: '/curriculum/volume-05/chapter-1-classify-the-ai-workload-before-designing-infrastructure'},
  },
  {
    topic: 'HPC / Slurm / MPI',
    points: [
      'Slurm fairshare determines queue priority over time, not a hard quota — a starved research group is usually a fairshare-decay misconfiguration, not a bug.',
      'MPI+NCCL startup hangs are almost always a network-reachability or rendezvous problem (wrong interface, firewall, or subnet-manager state), not an application bug — check connectivity before touching the training code.',
    ],
    volumeLink: {label: 'Volume 6, Chapter 1', to: '/curriculum/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs'},
  },
  {
    topic: 'Storage for AI',
    points: [
      'Lustre splits metadata (MDS/MDT) from data (OSS/OST) — a workload can be metadata-bound while throughput sits idle, or vice versa; check both separately.',
      'GPFS depends on cluster quorum; losing quorum during a rolling upgrade can stall the whole filesystem, not just the node under maintenance.',
      'ZFS is copy-on-write, local/NAS storage, not a distributed parallel filesystem — an undersized ARC cache looks exactly like a failing disk unless you check the hit ratio.',
    ],
    volumeLink: {label: 'Volume 6, Chapter 6', to: '/curriculum/volume-06/chapter-6-storage-for-ai-datasets-checkpoints-and-model-distribution'},
  },
  {
    topic: 'Kubernetes',
    points: [
      'CrashLoopBackOff means the container starts and exits repeatedly — read the exit code and prior logs (`kubectl logs --previous`), never just the current state.',
      'PVC stuck Pending is almost always a StorageClass/provisioner mismatch or a zone-affinity conflict, not a capacity problem.',
      'A node reporting Ready in `kubectl get nodes` only reflects the kubelet-to-API heartbeat — it says nothing about leaked kernel-level cgroups/namespaces still holding resources.',
    ],
    volumeLink: {label: 'Volume 1, Chapter 5', to: '/curriculum/volume-01/chapter-5-namespaces-cgroups-and-container-mechanics'},
  },
  {
    topic: 'Bare-metal / BCM / provisioning',
    points: [
      'Node categories, not individual nodes, should be the unit of configuration truth — a hand-edited node is a defect to reconcile, not a valid state.',
      'A canary wave must cover every hardware/firmware sub-variant in a category, not just a percentage of nodes, or a fleet-wide push can pass canary and still break a sub-variant.',
    ],
    volumeLink: {label: 'Volume 10, Chapter 2', to: '/curriculum/volume-10/chapter-2-nvidia-base-command-manager'},
  },
  {
    topic: 'CI/CD & change management',
    points: [
      'An emergency-override path around a destructive-change gate must still be logged and rare — if it becomes the normal way around deadline pressure, the gate has effectively stopped existing.',
      'A rollback plan is only real if it has been executed at least once outside a real incident — an untested rollback is a hypothesis, not a plan.',
    ],
    volumeLink: {label: 'Volume 10, Chapter 10', to: '/curriculum/volume-10/chapter-10-coordinated-cluster-wide-software-change-management'},
  },
];

export default function InterviewPrepAug5() {
  const troubleshootingItems = troubleshootingPicks.map((id) => troubleshootingScenarios.find((s) => s.id === id)).filter(Boolean);
  const architectureItems = architecturePicks.map((id) => architectureScenarios.find((s) => s.id === id)).filter(Boolean);

  const quizPrompt = `I have a senior NVIDIA Solutions Architect / DevOps interview on August 5. Quiz me rapid-fire, one question at a time, across these topics in random order: Linux/systems fundamentals, networking, GPU/CUDA, AI/ML workload classification, HPC/Slurm/MPI, storage for AI (Lustre/GPFS/ZFS), Kubernetes, bare-metal/BCM provisioning, and CI/CD/change management for a GPU fleet.

Rules: ask one question, wait for my answer, then immediately tell me if I'm right and give the one-sentence correct answer if I'm wrong or incomplete — do not move to the next question until you've done this. Mix easy recall questions with a few "explain the failure mode" scenario questions. Keep going until I say stop.`;

  return <Layout title="Interview prep — Aug 5" description="Temporary condensed review sheet for the August 5 interview">
    <main className="pageShell narrow">
      <header className="pageHeader">
        <span className="eyebrow">Temporary review sheet · delete after Aug 5</span>
        <h1>Final review — Aug 5 interview</h1>
        <p>One page: fundamentals cheat sheet, then a curated set of architecture and troubleshooting scenarios worth re-reading the night before. Every item links back to its full page or chapter — this page is a map, not a replacement.</p>
      </header>

      <section>
        <h2>Fundamentals, one screen</h2>
        {fundamentals.map((block) => <article key={block.topic} className="questionPanel" style={{marginBottom: '1rem'}}>
          <h3>{block.topic} <small>· <Link to={block.volumeLink.to}>{block.volumeLink.label} ↗</Link></small></h3>
          <ul>{block.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </article>)}
      </section>

      <section>
        <h2>Architecture scenarios to re-read</h2>
        <p>Full interactive versions with trade-offs, failure modes and follow-ups are on the <Link to="/architecture">Architecture lab</Link>.</p>
        {architectureItems.map((item) => <article key={item.id} className="questionPanel" style={{marginBottom: '1rem'}}>
          <h3>{item.title} <small>· {item.category}</small></h3>
          <p>{item.brief}</p>
          <p><strong>First two decisions:</strong> {item.answerOutline.slice(0, 2).map((s) => s.label).join(' → ')}</p>
          <p><strong>Biggest trade-off:</strong> {item.tradeoffs[0]?.decision} — {item.tradeoffs[0]?.recommendation}</p>
        </article>)}
      </section>

      <section>
        <h2>Troubleshooting scenarios to re-read</h2>
        <p>Full evidence-chain walkthroughs are on the <Link to="/troubleshooting">Troubleshooting simulator</Link>.</p>
        {troubleshootingItems.map((item) => <article key={item.id} className="questionPanel" style={{marginBottom: '1rem'}}>
          <h3>{item.title} <small>· {item.category}</small></h3>
          <p><strong>Root cause:</strong> {item.expectedRootCause}</p>
          <p><strong>Fix:</strong> {item.mitigation}</p>
        </article>)}
      </section>

      <section className="chatgptCoachPanel">
        <div><span className="eyebrow">Last-minute drill</span><h3>Rapid-fire quiz across everything above</h3><p>One question at a time, instant grading, keeps going until you stop it.</p></div>
        <details><summary>Preview prompt</summary><pre className="promptPreview">{quizPrompt}</pre></details>
        <ChatGPTStudyLink prompt={quizPrompt} label="Start rapid-fire quiz ↗"/>
      </section>
    </main>
  </Layout>;
}
