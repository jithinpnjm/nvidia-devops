import React, {useState} from 'react';
import Layout from '@theme/Layout';
import {scenarios} from '@site/src/data/troubleshooting';
import {progressStore} from '@site/src/components/learning/progressStore';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

export default function Troubleshooting() {
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [answer, setAnswer] = useState(false);
  const [hypothesis, setHypothesis] = useState('');
  const scenario = scenarios.find((item) => item.id === selectedId)!;
  const tutorPrompt = `Act as my senior SRE, Kubernetes, Linux, GPU, networking, and AI-infrastructure incident mentor. Run an interactive incident review for this scenario.

Scenario: ${scenario.title}
Symptom: ${scenario.description}
My current hypothesis: ${hypothesis || 'not stated yet'}
Academy leading mechanism: ${scenario.expectedRootCause}

Start by asking me to state blast radius, impact, recent change, and two competing hypotheses. Then give evidence in small stages and wait for my next decision. Require me to name the exact command/metric and how its result separates hypotheses. After I try, give a complete senior-quality answer: safe containment, commands with representative—but clearly labelled hypothetical—outputs, root cause, least-destructive mitigation, validation, rollback, prevention, and an escalation packet. Cover workload, Kubernetes control plane, node/Linux, GPU/driver, storage, network/fabric, and observability angles only when relevant. Do not invent facts; identify assumptions and safety boundaries.`;
  const choose = (id: string) => { setSelectedId(id); setRevealed([]); setAnswer(false); setHypothesis(''); };
  const reveal = (index: number) => setRevealed((current) => current.includes(index) ? current : [...current, index]);
  return <Layout title="Senior troubleshooting simulator" description="Evidence-driven production incident practice">
    <main className="pageShell"><header className="pageHeader"><span className="eyebrow">Operations lab</span><h1>Senior troubleshooting simulator</h1><p>{scenarios.length} production scenarios spanning every volume: Python automation, Linux, Kubernetes, GPU operations, distributed training, networking, storage, observability, inference, and architecture decisions.</p></header>
      <div className="prompt"><strong>Senior operating rule:</strong> scope the blast radius and recent change, rank two or three mechanisms, choose evidence that separates them, then make the smallest reversible mitigation. A command is useful only when you can say what result would change your next action.</div>
      <div className="simulatorLayout"><aside className="scenarioList">{scenarios.map((item) => <button className={item.id === selectedId ? 'active' : ''} onClick={() => choose(item.id)} key={item.id}>{item.title}</button>)}</aside>
        <section className="simulatorPanel"><span className="eyebrow">Symptom</span><h2>{scenario.title}</h2><p>{scenario.description}</p>
          <section className="chatgptCoachPanel"><div><span className="eyebrow">Interactive ChatGPT incident commander</span><h3>Investigate this exact scenario in ChatGPT</h3><p>The prompt carries the symptom and your current hypothesis, then forces evidence-led diagnosis across every relevant layer before revealing a complete runbook.</p></div><details><summary>Preview the incident-specific prompt</summary><pre className="promptPreview">{tutorPrompt}</pre></details><ChatGPTStudyLink prompt={tutorPrompt} label="Open this incident in ChatGPT ↗"/></section>
          <div className="threeColumns incidentFrames"><section><strong>Contain first</strong><p>{scenario.runbook.containment}</p></section><section><strong>Objective</strong><ul>{scenario.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section><section><strong>Escalate with</strong><p>{scenario.runbook.escalation}</p></section></div>
          <label><strong>Your current hypothesis</strong><textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="State a falsifiable mechanism, predicted evidence, and the safe first action…"/></label>
          <h3>Command-led evidence plan</h3><div className="commandGrid">{scenario.runbook.commands.map((item) => <article className="commandCard" key={item.label}><strong>{item.label}</strong><pre><code>{item.command}</code></pre><p>{item.why}</p></article>)}</div>
          <h3>Reveal the investigation in order</h3><div className="evidenceGrid">{scenario.evidence.map((step, index) => <div className="evidence" key={step.action}><button disabled={revealed.includes(index)} onClick={() => reveal(index)}>{revealed.includes(index) ? 'Evidence revealed' : `${index + 1}. ${step.action}`}</button>{revealed.includes(index) && <><pre>{step.output}</pre><p><strong>Meaning:</strong> {step.interpretation}</p></>}</div>)}</div>
          <div className="buttonRow"><button disabled={revealed.length < 2} onClick={() => { setAnswer((visible) => { if (!visible) progressStore.add('troubleshootingCompleted', scenario.id); return !visible; }); }}>{answer ? 'Hide diagnosis' : 'Reveal diagnosis and runbook outcome'}</button></div>
          {answer && <div className="diagnosis"><h3>Most likely mechanism</h3><p>{scenario.expectedRootCause}</p><h3>Safe mitigation</h3><p>{scenario.mitigation}</p><h3>Prevention / detection</h3><p>{scenario.prevention}</p><p><strong>Interview close:</strong> “I would validate the original user-visible symptom after the mitigation, record the evidence and rollback point, then turn the confirmed mechanism into a guardrail.”</p></div>}
        </section>
      </div>
      <section className="sectionTitle"><span className="eyebrow">Primary references</span><h2>Use the documentation behind the simulator</h2><div className="resourceGrid"><article className="resourceCard"><h3>Kubernetes application debugging</h3><p>Pods, services, StatefulSets, termination messages, init containers, and running-container debugging.</p><a href="https://kubernetes.io/docs/tasks/debug/debug-application/">Kubernetes documentation →</a></article><article className="resourceCard"><h3>NVIDIA GPU Operator troubleshooting</h3><p>Driver, toolkit, device-plugin, NVML, validator, Xid, MIG, and must-gather workflows.</p><a href="https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/troubleshooting.html">NVIDIA documentation →</a></article><article className="resourceCard"><h3>NCCL networking diagnostics</h3><p>Interface selection, InfiniBand/RoCE link health, counters, connectivity, and tuning boundaries.</p><a href="https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/networking_troubleshooting.html">NVIDIA NCCL guide →</a></article></div></section>
    </main>
  </Layout>;
}
