import React, {useState} from 'react';
import Layout from '@theme/Layout';
import Mermaid from '@theme/Mermaid';
import {scenarios} from '@site/src/data/troubleshooting';
import {troubleshootingLearning} from '@site/src/data/staffLearning';
import {progressStore} from '@site/src/components/learning/progressStore';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';
import StaffLearningPanel from '@site/src/components/learning/StaffLearningPanel';

const evidenceChainMermaid = (actions: string[]) => {
  const nodes = actions.map((action, index) => `e${index}["${index + 1}. ${action.replace(/"/g, "'")}"]`);
  const links = actions.slice(1).map((_, index) => `e${index} --> e${index + 1}`);
  return `flowchart LR\n  ${nodes.join('\n  ')}\n  ${links.join('\n  ')}`;
};

const interleaveByCategory = <T extends {category: string}>(items: T[]): T[] => {
  const byCategory = new Map<string, T[]>();
  items.forEach((item) => { const bucket = byCategory.get(item.category) ?? []; bucket.push(item); byCategory.set(item.category, bucket); });
  const buckets = Array.from(byCategory.values());
  const result: T[] = [];
  let index = 0;
  while (result.length < items.length) {
    buckets.forEach((bucket) => { if (bucket[index]) result.push(bucket[index]); });
    index += 1;
  }
  return result;
};

export default function Troubleshooting() {
  const categories = ['All'].concat(Array.from(new Set(scenarios.map((s) => s.category))));
  const [category, setCategory] = useState('All');
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [hypothesis, setHypothesis] = useState('');
  const visibleScenarios = category === 'All' ? interleaveByCategory(scenarios) : scenarios.filter((item) => item.category === category);
  const scenario = scenarios.find((item) => item.id === selectedId)!;
  const learning = troubleshootingLearning(scenario);
  const solutionSteps = [
    {label: 'Scope and contain', detail: scenario.runbook.containment},
    {label: 'Prove the mechanism', detail: scenario.expectedRootCause},
    {label: 'Apply the least-destructive mitigation', detail: scenario.mitigation},
    {label: 'Validate recovery', detail: `Repeat the original user-visible check, then confirm the targeted evidence and relevant SLI returned to baseline. Preserve the rollback point and watch for recurrence.`},
    {label: 'Prevent recurrence', detail: scenario.prevention},
    {label: 'Communicate and escalate', detail: scenario.runbook.escalation},
  ];
  const tutorPrompt = `Act as my senior SRE, Kubernetes, Linux, GPU, networking, and AI-infrastructure incident mentor. Run an interactive incident review for this scenario.

Scenario: ${scenario.title}
Symptom: ${scenario.description}
My current hypothesis: ${hypothesis || 'not stated yet'}
Academy leading mechanism: ${scenario.expectedRootCause}

TEACH-FIRST CONTRACT
1. First teach the system involved: purpose, components and ownership boundaries, healthy request/control/data/telemetry paths, critical dependencies, capacity limits, SLIs, and the most likely bottlenecks. Explain every relevant technology choice and one credible alternative.
2. Then teach this incident completely: failure mechanism, blast radius, causal chain, evidence and commands, safe containment, least-destructive mitigation, validation, rollback, prevention, and escalation packet. Label simulated outputs as hypothetical. Cover workload, Kubernetes control plane, node/Linux, GPU/driver, storage, network/fabric, and observability only when relevant.
3. Stop and invite questions. Do not test me until I explicitly say I am ready.
4. After I am ready, assess one decision at a time. Ask me for blast radius, recent change, two competing hypotheses, and the single most information-dense check. Require the exact command or metric, predicted result, disconfirming result, and the decision each result enables.
5. Finish with feedback at Staff SRE depth: what was correct, what was unsafe or missing, and how to communicate the conclusion to engineers, leadership, and the customer.

Do not invent facts. Identify assumptions, confidence, safety boundaries, and the evidence needed to turn an assumption into a conclusion.`;
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
  const executivePrompt = `I am briefing a customer's executive sponsor (not an engineer) on an incident that already happened. Give me a 3-4 sentence version of this incident I could say out loud to that executive.

Incident: ${scenario.title}
What the user actually experienced: ${scenario.description}
Real root cause (do not say this in jargon): ${scenario.expectedRootCause}
Fix: ${scenario.mitigation}
Prevention going forward: ${scenario.prevention}

Rules: name the business impact first (what broke for the user/customer, for how long), then one plain-language sentence on cause with no internal system names unless unavoidable, then what was done, then what changes so it does not recur. No jargon, no blame, no hedging, and no more than 4 sentences total.`;
  const choose = (id: string) => { setSelectedId(id); setHypothesis(''); };

  return <Layout title="Staff SRE troubleshooting academy" description="Learn systems, then diagnose evidence-driven production incidents">
    <main className="pageShell"><header className="pageHeader"><span className="eyebrow">Staff SRE operations academy</span><h1>Troubleshooting learning system</h1><p>Every incident below is explained front to back — the healthy system, the diagnosis, the root cause, the fix — before any question appears. Read straight through; the only question on this page is the optional recall check at the very end. {scenarios.length} incidents across SRE, Linux, databases, caches, messaging, cloud networking, CI/CD, GitOps, Kubernetes, GPU/HPC, storage, observability, IaC and security.</p></header>
      <div className="filterRow">{categories.map((item) => <button className={category === item ? 'active' : 'secondary'} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="simulatorLayout"><aside className="scenarioList">{visibleScenarios.map((item) => <button className={item.id === selectedId ? 'active' : ''} onClick={() => choose(item.id)} key={item.id}><small>{item.category}</small>{item.title}</button>)}</aside>
        <section className="simulatorPanel">
          <span className="eyebrow">{scenario.category}</span><h2>{scenario.title}</h2>
          <div className="incidentScenarioStatement"><strong>The scenario:</strong> {scenario.description}</div>

          <StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={solutionSteps} failures={[{failure: scenario.description, response: scenario.expectedRootCause}]} metrics={scenario.evidence.map((item) => `${item.action}: ${item.interpretation}`)} mode="incident"/>

          <h3>Walking through the diagnosis</h3>
          <p>Here is the reasoning a senior engineer would actually walk, in order — what to check first and why, what each check would show, and what that finding rules in or out before touching anything.</p>
          <div className="diagnosisNarrative">{scenario.evidence.map((step, index) => <article key={step.action} className="diagnosisStep"><h4><span>{index + 1}</span>{step.action}</h4><pre>{step.output}</pre><p><strong>What this means:</strong> {step.interpretation}</p></article>)}</div>
          <Mermaid value={evidenceChainMermaid(scenario.evidence.map((e) => e.action))}/>

          <h3>Evidence plan: command, reason and decision</h3><div className="commandGrid">{scenario.runbook.commands.map((item) => <article className="commandCard" key={item.label}><strong>{item.label}</strong><pre><code>{item.command}</code></pre><p>{item.why}</p></article>)}</div>

          <div className="diagnosis"><span className="eyebrow">Root cause, explained</span><h3>{scenario.expectedRootCause}</h3><p>This is exactly why the healthy path above breaks the way it does — trace it back to the specific component and boundary named in the system model.</p></div>

          <div className="twoColumns"><section><h3>Fix — why the mitigation is safe</h3><p>{scenario.mitigation}</p><p>Apply it to the smallest affected scope, retain rollback state, and watch the original SLI plus the targeted failure signal.</p></section><section><h3>Prevention — how recurrence is stopped</h3><p>{scenario.prevention}</p><p>Assign an owner and encode the prevention as a policy, test, capacity gate, alert or automated recovery — not only a runbook sentence.</p></section></div>

          <div className="threeColumns incidentFrames"><section><strong>Contain first</strong><p>{scenario.runbook.containment}</p></section><section><strong>Learning objectives</strong><ul>{scenario.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section><section><strong>Escalate with</strong><p>{scenario.runbook.escalation}</p></section></div>

          <div className="retainBox"><strong>Say it in an interview (peer/engineer framing)</strong><p>"I scoped impact, separated competing causes using evidence, contained the failure with a reversible action, proved the mechanism, validated the original user journey, and converted the cause into an owned guardrail."</p></div>

          <section className="chatgptCoachPanel"><div><span className="eyebrow">Say it to a customer executive</span><h3>The same incident, framed for a non-engineer sponsor</h3><p>Business impact first, no jargon, no blame — the version you'd actually say out loud in a customer debrief.</p></div><details><summary>Preview executive-framing prompt</summary><pre className="promptPreview">{executivePrompt}</pre></details><ChatGPTStudyLink prompt={executivePrompt} label="Get the executive framing ↗"/></section>

          <details className="optionalRecallCheck">
            <summary>Optional — test your recall</summary>
            <p>Everything below was already fully explained above. This is only for checking retention after you've read the page, not a gate.</p>
            <ol>
              <li><strong>Q:</strong> What is the root cause, in one sentence, without re-reading above? <br/><strong>A:</strong> {scenario.expectedRootCause}</li>
              <li><strong>Q:</strong> What is the least-destructive first action, and why not something more aggressive? <br/><strong>A:</strong> {scenario.mitigation}</li>
            </ol>
          </details>

          <label className="hypothesisNote"><strong>Your notes (optional, for the ChatGPT drill below)</strong><textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="Jot your own framing before running the drill, if you want the tutor to react to it…"/></label>

          <section className="chatgptCoachPanel"><div><span className="eyebrow">Teach and clarify</span><h3>Open the complete case with a Staff SRE tutor</h3><p>Use this when any component, flow, metric or solution step is unclear. The tutor teaches first, then checks understanding.</p></div><details><summary>Preview tutor prompt</summary><pre className="promptPreview">{tutorPrompt}</pre></details><ChatGPTStudyLink prompt={tutorPrompt} label="Study this incident in ChatGPT ↗"/></section>
          <section className="chatgptCoachPanel"><div><span className="eyebrow">Assessment after study</span><h3>Run the incident as a Socratic drill</h3><p>Evidence is revealed only when requested, and the final diagnosis is graded against the real mechanism, mitigation and prevention.</p></div><details><summary>Preview drilling prompt</summary><pre className="promptPreview">{drillPrompt}</pre></details><ChatGPTStudyLink prompt={drillPrompt} label="Start interview drill ↗"/></section>

          <button onClick={() => progressStore.add('troubleshootingCompleted', scenario.id)}>Mark this incident studied</button>
        </section>
      </div>
      <section className="sectionTitle"><span className="eyebrow">Primary references</span><h2>Verify product details against primary documentation</h2><div className="resourceGrid"><article className="resourceCard"><h3>Kubernetes application debugging</h3><p>Pods, services, StatefulSets, termination messages, init containers and running-container debugging.</p><a href="https://kubernetes.io/docs/tasks/debug/debug-application/">Kubernetes documentation →</a></article><article className="resourceCard"><h3>NVIDIA GPU Operator troubleshooting</h3><p>Driver, toolkit, device-plugin, NVML, validator, Xid, MIG and must-gather workflows.</p><a href="https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/troubleshooting.html">NVIDIA documentation →</a></article><article className="resourceCard"><h3>NCCL networking diagnostics</h3><p>Interface selection, InfiniBand/RoCE health, counters, connectivity and tuning boundaries.</p><a href="https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/networking_troubleshooting.html">NVIDIA NCCL guide →</a></article></div></section>
    </main>
  </Layout>;
}
