import React from 'react';
import Link from '@docusaurus/Link';
import {chapterStudyContexts} from '@site/src/data/chapterStudyContexts';
import {getChapterFoundationBridge} from '@site/src/data/chapterFoundationBridges';

const foundationHeading = /foundation|start here|before you start|before this deep dive|what .* is|beginner/i;

const volumeFoundations: Record<string, {to: string; label: string}> = {
  'volume-01': {to: '/curriculum/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load', label: 'Start with Chapter 1: Linux execution'},
  'volume-02': {to: '/curriculum/volume-02/chapter-1-how-python-actually-executes-your-infrastructure-script', label: 'Start with Chapter 1: Python basics and execution'},
  'volume-03': {to: '/curriculum/volume-03/chapter-1-api-server-etcd-and-the-object-model', label: 'Start with Chapter 1: Kubernetes objects and reconciliation'},
  'volume-04': {to: '/curriculum/volume-04/chapter-1-gpu-execution-and-memory-mental-model', label: 'Start with Chapter 1: GPU computing and NVIDIA layers'},
  'volume-05': {to: '/curriculum/volume-05/chapter-1-classify-the-ai-workload-before-designing-infrastructure', label: 'Start with Chapter 1: AI workload types'},
  'volume-06': {to: '/curriculum/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs', label: 'Start with Chapter 1: distributed GPU jobs'},
  'volume-07': {to: '/curriculum/volume-07/chapter-1-metrics-logs-and-traces-as-different-evidence', label: 'Start with Chapter 1: reliability evidence'},
  'volume-08': {to: '/curriculum/volume-08/chapter-1-discovery-that-changes-the-architecture', label: 'Start with Chapter 1: discovery and requirements'},
  'volume-09': {to: '/curriculum/volume-09/chapter-1-the-answer-framework-expose-your-reasoning', label: 'Start with Chapter 1: answer reasoning'},
  'volume-10': {to: '/curriculum/volume-10/chapter-1-bare-metal-and-bmc-lifecycle', label: 'Start with Chapter 1: bare-metal lifecycle'},
};

export default function ChapterFoundationBridge({title, route}: {title: string; route: string}) {
  const context = chapterStudyContexts[title];
  const alreadyCovered = context?.sections?.some((section) => foundationHeading.test(section));
  if (alreadyCovered) return null;

  const bridge = getChapterFoundationBridge(title, route);
  if (!bridge) return null;
  const volume = route.match(/volume-\d{2}/)?.[0];
  const foundation = volume === 'volume-10' && /ansible|terraform|infrastructure.as.code|ci\/cd/i.test(title)
    ? {to: '/curriculum/volume-10/chapter-4-ansible-for-infrastructure-automation', label: 'Start with Ansible in Chapter 4, then Terraform in Chapter 5'}
    : volume ? volumeFoundations[volume] : undefined;

  return <aside className="chapterFoundationBridge" aria-label="Beginner foundation for this chapter">
    <span className="eyebrow">{bridge.label}</span>
    <h2>Prerequisite compass for this chapter</h2>
    <p><strong>The problem:</strong> {bridge.problem}</p>
    <p><strong>Normal path:</strong> {bridge.normalPath}</p>
    <p><strong>Terms to recognize first:</strong> {bridge.terms.join(' · ')}</p>
    <p className="foundationReassurance">This compass is not the lesson. If any term or arrow is unfamiliar, return to the earlier numbered chapter that introduces it, then continue here.</p>
    {foundation && <p><Link to={foundation.to}><strong>{foundation.label} →</strong></Link></p>}
  </aside>;
}
