import React, {useEffect, useState} from 'react';
import Layout from '@theme/Layout';
import Mermaid from '@theme/Mermaid';
import {architectureScenarios} from '@site/src/data/architecture';
import {architectureLearning, technologyDecisionsForArchitecture} from '@site/src/data/staffLearning';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';
import StaffLearningPanel from '@site/src/components/learning/StaffLearningPanel';

const outlineMermaid = (labels: string[]) => {
  const nodes = labels.map((label, index) => `s${index}["${index + 1}. ${label.replace(/"/g, "'")}"]`);
  const links = labels.slice(1).map((_, index) => `s${index} --> s${index + 1}`);
  return `flowchart TD\n  ${nodes.join('\n  ')}\n  ${links.join('\n  ')}`;
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

export default function Architecture() {
  const categories = ['All', ...Array.from(new Set(architectureScenarios.map((item) => item.category)))];
  const [category, setCategory] = useState('All');
  const [selectedId, setSelectedId] = useState(architectureScenarios[0].id);
  const [notes, setNotes] = useState('');

  const visibleScenarios = category === 'All' ? interleaveByCategory(architectureScenarios) : architectureScenarios.filter((item) => item.category === category);
  const scenario = architectureScenarios.find((item) => item.id === selectedId) ?? visibleScenarios[0];
  const learning = architectureLearning(scenario);
  const technologyDecisions = technologyDecisionsForArchitecture(scenario);

  useEffect(() => {
    if (!visibleScenarios.some((item) => item.id === selectedId)) selectScenario(visibleScenarios[0].id);
  }, [category]);

  useEffect(() => {
    const saved = window.localStorage.getItem(`architecture-notes:${scenario.id}`) ?? '';
    setNotes(saved);
  }, [scenario.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => window.localStorage.setItem(`architecture-notes:${scenario.id}`, notes), 250);
    return () => window.clearTimeout(timer);
  }, [notes, scenario.id]);

  function selectScenario(id: string) {
    setSelectedId(id);
  }

  const panelistPrompt = `Act as a skeptical senior NVIDIA Solutions Architect interview panelist. Run one interactive system-design interview and do not reveal the reference answer until I commit to a design.

CUSTOMER BRIEF
${scenario.brief}

ASSIGNMENT
${scenario.ask}

KNOWN REQUIREMENTS
${scenario.requirements.map((item) => `- ${item}`).join('\n')}

UNKNOWNS I SHOULD DISCOVER
${scenario.unknowns.map((item) => `- ${item}`).join('\n')}

CONSTRAINTS
${scenario.constraints.map((item) => `- ${item}`).join('\n')}

INTERVIEW PROTOCOL
1. Give me ${scenario.duration} minutes and begin by asking for my clarifying questions. Answer as the customer, one question at a time. Do not volunteer all unknowns.
2. Ask me to state assumptions, define SLOs and draw workload, data, control and failure paths before naming products.
3. Probe compute/GPU fit, topology, network, storage, scheduler, tenancy, security, observability, capacity, HA, cost and Day-2 ownership where relevant.
4. Challenge vague statements. Ask what fails, how it is detected, the blast radius, degraded behavior, recovery and proof that recovery worked.
5. After I commit, use this rubric: requirement discovery; workload/data/control paths; justified trade-offs; reliability/security; capacity/cost; operations/migration; communication.
6. Give a score out of 5 per dimension, concise evidence, the three most important gaps, and one harder follow-up variant.`;

  const executivePrompt = `I need to present this architecture recommendation to the customer's executive sponsor, not their engineering team. Give me the 4-5 sentence executive version.

Scenario: ${scenario.title}
Customer brief: ${scenario.brief}
Recommended approach (first two decisions only, in plain terms): ${scenario.answerOutline.slice(0, 2).map((s) => `${s.label}: ${s.detail}`).join(' ')}
Biggest risk we're managing: ${scenario.failureModes[0]?.failure ?? 'capacity and reliability risk'}

Rules: lead with the business outcome this design protects (availability, cost, compliance, time-to-market — whichever is most relevant here), name the recommendation in one sentence with no product-name-dropping unless the executive would recognize it, name the single biggest trade-off in plain terms, and close with what would change the recommendation. No architecture jargon, no acronym soup, 4-5 sentences maximum.`;

  return <Layout title="Architecture interview lab" description="Senior GPU, AI infrastructure and platform system-design practice">
    <main className="pageShell architecturePage">
      <header className="pageHeader architectureHero">
        <div><span className="eyebrow">Staff SRE architecture academy</span><h1>Architecture learning system</h1><p>Every scenario below is explained front to back — the system, the recommended design, the trade-offs — before any question appears. The only question on the page is the optional recall checklist at the very end.</p></div>
        <div className="architectureStats"><strong>{architectureScenarios.length}</strong><span>deep scenarios</span><strong>{categories.length - 1}</strong><span>domains</span></div>
      </header>

      <div className="filterRow architectureFilters" aria-label="Filter architecture scenarios">
        {categories.map((item) => <button className={category === item ? 'active' : 'secondary'} onClick={() => setCategory(item)} key={item}>{item}</button>)}
      </div>

      <div className="architectureWorkspace">
        <aside className="architectureScenarioList">
          {visibleScenarios.map((item) => <button className={item.id === scenario.id ? 'active' : ''} onClick={() => selectScenario(item.id)} key={item.id}>
            <span>{item.category}</span><strong>{item.title}</strong><small>{item.difficulty} · {item.duration} min</small>
          </button>)}
        </aside>

        <article className="architectureBoard">
          <header className="scenarioHeader"><div><span className="eyebrow">{scenario.category} · {scenario.difficulty}</span><h2>{scenario.title}</h2></div><span className="timeBadge">{scenario.duration} min</span></header>

          <div className="customerBrief"><span className="eyebrow">Customer brief</span><p>{scenario.brief}</p><h3>Your assignment</h3><p>{scenario.ask}</p></div>

          <h3>Why each discovery question matters</h3>
          <div className="threeColumns">
            <section><h4>Known requirements</h4><ul>{scenario.requirements.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section><h4>Discover — and why it changes the design</h4><ul>{scenario.unknowns.map((item) => <li key={item}>{item}<br/><small>If the answer here goes one way vs. another, a materially different design becomes correct — that's why this isn't a checklist item, it's a design fork.</small></li>)}</ul></section>
            <section><h4>Constraints</h4><ul>{scenario.constraints.map((item) => <li key={item}>{item}</li>)}</ul></section>
          </div>

          <StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={scenario.answerOutline} failures={scenario.failureModes} tradeoffs={scenario.tradeoffs} metrics={scenario.successMetrics} technologyDecisions={technologyDecisions}/>

          <h3>Recommended architecture, explained component by component</h3>
          <Mermaid value={outlineMermaid(scenario.answerOutline.map((s) => s.label))}/>
          <div className="answerOutline">{scenario.answerOutline.map((item, index) => <article key={item.label}><span>{index + 1}</span><div><h4>{item.label}</h4><p>{item.detail}</p><small><strong>Staff check:</strong> identify the owner, observable signal, capacity limit, failure blast radius and rollback for this decision.</small></div></article>)}</div>

          <h3>Trade-offs, explained</h3>
          <div className="tableScroll"><table className="decisionTable"><thead><tr><th>Decision</th><th>Default recommendation</th><th>Switch when…</th></tr></thead><tbody>{scenario.tradeoffs.map((item) => <tr key={item.decision}><td>{item.decision}</td><td>{item.recommendation}</td><td>{item.alternative}</td></tr>)}</tbody></table></div>

          <h3>Failure-mode review</h3><p>For each failure, this is how you'd narrate detection, blast radius, degraded behavior, safe mitigation, recovery and validation.</p>
          <div className="failureGrid">{scenario.failureModes.map((item) => <article key={item.failure}><h4>{item.failure}</h4><p>{item.response}</p></article>)}</div>

          <h3>Interviewer follow-ups worth preparing for</h3><div className="followUpList">{scenario.followUps.map((item, index) => <div key={item}><span>{index + 1}</span><p>{item}</p></div>)}</div>

          <h3>Proof and success metrics</h3><ul className="metricList">{scenario.successMetrics.map((item) => <li key={item}>{item}</li>)}</ul>

          <div className="retainBox"><strong>Say it in an interview (peer/engineer framing, 3-5 minute answer)</strong><p>Requirements → capacity → architecture → failure domains → trade-offs → validation. Restate the requirements, name the two most consequential decisions, acknowledge the largest unresolved risk, and explain the PoC or validation that reduces it.</p></div>

          <section className="chatgptCoachPanel"><div><span className="eyebrow">Say it to a customer executive</span><h3>The same recommendation, framed for a non-engineer sponsor</h3><p>Business outcome first, one trade-off in plain terms, no product-name-dropping — the version you'd actually present to a VP.</p></div><details><summary>Preview executive-framing prompt</summary><pre className="promptPreview">{executivePrompt}</pre></details><ChatGPTStudyLink prompt={executivePrompt} label="Get the executive framing ↗"/></section>

          <details className="optionalRecallCheck">
            <summary>Optional — test your recall</summary>
            <p>Everything below was already fully explained above. This is only for checking retention after you've read the page, not a gate.</p>
            <ul className="signalChecklist">{scenario.strongSignals.map((item) => <li key={item}>{item}</li>)}</ul>
            <p><strong>Self-check:</strong> could you defend every item above out loud, with the reasoning, not just the label? If not, re-read the trade-offs section for that item.</p>
          </details>

          <label className="notesLabel" htmlFor="architecture-notes">Your architecture notes <small>Saved locally in this browser</small></label>
          <textarea id="architecture-notes" rows={12} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={'Assumptions:\n\nSLOs and scale:\n\nWorkload/data path:\n\nControl path:\n\nFailure domains and degraded mode:\n\nKey trade-offs:\n\nOperations and validation:'}/>
          <section className="chatgptCoachPanel"><div><span className="eyebrow">Live panelist</span><h3>Run this exact case interactively in ChatGPT</h3><p>The panelist reveals customer facts gradually, challenges vague choices and scores your committed design.</p></div><details><summary>Preview full prompt</summary><pre className="promptPreview">{panelistPrompt}</pre></details><ChatGPTStudyLink prompt={panelistPrompt} label="Start mock system-design interview ↗"/></section>
        </article>
      </div>
      <section className="architectureSources">
        <span className="eyebrow">Technical anchors</span>
        <p>Use the cases to practice judgment, then verify product-specific details against current primary documentation.</p>
        <div>
          <a href="https://docs.nvidia.com/dsx/ncp/inference-ra/home" target="_blank" rel="noreferrer">NVIDIA Inference Reference Architecture ↗</a>
          <a href="https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html" target="_blank" rel="noreferrer">NVIDIA GPU Operator ↗</a>
          <a href="https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-gb200/latest/dgx-software.html" target="_blank" rel="noreferrer">DGX SuperPOD software architecture ↗</a>
          <a href="https://docs.nvidia.com/nim/large-language-models/latest/reference/benchmarking.html" target="_blank" rel="noreferrer">NIM LLM benchmarking ↗</a>
        </div>
      </section>
    </main>
  </Layout>;
}
