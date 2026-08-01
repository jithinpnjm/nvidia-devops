import React, {useState} from 'react';
import Layout from '@theme/Layout';
import {scenarios} from '@site/src/data/troubleshooting';
import {progressStore} from '@site/src/components/learning/progressStore';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

export default function Troubleshooting() {
  const categories = ['All'].concat(Array.from(new Set(scenarios.map((s) => s.category))));
  const [category, setCategory] = useState('All');
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [answer, setAnswer] = useState(false);
  const [hypothesis, setHypothesis] = useState('');
  const visibleScenarios = category === 'All' ? scenarios : scenarios.filter((item) => item.category === category);
  const scenario = scenarios.find((item) => item.id === selectedId)!;
  const tutorPrompt = `Act as my senior SRE, Kubernetes, Linux, GPU, networking, and AI-infrastructure incident mentor. Run an interactive incident review for this scenario.

Scenario: ${scenario.title}
Symptom: ${scenario.description}
My current hypothesis: ${hypothesis || 'not stated yet'}
Academy leading mechanism: ${scenario.expectedRootCause}

Start by asking me to state blast radius, impact, recent change, and two competing hypotheses. Then give evidence in small stages and wait for my next decision. Require me to name the exact command/metric and how its result separates hypotheses. After I try, give a complete senior-quality answer: safe containment, commands with representative—but clearly labelled hypothetical—outputs, root cause, least-destructive mitigation, validation, rollback, prevention, and an escalation packet. Cover workload, Kubernetes control plane, node/Linux, GPU/driver, storage, network/fabric, and observability angles only when relevant. Do not invent facts; identify assumptions and safety boundaries.`;
  const drillPrompt = `Act as a live incident-response drilling partner running a Socratic tabletop exercise for exactly one scenario. Do not reveal anything until I ask for it, and never dump the full solution at once.

SCENARIO (for your reference only, not to be recited back to me up front)
- Title: ${scenario.title}
- Category: ${scenario.category}
- Symptom: ${scenario.description}
- Real root cause you know but I do not yet: ${scenario.expectedRootCause}
- Real mitigation: ${scenario.mitigation}
- Real prevention: ${scenario.prevention}

HOW TO RUN THIS DRILL
1. Open by giving me only the symptom above, then ask me guiding questions: what is the blast radius, what changed recently, what are my two or three competing hypotheses, and what is the single most information-dense check I would run first.
2. Do not volunteer evidence. When I ask for a specific piece of evidence (a command, a log, a metric), give me one small, realistic, plausible chunk of simulated output at a time — mirroring a step-by-step reveal, not the whole picture.
3. Only confirm or deny my working hypothesis when I explicitly ask you to check it against the evidence so far — otherwise stay neutral and keep asking questions.
4. If I propose a mitigation before I have enough evidence, push back and ask what evidence would justify it being safe and reversible.
5. When I state a final diagnosis, grade it against the real root cause, mitigation, and prevention above: tell me exactly what I got right, what I missed, and what a senior engineer would have checked that I did not.
6. Close by asking me two harder follow-up variations of this same failure class — situations where the surface symptom looks identical but the underlying mechanism differs — and drill me on how I would tell them apart before touching anything.

Do not invent facts beyond what is stated above; if I ask something the scenario does not specify, tell me to state an assumption and move on.`;
  const choose = (id: string) => { setSelectedId(id); setRevealed([]); setAnswer(false); setHypothesis(''); };
  const reveal = (index: number) => setRevealed((current) => current.includes(index) ? current : [...current, index]);
  return <Layout title="Senior troubleshooting simulator" description="Evidence-driven production incident practice">
    <main className="pageShell"><header className="pageHeader"><span className="eyebrow">Operations lab</span><h1>Senior troubleshooting simulator</h1><p>{scenarios.length} production scenarios spanning every volume: Python automation, Linux, Kubernetes, GPU operations, distributed training, networking, storage, observability, inference, bare-metal/BCM, IaC, Slurm/HPC, security, and coordinated change management.</p></header>
      <div className="prompt"><strong>Senior operating rule:</strong> scope the blast radius and recent change, rank two or three mechanisms, choose evidence that separates them, then make the smallest reversible mitigation. A command is useful only when you can say what result would change your next action.</div>
      <div className="filterRow">{categories.map((item) => <button className={category === item ? 'active' : 'secondary'} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="simulatorLayout"><aside className="scenarioList">{visibleScenarios.map((item) => <button className={item.id === selectedId ? 'active' : ''} onClick={() => choose(item.id)} key={item.id}>{item.title}</button>)}</aside>
        <section className="simulatorPanel"><span className="eyebrow">Symptom</span><h2>{scenario.title}</h2><p>{scenario.description}</p>
          <section className="chatgptCoachPanel"><div><span className="eyebrow">Interactive ChatGPT incident commander</span><h3>Investigate this exact scenario in ChatGPT</h3><p>The prompt carries the symptom and your current hypothesis, then forces evidence-led diagnosis across every relevant layer before revealing a complete runbook.</p></div><details><summary>Preview the incident-specific prompt</summary><pre className="promptPreview">{tutorPrompt}</pre></details><ChatGPTStudyLink prompt={tutorPrompt} label="Open this incident in ChatGPT ↗"/></section>
          <div className="threeColumns incidentFrames"><section><strong>Contain first</strong><p>{scenario.runbook.containment}</p></section><section><strong>Objective</strong><ul>{scenario.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section><section><strong>Escalate with</strong><p>{scenario.runbook.escalation}</p></section></div>
          <label><strong>Your current hypothesis</strong><textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="State a falsifiable mechanism, predicted evidence, and the safe first action…"/></label>
          <h3>Command-led evidence plan</h3><div className="commandGrid">{scenario.runbook.commands.map((item) => <article className="commandCard" key={item.label}><strong>{item.label}</strong><pre><code>{item.command}</code></pre><p>{item.why}</p></article>)}</div>
          <h3>Reveal the investigation in order</h3><div className="evidenceGrid">{scenario.evidence.map((step, index) => <div className="evidence" key={step.action}><button disabled={revealed.includes(index)} onClick={() => reveal(index)}>{revealed.includes(index) ? 'Evidence revealed' : `${index + 1}. ${step.action}`}</button>{revealed.includes(index) && <><pre>{step.output}</pre><p><strong>Meaning:</strong> {step.interpretation}</p></>}</div>)}</div>
          <div className="buttonRow"><button disabled={revealed.length < 2} onClick={() => { setAnswer((visible) => { if (!visible) progressStore.add('troubleshootingCompleted', scenario.id); return !visible; }); }}>{answer ? 'Hide diagnosis' : 'Reveal diagnosis and runbook outcome'}</button></div>
          {answer && <div className="diagnosis"><h3>Most likely mechanism</h3><p>{scenario.expectedRootCause}</p><h3>Safe mitigation</h3><p>{scenario.mitigation}</p><h3>Prevention / detection</h3><p>{scenario.prevention}</p><p><strong>Interview close:</strong> “I would validate the original user-visible symptom after the mitigation, record the evidence and rollback point, then turn the confirmed mechanism into a guardrail.”</p></div>}
          <section className="chatgptCoachPanel"><div><span className="eyebrow">Live drilling partner</span><h3>Run this exact incident as a Socratic drill in ChatGPT</h3><p>ChatGPT plays incident-response partner for “{scenario.title}”: it asks guiding questions, hands over evidence only when you ask, and grades your final diagnosis against the real mechanism, mitigation, and prevention — then drills you on two harder variations of the same failure class.</p></div><details><summary>Preview the drilling prompt</summary><pre className="promptPreview">{drillPrompt}</pre></details><ChatGPTStudyLink prompt={drillPrompt} label="Drill this scenario in ChatGPT ↗"/></section>
        </section>
      </div>
      <section className="sectionTitle"><span className="eyebrow">Primary references</span><h2>Use the documentation behind the simulator</h2><div className="resourceGrid"><article className="resourceCard"><h3>Kubernetes application debugging</h3><p>Pods, services, StatefulSets, termination messages, init containers, and running-container debugging.</p><a href="https://kubernetes.io/docs/tasks/debug/debug-application/">Kubernetes documentation →</a></article><article className="resourceCard"><h3>NVIDIA GPU Operator troubleshooting</h3><p>Driver, toolkit, device-plugin, NVML, validator, Xid, MIG, and must-gather workflows.</p><a href="https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/troubleshooting.html">NVIDIA documentation →</a></article><article className="resourceCard"><h3>NCCL networking diagnostics</h3><p>Interface selection, InfiniBand/RoCE link health, counters, connectivity, and tuning boundaries.</p><a href="https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/networking_troubleshooting.html">NVIDIA NCCL guide →</a></article></div></section>
    </main>
  </Layout>;
}
