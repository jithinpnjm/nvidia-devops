import React, {useState} from 'react';
import Layout from '@theme/Layout';
import {architectureScenarios} from '@site/src/data/architecture';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

const categoryTag = (title: string): string => {
  const t = title.toLowerCase();
  if (t.includes('bare-metal') || t.includes('on-prem') || t.includes('greenfield')) return 'JR2018680: bare-metal/BCM buildout and lifecycle ownership.';
  if (t.includes('regulated') || t.includes('air-gapped')) return 'JR2018680: security hardening, change control and audit rigor.';
  if (t.includes('disaster-recovery') || t.includes('multi-region')) return 'JR2018680: HA/DR design across regions and failure domains.';
  if (t.includes('cost') || t.includes('tco')) return 'JR2018680: TCO/utilization judgment customers expect from an SA.';
  if (t.includes('firmware') || t.includes('upgrade program') || t.includes('coordinated')) return 'JR2018680: coordinated fleet-wide change management at scale.';
  if (t.includes('slurm') && t.includes('kubernetes')) return 'JR2018680: bridging HPC/Slurm and Kubernetes operating models.';
  if (t.includes('edge') || t.includes('disconnected')) return 'JR2018680: inference operations under constrained connectivity.';
  if (t.includes('m&a') || t.includes('consolidation')) return 'JR2018680: platform consolidation and organizational integration.';
  if (t.includes('inference') || t.includes('rag') || t.includes('latency')) return 'JR2018680: production inference architecture and SLOs.';
  if (t.includes('observability')) return 'JR2018680: fleet health, telemetry and incident readiness.';
  return 'JR2018680: core GPU platform architecture judgment.';
};

export default function Architecture() {
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [notes, setNotes] = useState('');
  const scenario = architectureScenarios[index];
  const panelistPrompt = `Act as a senior NVIDIA Solutions Architect panel interviewer running a live whiteboard-design interview with me.

SCENARIO
- Title: ${scenario.title}
- Requirements: ${scenario.requirements.join('; ')}
- Unknowns I must resolve: ${scenario.unknowns.join('; ')}
- Constraints: ${scenario.constraints.join('; ')}

RUN THE INTERVIEW LIKE A REAL PANEL
1. Do not explain the scenario back to me. First ask me to state my clarifying questions—one at a time is fine—and answer only what a customer would plausibly know; call out anything I fail to ask that a strong SA would ask.
2. Once I say I'm ready, ask me to propose my architecture end to end (compute, GPU selection, topology, network, storage, scheduler, multi-tenancy, security, observability, capacity, HA, cost, operations).
3. Probe my design with follow-up questions targeted specifically at the unknowns and constraints listed above—push on the weakest parts, ask me to justify trade-offs, and don't let vague answers pass.
4. Only reveal or compare against a "model" considerations list if I explicitly ask for it, or once I've clearly committed to a final design.
5. After that, pose one deliberately harder follow-up variant of this same scenario (for example: half the requested GPU SKU becomes unavailable for six months, a key region goes dark, or budget is cut by a third) and make me adapt my design live.
6. Keep the tone like a real interview panel: direct, technically skeptical, and focused on judgment and trade-offs rather than reciting facts.`;
  return <Layout title="Architecture lab"><main className="pageShell"><header className="pageHeader"><span className="eyebrow">Whiteboard practice</span><h1>Architecture lab</h1><p>Clarify requirements and draw data/control paths before choosing products.</p></header><div className="architectureTabs">{architectureScenarios.map((item, i) => <button className={i === index ? 'active' : 'secondary'} onClick={() => {setIndex(i); setReveal(false); setNotes('');}} key={item.title}>{item.title}</button>)}</div><article className="architectureBoard"><h2>{scenario.title}</h2><p className="eyebrow">{categoryTag(scenario.title)}</p><div className="threeColumns"><section><h3>Requirements</h3><ul>{scenario.requirements.map(x => <li key={x}>{x}</li>)}</ul></section><section><h3>Unknowns</h3><ul>{scenario.unknowns.map(x => <li key={x}>{x}</li>)}</ul></section><section><h3>Constraints</h3><ul>{scenario.constraints.map(x => <li key={x}>{x}</li>)}</ul></section></div><p className="prompt">Address compute, GPU selection, topology, network, storage, scheduler, multi-tenancy, security, observability, capacity, HA, cost, and operations.</p><textarea rows={12} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sketch components, data/control paths, failure domains, assumptions, and trade-offs…"/><section className="chatgptCoachPanel"><div><span className="eyebrow">Live whiteboard panelist</span><h3>Run this exact scenario as a mock panel interview in ChatGPT</h3><p>The prompt carries this scenario's requirements, unknowns and constraints, then forces a clarifying-questions-first, probe-then-reveal panel format, ending with a harder follow-up variant.</p></div><details><summary>Preview the prompt</summary><pre className="promptPreview">{panelistPrompt}</pre></details><ChatGPTStudyLink prompt={panelistPrompt} label="Open this scenario as a panel interview in ChatGPT ↗"/></section><button onClick={() => setReveal(!reveal)}>{reveal ? 'Hide considerations' : 'Reveal considerations'}</button>{reveal && <div className="reveal"><h3>Considerations—not a single ideal answer</h3><ul>{scenario.considerations.map(x => <li key={x}>{x}</li>)}</ul></div>}</article></main></Layout>;
}
