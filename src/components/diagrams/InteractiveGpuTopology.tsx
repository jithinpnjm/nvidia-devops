import React, {useState} from 'react';
import Link from '@docusaurus/Link';

const nodes = [
  {id: 'cpu', label: 'CPU / NUMA', x: 20, y: 30, href: '/curriculum/volume-01/senior-deep-dive-2-memory-virtual-address-space-page-faults-numa-and-oom-decisions'},
  {id: 'pcie', label: 'PCIe switch', x: 210, y: 30, href: '/curriculum/volume-04/chapter-2-pcie-nvlink-and-topology'},
  {id: 'gpu', label: 'GPU', x: 400, y: 10, href: '/curriculum/volume-04/chapter-1-gpu-execution-and-memory-mental-model'},
  {id: 'nvlink', label: 'NVLink', x: 400, y: 100, href: '/curriculum/volume-04/chapter-2-pcie-nvlink-and-topology'},
  {id: 'nic', label: 'NIC / RDMA', x: 210, y: 140, href: '/curriculum/volume-06/chapter-3-rdma-roce-and-infiniband'},
];
export default function InteractiveGpuTopology() {
  const [selected, setSelected] = useState(nodes[2]);
  return <div className="topology"><svg viewBox="0 0 560 210" role="img" aria-label="Interactive CPU, PCIe, GPU, NVLink and NIC topology">
    <path d="M140 55H210M330 55H400M270 80V140M470 65V100" className="topologyLink"/>
    {nodes.map((node) => <g key={node.id} onClick={() => setSelected(node)} onKeyDown={(e) => e.key === 'Enter' && setSelected(node)} role="button" tabIndex={0}>
      <rect x={node.x} y={node.y} width="140" height="54" rx="6" className={selected.id === node.id ? 'selected' : ''}/>
      <text x={node.x + 70} y={node.y + 32} textAnchor="middle">{node.label}</text>
    </g>)}
  </svg><p><strong>{selected.label}</strong> is selected. <Link to={selected.href}>Open its curriculum lesson →</Link></p></div>;
}
