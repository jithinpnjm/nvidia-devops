import React from 'react';
import Link from '@docusaurus/Link';

type Stage = {
  label: string;
  summary: string;
  action?: string;
};

const FOUNDATIONS_CHAPTERS = [
  '/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load',
  '/volume-01/chapter-3-files-file-descriptors-filesystems-and-block-i-o',
  '/volume-01/chapter-4-networking-ip-routes-sockets-tcp-dns-nat-and-tls',
  '/volume-02/chapter-1-how-python-actually-executes-your-infrastructure-script',
  '/volume-03/chapter-1-api-server-etcd-and-the-object-model',
  '/volume-04/chapter-1-gpu-execution-and-memory-mental-model',
  '/volume-05/chapter-1-classify-the-ai-workload-before-designing-infrastructure',
  '/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs',
  '/volume-10/chapter-3-os-provisioning-and-linux-security-hardening',
];

function stageFor(title: string, route: string): Stage {
  const normalized = title.toLowerCase();

  if (FOUNDATIONS_CHAPTERS.some((path) => route.includes(path))) {
    return {
      label: 'Start with the normal path',
      summary: 'The chapter defines the vocabulary and healthy path first, then uses the same page for operations, failure analysis, and design trade-offs.',
      action: 'If this domain is already familiar, skim the opening definitions and start at the first exercise.',
    };
  }

  if (route.includes('/senior-deep-dive-')) {
    return {
      label: 'Depth chapter',
      summary: 'Use this after the matching normal-path chapter. It assumes you can already draw and observe the healthy path, then adds scale, failure boundaries, and trade-offs.',
      action: 'If a term feels unstable, return to the earlier chapter in the same volume and rerun its observation exercise.',
    };
  }

  if (route.includes('/volume-09/')) {
    return {
      label: 'Assessment and interview practice',
      summary: 'This tests knowledge learned elsewhere; it is not the first explanation of the underlying technology.',
      action: 'Use each weak answer to route back to its core chapter and hands-on observation.',
    };
  }

  if (route.includes('/volume-10/')) {
    return {
      label: 'Integrated operations',
      summary: 'This chapter combines several layers. Use its beginner bridge, then revisit the linked foundation volume for any unfamiliar layer.',
    };
  }

  return {
    label: 'Core learning chapter',
    summary: 'First learn the problem, essential vocabulary, and normal path; then observe it before attempting senior scenarios.',
  };
}

export default function LearningStagePanel({title, route}: {title: string; route: string}) {
  const stage = stageFor(title, route);

  return <aside className="learningStagePanel" aria-label="Learning stage">
    <div>
      <span className="eyebrow">{stage.label}</span>
      <p>{stage.summary}</p>
      {stage.action && <p className="learningStageAction">{stage.action}</p>}
    </div>
    <Link to="/curriculum/intro/master-index">View curriculum map →</Link>
  </aside>;
}
