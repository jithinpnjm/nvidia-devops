import React from 'react';
import Link from '@docusaurus/Link';

const stages = [
  ['Linux + Python', '/curriculum/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load'],
  ['Kubernetes / Platform', '/curriculum/volume-03/chapter-1-api-server-etcd-and-the-object-model'],
  ['GPU Infrastructure', '/curriculum/volume-04/chapter-1-gpu-execution-and-memory-mental-model'],
  ['AI Workloads', '/curriculum/volume-05/chapter-1-classify-the-ai-workload-before-designing-infrastructure'],
  ['HPC / Network / Storage', '/curriculum/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs'],
  ['Observability', '/curriculum/volume-07/chapter-1-metrics-logs-and-traces-as-different-evidence'],
  ['Solutions Architecture', '/curriculum/volume-08/chapter-1-discovery-that-changes-the-architecture'],
  ['Interview Readiness', '/curriculum/volume-09/chapter-1-the-answer-framework-expose-your-reasoning'],
];
export default function CurriculumFlow() { return <div className="curriculumFlow">{stages.map(([label, href], index) => <React.Fragment key={label}><Link to={href}>{label}</Link>{index < stages.length - 1 && <span aria-hidden="true">↓</span>}</React.Fragment>)}</div>; }
