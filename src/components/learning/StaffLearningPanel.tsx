import React from 'react';
import Mermaid from '@theme/Mermaid';
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

const mermaidChain = (stages: string[], idPrefix: string) => {
  const nodes = stages.map((stage, index) => `${idPrefix}${index}["${stage.replace(/"/g, "'")}"]`);
  const links = stages.slice(1).map((_, index) => `${idPrefix}${index} --> ${idPrefix}${index + 1}`);
  return `flowchart TD\n  ${nodes.join('\n  ')}\n  ${links.join('\n  ')}`;
};

export default function StaffLearningPanel({blueprint, title, solutionSteps = [], failures = [], tradeoffs = [], metrics = [], technologyDecisions = [], mode = 'architecture'}: Props) {
  return <section className="staffLearningSystem">
    <header className="learningSystemHeader">
      <div><span className="eyebrow">Learn the system first</span><h3>How {title} works when healthy</h3><p>Read this straight through — the mental model, components, healthy path and failure boundaries — before the {mode === 'incident' ? 'diagnosis' : 'recommended design'} below, which builds on all of it.</p></div>
    </header>

    <div className="conceptLesson"><span className="eyebrow">Mental model</span><p>{blueprint.mentalModel}</p></div>
    <div className="learningCallout"><strong>Required foundation</strong><p>{blueprint.prerequisite}</p></div>

    <h4>Component and ownership map</h4>
    <p>Read each row as a contract. During design or incident response, identify the owner and the evidence exposed at this boundary.</p>
    <div className="tableScroll"><table className="learningTable"><thead><tr><th>Component</th><th>Responsibility</th><th>Signals to watch</th></tr></thead><tbody>{blueprint.components.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.responsibility}</td><td>{item.watch}</td></tr>)}</tbody></table></div>
    <Mermaid value={mermaidChain(blueprint.components.map((c) => c.name), 'comp')}/>
    <div className="learningCallout"><strong>Boundary question</strong><p>For every arrow above, ask: what crosses it, how is it authenticated or validated, what is buffered, and what happens when the downstream side becomes slow rather than completely unavailable?</p></div>

    <h4>Healthy end-to-end flow</h4>
    <p>Trace one concrete request, job or change through the complete path. Each stage below is a latency, trust, capacity and ownership boundary.</p>
    <Mermaid value={mermaidChain(blueprint.healthyFlow, 'flow')}/>
    <div className="flowQuestions"><article><strong>Control path</strong><p>Who decides desired state, placement, policy or routing? What happens when that controller is delayed?</p></article><article><strong>Data path</strong><p>Where does user, model, training or artifact data move? Which hop sets throughput and tail latency?</p></article><article><strong>State path</strong><p>What must survive a restart, zone loss or rollback? Which consistency and recovery contract applies?</p></article><article><strong>Telemetry path</strong><p>Can one user-visible failure be correlated across component, version, node, tenant and dependency?</p></article></div>

    <h4>Bottleneck and failure matrix</h4>
    <p>A bottleneck is where queued work or retained state grows faster than it can be drained. Utilization alone is not proof; use queue, latency, error and saturation evidence together.</p>
    <div className="bottleneckGrid">{blueprint.bottlenecks.map((item) => <article key={item.location}><span className="eyebrow">{item.location}</span><h5>{item.pressure}</h5><dl><dt>User/system symptom</dt><dd>{item.symptom}</dd><dt>Evidence that separates it</dt><dd>{item.evidence}</dd><dt>Design guardrail</dt><dd>{item.guardrail}</dd></dl></article>)}</div>
    {failures.length > 0 && <><h4>Scenario-specific failure tree</h4><div className="failureTree"><div className="failureRoot">Healthy path violates an SLO</div><div className="failureBranches">{failures.map((item) => <article key={item.failure}><strong>{item.failure}</strong><p>{item.response}</p></article>)}</div></div></>}
    <div className="learningCallout warning"><strong>Common wrong move</strong><p>Scaling the visibly busy component may amplify the actual constraint. First prove where work queues, where deadlines expire, and whether retries or synchronized clients are multiplying load.</p></div>

    <h4>{mode === 'incident' ? 'Complete recovery method' : 'Complete reference design method'}</h4>
    {solutionSteps.length > 0 ? <div className="solutionRunbook">{solutionSteps.map((item, index) => <article key={`${item.label}-${index}`}><span>{index + 1}</span><div><h5>{item.label}</h5><p>{item.detail}</p></div></article>)}</div> : <p>Use the operating rules and scenario evidence to build the complete answer.</p>}
    <h4>Non-negotiable operating rules</h4><div className="ruleGrid">{blueprint.operatingRules.map((item) => <article key={item}>{item}</article>)}</div>
    {technologyDecisions.length > 0 && <><h4>Component selection: why this, why not the alternative?</h4><p>These are conditional decisions, not universal product rankings. The workload property in "Use when" is what makes the choice defensible.</p><div className="technologyDecisionGrid">{technologyDecisions.map((item) => <article key={item.choice}><h5>{item.choice}</h5><dl><dt>Use when</dt><dd>{item.useWhen}</dd><dt>Why it fits</dt><dd>{item.why}</dd><dt>Alternatives</dt><dd>{item.alternatives}</dd><dt>Do not choose when</dt><dd>{item.rejectWhen}</dd></dl></article>)}</div></>}
    {tradeoffs.length > 0 && <><h4>Decision and trade-off matrix</h4><div className="tableScroll"><table className="learningTable"><thead><tr><th>Decision</th><th>Default</th><th>Change when</th></tr></thead><tbody>{tradeoffs.map((item) => <tr key={item.decision}><td>{item.decision}</td><td>{item.recommendation}</td><td>{item.alternative}</td></tr>)}</tbody></table></div></>}
    {metrics.length > 0 && <><h4>Proof: metrics and acceptance gates</h4><div className="proofGrid">{metrics.map((item, index) => <article key={item}><span>{index + 1}</span><p>{item}</p></article>)}</div></>}
    <div className="retainBox"><strong>Staff SRE close</strong><p>State the user impact, normal path, confirmed constraint or failure boundary, smallest safe action, rollback, validation evidence, long-term guardrail, owner and remaining risk.</p></div>
  </section>;
}
