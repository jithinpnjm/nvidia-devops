import React from 'react';
import Link from '@docusaurus/Link';
import {chapterStudyContexts} from '@site/src/data/chapterStudyContexts';
import {getChapterFoundationBridge} from '@site/src/data/chapterFoundationBridges';

const foundationHeading = /foundation|start here|before you start|before this deep dive|what .* is|beginner/i;

const volumeFoundations: Record<string, {to: string; label: string}> = {
  'volume-01': {to: '/curriculum/volume-01/foundation-what-linux-is', label: 'Study the complete Linux foundation'},
  'volume-02': {to: '/curriculum/volume-02/foundation-what-python-is', label: 'Study the complete Python foundation'},
  'volume-03': {to: '/curriculum/volume-03/foundation-what-kubernetes-is', label: 'Study the complete Kubernetes foundation'},
  'volume-04': {to: '/curriculum/volume-04/foundation-what-gpu-computing-is', label: 'Study GPU computing from first principles'},
  'volume-05': {to: '/curriculum/volume-05/foundation-what-ai-workloads-are', label: 'Study AI and LLM workloads from zero'},
  'volume-06': {to: '/curriculum/volume-06/foundation-what-hpc-infrastructure-is', label: 'Study the complete HPC foundation'},
  'volume-07': {to: '/curriculum/volume-07/foundation-observability-and-reliability', label: 'Study the complete reliability foundation'},
  'volume-08': {to: '/curriculum/volume-08/foundation-solutions-architecture', label: 'Study the Solutions Architecture foundation'},
  'volume-09': {to: '/curriculum/volume-09/foundation-interview-practice', label: 'Learn how to use interview practice'},
  'volume-10': {to: '/curriculum/volume-10/foundation-bare-metal-hpc-operations', label: 'Study the integrated operations foundation'},
};

export default function ChapterFoundationBridge({title, route}: {title: string; route: string}) {
  const context = chapterStudyContexts[title];
  const alreadyCovered = context?.sections?.some((section) => foundationHeading.test(section));
  if (alreadyCovered) return null;

  const bridge = getChapterFoundationBridge(title, route);
  if (!bridge) return null;
  const volume = route.match(/volume-\d{2}/)?.[0];
  const foundation = volume === 'volume-10' && /ansible|terraform|infrastructure.as.code|ci\/cd/i.test(title)
    ? {to: '/curriculum/volume-10/foundation-iac-terraform-ansible', label: 'Study IaC, Terraform and Ansible from zero'}
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
