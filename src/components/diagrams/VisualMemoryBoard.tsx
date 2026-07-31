import React, {useState} from 'react';

type Diagram = {
  id: string;
  label: string;
  memoryHook: string;
  takeaway: string;
  nodes: {label: string; x: number; y: number; tone?: 'accent' | 'warning'}[];
  edges: [number, number][];
};

const diagrams: Diagram[] = [
  {
    id: 'serving',
    label: 'LLM token journey',
    memoryHook: 'First token waits; later tokens repeat.',
    takeaway: 'TTFT accumulates queueing and prefill work. Decode repeats for every generated token, and the KV cache is the state worth preserving.',
    nodes: [
      {label: 'Request', x: 20, y: 95}, {label: 'Queue', x: 160, y: 95, tone: 'warning'},
      {label: 'Prefill', x: 300, y: 95, tone: 'accent'}, {label: 'KV cache', x: 440, y: 35, tone: 'accent'},
      {label: 'Decode', x: 440, y: 155, tone: 'accent'}, {label: 'Stream', x: 580, y: 155},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes desired state',
    memoryHook: 'Declare, observe, reconcile, repeat.',
    takeaway: 'Kubernetes stores desired state, controllers observe the gap, and the kubelet/CRI make node-local work real. Status feeds the next reconciliation loop.',
    nodes: [
      {label: 'Desired object', x: 20, y: 95}, {label: 'API / etcd', x: 170, y: 95, tone: 'accent'},
      {label: 'Controller', x: 320, y: 95, tone: 'accent'}, {label: 'Kubelet / CRI', x: 470, y: 35},
      {label: 'Running Pod', x: 470, y: 155}, {label: 'Observed status', x: 620, y: 95, tone: 'warning'},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 1]],
  },
  {
    id: 'gpu',
    label: 'GPU data-motion map',
    memoryHook: 'Topology decides whether bytes take the short path.',
    takeaway: 'The fast path keeps traffic close to its GPU, NIC and PCIe root complex. Cross-NUMA or CPU bounce paths add latency and reduce effective bandwidth.',
    nodes: [
      {label: 'CPU / NUMA', x: 20, y: 95}, {label: 'PCIe root', x: 170, y: 95},
      {label: 'GPU HBM', x: 320, y: 35, tone: 'accent'}, {label: 'NIC / RDMA', x: 320, y: 155, tone: 'accent'},
      {label: 'Fabric', x: 470, y: 155}, {label: 'Remote GPU', x: 620, y: 155, tone: 'accent'},
    ],
    edges: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5]],
  },
  {
    id: 'incident',
    label: 'Incident evidence loop',
    memoryHook: 'Impact before action; evidence before certainty.',
    takeaway: 'Start with user impact and scope, then correlate signals, state a falsifiable hypothesis, choose the safest mitigation, and record what changes next time.',
    nodes: [
      {label: 'Impact + scope', x: 20, y: 95, tone: 'warning'}, {label: 'Signals', x: 170, y: 95},
      {label: 'Hypothesis', x: 320, y: 95, tone: 'accent'}, {label: 'Safe mitigation', x: 470, y: 95, tone: 'accent'},
      {label: 'Verify + learn', x: 620, y: 95},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]],
  },
  {
    id: 'gpu-stack',
    label: 'GPU software dependency stack',
    memoryHook: 'Nothing above the driver is trustworthy until the driver is Ready.',
    takeaway: 'Host driver, CUDA toolkit, container runtime and device plugin form a strict readiness chain; DCGM telemetry only reports truthfully once every layer beneath it is healthy.',
    nodes: [
      {label: 'Host driver', x: 20, y: 95, tone: 'warning'}, {label: 'CUDA toolkit', x: 170, y: 95},
      {label: 'Container runtime', x: 320, y: 95}, {label: 'Device plugin', x: 470, y: 95, tone: 'accent'},
      {label: 'Workload', x: 620, y: 35}, {label: 'DCGM telemetry', x: 620, y: 155, tone: 'accent'},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5]],
  },
  {
    id: 'mig-decision',
    label: 'GPU sharing decision',
    memoryHook: 'Isolation and efficiency trade against each other — pick by workload fit, not habit.',
    takeaway: 'MIG gives hardware-level isolation at fixed granularity; time-slicing and MPS trade isolation for density; vGPU adds VM-level boundaries. Match the option to the tenancy and blast-radius requirement, then validate with the real workload.',
    nodes: [
      {label: 'Isolation need?', x: 20, y: 100, tone: 'warning'}, {label: 'MIG', x: 240, y: 5, tone: 'accent'},
      {label: 'Time slicing', x: 240, y: 68}, {label: 'MPS', x: 240, y: 131},
      {label: 'vGPU', x: 240, y: 194}, {label: 'Match to workload', x: 520, y: 100, tone: 'accent'},
    ],
    edges: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 5], [3, 5], [4, 5]],
  },
  {
    id: 'ai-factory',
    label: 'AI factory layered architecture',
    memoryHook: 'Observability and security cut across every layer — they are not one more layer.',
    takeaway: 'Users and APIs sit above platform control, which schedules the compute fabric and its storage/data dependencies. Observability and security instrument the platform and compute layers directly rather than sitting only at the top.',
    nodes: [
      {label: 'Users / APIs', x: 20, y: 95}, {label: 'Platform control', x: 200, y: 95, tone: 'accent'},
      {label: 'Compute fabric', x: 380, y: 95, tone: 'accent'}, {label: 'Storage / data', x: 560, y: 95},
      {label: 'Observability + security', x: 290, y: 195, tone: 'warning'},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [1, 4], [2, 4]],
  },
  {
    id: 'rail-fabric',
    label: 'RDMA rail-optimized fabric',
    memoryHook: 'Same-rail is one hop; cross-rail pays for the spine.',
    takeaway: 'Keeping a collective within one GPU/NIC rail and leaf switch avoids the extra spine hop. A job that spans rails without topology-aware placement pays for bandwidth it never needed to spend.',
    nodes: [
      {label: 'GPU (rail A)', x: 20, y: 35}, {label: 'NIC (rail A)', x: 190, y: 35},
      {label: 'Leaf A', x: 360, y: 35, tone: 'accent'}, {label: 'Spine', x: 530, y: 115, tone: 'warning'},
      {label: 'Leaf B', x: 360, y: 195, tone: 'accent'}, {label: 'NIC (rail B)', x: 190, y: 195},
      {label: 'GPU (rail B)', x: 20, y: 195},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  {
    id: 'telemetry-pipeline',
    label: 'GPU telemetry pipeline',
    memoryHook: 'A dashboard is only as honest as the exporter feeding it.',
    takeaway: 'NVML/DCGM readings pass through an exporter into Prometheus before any alert or dashboard sees them; a stalled exporter or scrape produces a falsely quiet board, not a real "healthy" signal.',
    nodes: [
      {label: 'GPU / NVML', x: 20, y: 95}, {label: 'DCGM', x: 170, y: 95, tone: 'accent'},
      {label: 'Exporter', x: 320, y: 95}, {label: 'Prometheus', x: 470, y: 95, tone: 'accent'},
      {label: 'Alert / dashboard', x: 620, y: 95, tone: 'warning'},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    id: 'sa-whiteboard',
    label: 'Solutions-architecture whiteboard template',
    memoryHook: 'Requirements and risks bookend the design — products come in the middle, not first.',
    takeaway: 'Start from requirements and explicit assumptions, work through data/control plane and security, then close on SLOs, cost and the risks still open. Naming the open risks is what separates a whiteboard answer from a product pitch.',
    nodes: [
      {label: 'Requirements', x: 10, y: 95, tone: 'warning'}, {label: 'Assumptions', x: 145, y: 95},
      {label: 'Data / control plane', x: 280, y: 95, tone: 'accent'}, {label: 'Security', x: 430, y: 95},
      {label: 'SLOs + cost', x: 560, y: 95, tone: 'accent'}, {label: 'Open risks', x: 655, y: 175, tone: 'warning'},
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
];

export default function VisualMemoryBoard() {
  const [selected, setSelected] = useState(diagrams[0]);
  return <section className="memoryBoard" aria-label="Interactive systems memory board">
    <div className="memoryBoardTabs" role="tablist" aria-label="Choose a systems model">
      {diagrams.map((diagram) => <button key={diagram.id} type="button" role="tab" aria-selected={selected.id === diagram.id} className={selected.id === diagram.id ? 'active' : 'secondary'} onClick={() => setSelected(diagram)}>{diagram.label}</button>)}
    </div>
    <div className="memoryBoardPanel" role="tabpanel">
      <p className="memoryHook">{selected.memoryHook}</p>
      <svg viewBox="0 0 780 255" role="img" aria-label={selected.label}>
        <defs><marker id="memory-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"/></marker></defs>
        {selected.edges.map(([from, to]) => {
          const source = selected.nodes[from]; const target = selected.nodes[to];
          const sourceX = source.x + 120; const sourceY = source.y + 28;
          const targetX = target.x; const targetY = target.y + 28;
          return <path key={`${from}-${to}`} d={`M${sourceX} ${sourceY} C${sourceX + 35} ${sourceY}, ${targetX - 35} ${targetY}, ${targetX} ${targetY}`} className="memoryEdge" markerEnd="url(#memory-arrow)"/>;
        })}
        {selected.nodes.map((node) => <g key={node.label} className={`memoryNode ${node.tone || ''}`}><rect x={node.x} y={node.y} width="120" height="56" rx="8"/><text x={node.x + 60} y={node.y + 33} textAnchor="middle">{node.label}</text></g>)}
      </svg>
      <p>{selected.takeaway}</p>
    </div>
  </section>;
}
