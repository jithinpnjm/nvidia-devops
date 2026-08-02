import React, {useEffect, useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import {architectureScenarios} from '@site/src/data/architecture';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

type Phase = 'brief' | 'design' | 'pressure' | 'reference' | 'score';
const phases: {id: Phase; label: string}[] = [
  {id: 'brief', label: '1 · Clarify'},
  {id: 'design', label: '2 · Design'},
  {id: 'pressure', label: '3 · Pressure-test'},
  {id: 'reference', label: '4 · Compare'},
  {id: 'score', label: '5 · Score'},
];

export default function Architecture() {
  const categories = ['All', ...Array.from(new Set(architectureScenarios.map((item) => item.category)))];
  const [category, setCategory] = useState('All');
  const [selectedId, setSelectedId] = useState(architectureScenarios[0].id);
  const [phase, setPhase] = useState<Phase>('brief');
  const [notes, setNotes] = useState('');
  const [checkedSignals, setCheckedSignals] = useState<string[]>([]);

  const visibleScenarios = useMemo(
    () => category === 'All' ? architectureScenarios : architectureScenarios.filter((item) => item.category === category),
    [category],
  );
  const scenario = architectureScenarios.find((item) => item.id === selectedId) ?? visibleScenarios[0];

  useEffect(() => {
    if (!visibleScenarios.some((item) => item.id === selectedId)) selectScenario(visibleScenarios[0].id);
  }, [category]);

  useEffect(() => {
    const saved = window.localStorage.getItem(`architecture-notes:${scenario.id}`) ?? '';
    setNotes(saved);
    setCheckedSignals([]);
  }, [scenario.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => window.localStorage.setItem(`architecture-notes:${scenario.id}`, notes), 250);
    return () => window.clearTimeout(timer);
  }, [notes, scenario.id]);

  function selectScenario(id: string) {
    setSelectedId(id);
    setPhase('brief');
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

  const score = checkedSignals.length;
  const scoreLabel = score === scenario.strongSignals.length ? 'Strong answer' : score >= Math.ceil(scenario.strongSignals.length / 2) ? 'Developing' : 'Needs another pass';

  return <Layout title="Architecture interview lab" description="Senior GPU, AI infrastructure and platform system-design practice">
    <main className="pageShell architecturePage">
      <header className="pageHeader architectureHero">
        <div><span className="eyebrow">Senior system-design practice</span><h1>Architecture interview lab</h1><p>Work from customer ambiguity to a defensible architecture. Clarify, draw paths, make trade-offs, pressure-test failure, then compare.</p></div>
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

          <nav className="architecturePhases" aria-label="Interview phases">
            {phases.map((item) => <button className={phase === item.id ? 'active' : 'secondary'} onClick={() => setPhase(item.id)} key={item.id}>{item.label}</button>)}
          </nav>

          {phase === 'brief' && <section className="architecturePhase">
            <div className="customerBrief"><span className="eyebrow">Customer brief</span><p>{scenario.brief}</p><h3>Your assignment</h3><p>{scenario.ask}</p></div>
            <div className="threeColumns">
              <section><h3>Known requirements</h3><ul>{scenario.requirements.map((item) => <li key={item}>{item}</li>)}</ul></section>
              <section><h3>Discover—do not assume</h3><ul>{scenario.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></section>
              <section><h3>Constraints</h3><ul>{scenario.constraints.map((item) => <li key={item}>{item}</li>)}</ul></section>
            </div>
            <div className="interviewCoach"><strong>Opening move</strong><p>Spend 5–8 minutes clarifying workload shape, SLOs, scale, trust boundaries, failure tolerance, growth and ownership. State assumptions when the interviewer cannot answer.</p></div>
          </section>}

          {phase === 'design' && <section className="architecturePhase">
            <div className="designSequence">
              {['Requirements + assumptions', 'Workload and data paths', 'Control and failure paths', 'Key decisions + trade-offs', 'Day-2 operations + validation'].map((item, index) => <div key={item}><span>{index + 1}</span><strong>{item}</strong></div>)}
            </div>
            <p className="prompt"><strong>Whiteboard checklist:</strong> compute/GPU fit · topology · network · storage · scheduler · tenancy · security · observability · capacity · HA · cost · lifecycle ownership.</p>
            <label className="notesLabel" htmlFor="architecture-notes">Your architecture notes <small>Saved locally in this browser</small></label>
            <textarea id="architecture-notes" rows={18} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={'Assumptions:\n\nSLOs and scale:\n\nWorkload/data path:\n\nControl path:\n\nFailure domains and degraded mode:\n\nKey trade-offs:\n\nOperations and validation:'}/>
            <section className="chatgptCoachPanel"><div><span className="eyebrow">Live panelist</span><h3>Run this exact case interactively in ChatGPT</h3><p>The panelist reveals customer facts gradually, challenges vague choices and scores your committed design.</p></div><details><summary>Preview full prompt</summary><pre className="promptPreview">{panelistPrompt}</pre></details><ChatGPTStudyLink prompt={panelistPrompt} label="Start mock system-design interview ↗"/></section>
          </section>}

          {phase === 'pressure' && <section className="architecturePhase">
            <h3>Failure-mode review</h3><p>For each failure, explain detection, blast radius, degraded behavior, safe mitigation, recovery and validation.</p>
            <div className="failureGrid">{scenario.failureModes.map((item) => <article key={item.failure}><h4>{item.failure}</h4><details><summary>Compare response</summary><p>{item.response}</p></details></article>)}</div>
            <h3>Interviewer follow-ups</h3><div className="followUpList">{scenario.followUps.map((item, index) => <div key={item}><span>{index + 1}</span><p>{item}</p></div>)}</div>
          </section>}

          {phase === 'reference' && <section className="architecturePhase">
            <div className="referenceWarning"><strong>This is an answer skeleton, not a product recipe.</strong> Compare decision coverage and reasoning. A different design is strong when its assumptions and trade-offs are explicit.</div>
            <h3>Reference answer path</h3><div className="answerOutline">{scenario.answerOutline.map((item, index) => <article key={item.label}><span>{index + 1}</span><div><h4>{item.label}</h4><p>{item.detail}</p></div></article>)}</div>
            <h3>Decision matrix</h3><div className="tableScroll"><table className="decisionTable"><thead><tr><th>Decision</th><th>Default recommendation</th><th>Switch when…</th></tr></thead><tbody>{scenario.tradeoffs.map((item) => <tr key={item.decision}><td>{item.decision}</td><td>{item.recommendation}</td><td>{item.alternative}</td></tr>)}</tbody></table></div>
            <h3>Proof and success metrics</h3><ul className="metricList">{scenario.successMetrics.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>}

          {phase === 'score' && <section className="architecturePhase">
            <h3>Self-review: evidence of senior judgment</h3><p>Check an item only when your answer explicitly demonstrated it—not because you intended to mention it.</p>
            <div className="scoreCard"><div className="scoreValue"><strong>{score}/{scenario.strongSignals.length}</strong><span>{scoreLabel}</span></div><div className="signalChecklist">{scenario.strongSignals.map((item) => <label key={item}><input type="checkbox" checked={checkedSignals.includes(item)} onChange={() => setCheckedSignals((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}/><span>{item}</span></label>)}</div></div>
            <div className="interviewCoach"><strong>Final 90-second close</strong><p>Restate the requirements, name the two most consequential decisions, acknowledge the largest unresolved risk, and explain the PoC or validation that reduces it.</p></div>
          </section>}
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
