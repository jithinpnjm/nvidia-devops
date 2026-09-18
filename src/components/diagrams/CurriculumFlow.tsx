import React from 'react';
import Link from '@docusaurus/Link';

const stages = [
  ['Linux + Python', '/curriculum/volume-01/linux-compute-memory-masterclass'],
  ['Kubernetes / Platform', '/curriculum/volume-03/k8s-control-plane-scheduling-masterclass'],
  ['GPU Infrastructure', '/curriculum/volume-04/gpu-architecture-topology-masterclass'],
  ['AI Workloads', '/curriculum/volume-05/ai-workloads-training-masterclass'],
  ['HPC / Network / Storage', '/curriculum/volume-06/ai-networking-rdma-masterclass'],
  ['Observability', '/curriculum/volume-07/metrics-logs-traces-masterclass'],
  ['Solutions Architecture', '/curriculum/volume-08/architecture-design-masterclass'],
  ['Interview Readiness', '/curriculum/volume-09/01-hardware-ecosystem-gauntlet'],
];
export default function CurriculumFlow() { return <div className="curriculumFlow">{stages.map(([label, href], index) => <React.Fragment key={label}><Link to={href}>{label}</Link>{index < stages.length - 1 && <span aria-hidden="true">↓</span>}</React.Fragment>)}</div>; }
