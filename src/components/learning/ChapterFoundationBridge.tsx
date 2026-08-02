import React from 'react';
import Link from '@docusaurus/Link';
import {chapterStudyContexts} from '@site/src/data/chapterStudyContexts';
import {getChapterFoundationBridge} from '@site/src/data/chapterFoundationBridges';

const integratedFoundationHeading = /^foundations(?:\s*:|\b)/i;

const volumeFoundations: Record<string, {to: string; label: string}> = {
  'volume-01': {to: '/curriculum/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load#foundations-start-here-if-this-is-new-to-you', label: 'Study the integrated Linux foundation'},
  'volume-02': {to: '/curriculum/volume-02/chapter-1-how-python-actually-executes-your-infrastructure-script#foundations-start-here-if-python-syntax-isnt-yet-comfortable', label: 'Study the integrated Python foundation'},
  'volume-03': {to: '/curriculum/volume-03/chapter-1-api-server-etcd-and-the-object-model#foundations-start-here-if-kubernetes-concepts-are-new-to-you', label: 'Study the integrated Kubernetes foundation'},
  'volume-04': {to: '/curriculum/volume-04/chapter-1-gpu-execution-and-memory-mental-model#foundations-start-here-if-gpucuda-concepts-are-new-to-you', label: 'Study GPU computing from first principles'},
  'volume-05': {to: '/curriculum/volume-05/chapter-1-classify-the-ai-workload-before-designing-infrastructure#foundations-start-here-if-aiml-concepts-are-new-to-you', label: 'Study AI and LLM workloads from zero'},
  'volume-06': {to: '/curriculum/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs#foundations-start-here-if-hpc-concepts-are-new-to-you', label: 'Study the integrated HPC foundation'},
  'volume-07': {to: '/curriculum/volume-07/chapter-1-metrics-logs-and-traces-as-different-evidence#foundations-start-here-if-observability-and-reliability-are-new-to-you', label: 'Study the integrated reliability foundation'},
  'volume-08': {to: '/curriculum/volume-08/chapter-1-discovery-that-changes-the-architecture#foundations-start-here-if-solutions-architecture-is-new-to-you', label: 'Study the integrated Solutions Architecture foundation'},
  'volume-09': {to: '/curriculum/volume-09/chapter-1-the-answer-framework-expose-your-reasoning#foundations-start-here-before-using-the-interview-question-bank', label: 'Learn how to use interview practice'},
  'volume-10': {to: '/curriculum/volume-10/chapter-1-bare-metal-and-bmc-lifecycle#foundations-start-here-if-the-bare-metal-hpc-stack-is-new-to-you', label: 'Study the integrated operations foundation'},
};

export default function ChapterFoundationBridge({title, route}: {title: string; route: string}) {
  const context = chapterStudyContexts[title];
  const alreadyCovered = context?.sections?.some((section) => integratedFoundationHeading.test(section));
  if (alreadyCovered) return null;

  const bridge = getChapterFoundationBridge(title, route);
  if (!bridge) return null;
  const volume = route.match(/volume-\d{2}/)?.[0];
  const foundation = volume === 'volume-10' && /ansible|terraform|infrastructure.as.code|ci\/cd/i.test(title)
    ? {to: '/curriculum/volume-10/chapter-4-ansible-for-infrastructure-automation#foundations-start-here-if-infrastructure-as-code-is-new-to-you', label: 'Study IaC, Terraform and Ansible from zero'}
    : volume ? volumeFoundations[volume] : undefined;

  return <aside className="chapterFoundationBridge" aria-label="Beginner foundation for this chapter">
    <span className="eyebrow">{bridge.label}</span>
    <h2>Prerequisite compass for this chapter</h2>
    <p><strong>The problem:</strong> {bridge.problem}</p>
    <p><strong>Normal path:</strong> {bridge.normalPath}</p>
    <p><strong>Terms to recognize first:</strong> {bridge.terms.join(' · ')}</p>
    <p className="foundationReassurance">This compass is not the lesson. If any term or arrow is unfamiliar, study the full foundation before continuing so the advanced material has a stable place to attach.</p>
    {foundation && <p><Link to={foundation.to}><strong>{foundation.label} →</strong></Link></p>}
  </aside>;
}
