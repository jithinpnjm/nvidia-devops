import React, {useState} from 'react';
import type {LearningBlueprint, TechnologyDecision} from '@site/src/data/staffLearning';

type SolutionStep = {label: string; detail: string};
type Failure = {failure: string; response: string};
type Tradeoff = {decision: string; recommendation: string; alternative: string};

type Props = {
  blueprint: LearningBlueprint;
  title: string;
  solutionSteps?: SolutionStep[];
  failures?: Failure[];
  tradeoffs?: Tradeoff[];
  metrics?: string[];
  technologyDecisions?: TechnologyDecision[];
  mode?: 'architecture' | 'incident';
};

type StudyPhase = 'foundation' | 'components' | 'flow' | 'limits' | 'operate';
const studyPhases: {id: StudyPhase; label: string; purpose: string}[] = [
  {id: 'foundation', label: '1 · Learn', purpose: 'Build the mental model'},
  {id: 'components', label: '2 · Components', purpose: 'Know ownership and signals'},
  {id: 'flow', label: '3 · Trace', purpose: 'Follow the healthy path'},
  {id: 'limits', label: '4 · Bottlenecks', purpose: 'Understand saturation and failure'},
  {id: 'operate', label: '5 · Operate', purpose: 'Design, recover and validate'},
];

export default function StaffLearningPanel({blueprint, title, solutionSteps = [], failures = [], tradeoffs = [], metrics = [], technologyDecisions = [], mode = 'architecture'}: Props) {
  const [phase, setPhase] = useState<StudyPhase>('foundation');
  const [completed, setCompleted] = useState<StudyPhase[]>([]);
  const markComplete = () => setCompleted((current) => current.includes(phase) ? current : [...current, phase]);
  const next = () => {
    markComplete();
    const index = studyPhases.findIndex((item) => item.id === phase);
    if (index < studyPhases.length - 1) setPhase(studyPhases[index + 1].id);
  };

  return <section className="staffLearningSystem">
    <header className="learningSystemHeader">
      <div><span className="eyebrow">Staff SRE guided study</span><h3>Learn {title} before attempting it</h3><p>This is the teaching layer. Follow the phases in order; the interview or incident drill comes afterward.</p></div>
      <div className="learningProgress"><strong>{completed.length}/{studyPhases.length}</strong><span>study phases</span></div>
    </header>

    <nav className="studyPhaseNav" aria-label="Study phases">
      {studyPhases.map((item) => <button key={item.id} onClick={() => setPhase(item.id)} className={phase === item.id ? 'active' : completed.includes(item.id) ? 'complete' : 'secondary'}><strong>{item.label}</strong><small>{item.purpose}</small></button>)}
    </nav>

    {phase === 'foundation' && <div className="studyPhaseBody">
      <div className="conceptLesson"><span className="eyebrow">Mental model</span><p>{blueprint.mentalModel}</p></div>
      <div className="learningCallout"><strong>Required foundation</strong><p>{blueprint.prerequisite}</p></div>
      <h4>The Staff-level reasoning ladder</h4>
      <div className="reasoningLadder">
        {['What problem exists?', 'What is the healthy mechanism?', 'Where are the boundaries?', 'What saturates or fails?', 'What evidence proves it?', 'What trade-off changes the design?'].map((item, index) => <div key={item}><span>{index + 1}</span><p>{item}</p></div>)}
      </div>
      <div className="retainBox"><strong>What to retain</strong><ul><li>Start with the normal path, not a product name or command.</li><li>Separate control, data, state and telemetry paths.</li><li>A component is understood only when you know its input, output, dependency, saturation signal and failure blast radius.</li></ul></div>
    </div>}

    {phase === 'components' && <div className="studyPhaseBody">
      <h4>Component and ownership map</h4><p>Read each row as a contract. During design or incident response, identify the owner and the evidence exposed at this boundary.</p>
      <div className="tableScroll"><table className="learningTable"><thead><tr><th>Component</th><th>Responsibility</th><th>Signals to watch</th></tr></thead><tbody>{blueprint.components.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.responsibility}</td><td>{item.watch}</td></tr>)}</tbody></table></div>
      <div className="componentBoundaryDiagram">
        {blueprint.components.slice(0, 6).map((item, index) => <React.Fragment key={item.name}><article><span>{index + 1}</span><strong>{item.name}</strong><small>{item.responsibility}</small></article>{index < Math.min(5, blueprint.components.length - 1) && <b>→</b>}</React.Fragment>)}
      </div>
      <div className="learningCallout"><strong>Boundary question</strong><p>For every arrow, ask: what crosses it, how is it authenticated or validated, what is buffered, and what happens when the downstream side becomes slow rather than completely unavailable?</p></div>
    </div>}

    {phase === 'flow' && <div className="studyPhaseBody">
      <h4>Healthy end-to-end flow</h4><p>Trace one concrete request, job or change through the complete path. Each arrow is a latency, trust, capacity and ownership boundary.</p>
      <div className="systemFlowDiagram">{blueprint.healthyFlow.map((item, index) => <React.Fragment key={`${item}-${index}`}><article><span>Stage {index + 1}</span><strong>{item}</strong></article>{index < blueprint.healthyFlow.length - 1 && <b>↓</b>}</React.Fragment>)}</div>
      <div className="flowQuestions"><article><strong>Control path</strong><p>Who decides desired state, placement, policy or routing? What happens when that controller is delayed?</p></article><article><strong>Data path</strong><p>Where does user, model, training or artifact data move? Which hop sets throughput and tail latency?</p></article><article><strong>State path</strong><p>What must survive a restart, zone loss or rollback? Which consistency and recovery contract applies?</p></article><article><strong>Telemetry path</strong><p>Can one user-visible failure be correlated across component, version, node, tenant and dependency?</p></article></div>
      <h4>How to use this chart</h4><ol><li>Pick one real workload shape, not an average.</li><li>Attach an SLI and capacity limit to every stage.</li><li>Mark synchronous dependencies and retry ownership.</li><li>Draw the degraded path for one dependency slowdown and one complete failure.</li></ol>
    </div>}

    {phase === 'limits' && <div className="studyPhaseBody">
      <h4>Bottleneck and failure matrix</h4><p>A bottleneck is where queued work or retained state grows faster than it can be drained. Utilization alone is not proof; use queue, latency, error and saturation evidence together.</p>
      <div className="bottleneckGrid">{blueprint.bottlenecks.map((item) => <article key={item.location}><span className="eyebrow">{item.location}</span><h5>{item.pressure}</h5><dl><dt>User/system symptom</dt><dd>{item.symptom}</dd><dt>Evidence that separates it</dt><dd>{item.evidence}</dd><dt>Design guardrail</dt><dd>{item.guardrail}</dd></dl></article>)}</div>
      {failures.length > 0 && <><h4>Scenario-specific failure tree</h4><div className="failureTree"><div className="failureRoot">Healthy path violates an SLO</div><div className="failureBranches">{failures.map((item) => <article key={item.failure}><strong>{item.failure}</strong><p>{item.response}</p></article>)}</div></div></>}
      <div className="learningCallout warning"><strong>Common wrong move</strong><p>Scaling the visibly busy component may amplify the actual constraint. First prove where work queues, where deadlines expire, and whether retries or synchronized clients are multiplying load.</p></div>
    </div>}

    {phase === 'operate' && <div className="studyPhaseBody">
      <h4>{mode === 'incident' ? 'Complete recovery method' : 'Complete reference design method'}</h4>
      {solutionSteps.length > 0 ? <div className="solutionRunbook">{solutionSteps.map((item, index) => <article key={`${item.label}-${index}`}><span>{index + 1}</span><div><h5>{item.label}</h5><p>{item.detail}</p></div></article>)}</div> : <p>Use the operating rules and scenario evidence to build the complete answer.</p>}
      <h4>Non-negotiable operating rules</h4><div className="ruleGrid">{blueprint.operatingRules.map((item) => <article key={item}>{item}</article>)}</div>
      {technologyDecisions.length > 0 && <><h4>Component selection: why this, why not the alternative?</h4><p>These are conditional decisions, not universal product rankings. The workload property in “Use when” is what makes the choice defensible.</p><div className="technologyDecisionGrid">{technologyDecisions.map((item) => <article key={item.choice}><h5>{item.choice}</h5><dl><dt>Use when</dt><dd>{item.useWhen}</dd><dt>Why it fits</dt><dd>{item.why}</dd><dt>Alternatives</dt><dd>{item.alternatives}</dd><dt>Do not choose when</dt><dd>{item.rejectWhen}</dd></dl></article>)}</div></>}
      {tradeoffs.length > 0 && <><h4>Decision and trade-off matrix</h4><div className="tableScroll"><table className="learningTable"><thead><tr><th>Decision</th><th>Default</th><th>Change when</th></tr></thead><tbody>{tradeoffs.map((item) => <tr key={item.decision}><td>{item.decision}</td><td>{item.recommendation}</td><td>{item.alternative}</td></tr>)}</tbody></table></div></>}
      {metrics.length > 0 && <><h4>Proof: metrics and acceptance gates</h4><div className="proofGrid">{metrics.map((item, index) => <article key={item}><span>{index + 1}</span><p>{item}</p></article>)}</div></>}
      <div className="retainBox"><strong>Staff SRE close</strong><p>State the user impact, normal path, confirmed constraint or failure boundary, smallest safe action, rollback, validation evidence, long-term guardrail, owner and remaining risk.</p></div>
    </div>}

    <footer className="studyFooter"><button className="secondary" onClick={markComplete}>Mark this phase studied</button>{phase !== 'operate' && <button onClick={next}>Mark studied and continue →</button>}</footer>
  </section>;
}
