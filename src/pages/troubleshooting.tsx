import React, {useState} from 'react';
import Layout from '@theme/Layout';
import Mermaid from '@theme/Mermaid';
import {scenarios} from '@site/src/data/troubleshooting';
import {progressStore} from '@site/src/components/learning/progressStore';

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
  const visibleScenarios = category === 'All' ? interleaveByCategory(scenarios) : scenarios.filter((item) => item.category === category);
  const scenario = scenarios.find((item) => item.id === selectedId)!;

  const choose = (id: string) => { setSelectedId(id); };

  return <Layout title="AI Infrastructure Troubleshooting" description="NVIDIA AI Infrastructure incident scenarios and runbooks">
    <main className="pageShell">
      <header className="pageHeader">
        <span className="eyebrow">AI Infrastructure Operations</span>
        <h1>Production Troubleshooting Scenarios</h1>
        <p>Master {scenarios.length} high-severity incident scenarios across Linux, Kubernetes, GPU, HPC, Networking, and Observability. Review the evidence, diagnosis, root cause, and mitigation for each production failure.</p>
      </header>
      
      <div className="filterRow">
        {categories.map((item) => <button className={category === item ? 'active' : 'secondary'} key={item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      
      <div className="simulatorLayout">
        <aside className="scenarioList">
          {visibleScenarios.map((item) => <button className={item.id === selectedId ? 'active' : ''} onClick={() => choose(item.id)} key={item.id}><small>{item.category}</small>{item.title}</button>)}
        </aside>
        
        <section className="simulatorPanel">
          <span className="eyebrow">{scenario.category}</span>
          <h2>{scenario.title}</h2>
          
          <div className="incidentScenarioStatement">
            <strong>Symptom:</strong> {scenario.description}
          </div>

          <div className="diagnosis">
            <span className="eyebrow">Root Cause</span>
            <h3>{scenario.expectedRootCause}</h3>
          </div>

          <div className="diagnosisNarrative">
            <h3>Diagnostic Evidence Path</h3>
            <p>The exact reasoning and evidence a senior engineer would gather to prove the root cause:</p>
            {scenario.evidence.map((step, index) => 
              <article key={step.action} className="diagnosisStep">
                <h4><span>{index + 1}</span>{step.action}</h4>
                <pre>{step.output}</pre>
                <p><strong>Interpretation:</strong> {step.interpretation}</p>
              </article>
            )}
          </div>
          
          <div className="mermaidContainer" style={{margin: '2rem 0'}}>
            <Mermaid value={evidenceChainMermaid(scenario.evidence.map((e) => e.action))}/>
          </div>

          <div className="commandGrid">
            <h3>Standard Operating Procedure (Commands)</h3>
            {scenario.runbook.commands.map((item) => 
              <article className="commandCard" key={item.label}>
                <strong>{item.label}</strong>
                <pre><code>{item.command}</code></pre>
                <p>{item.why}</p>
              </article>
            )}
          </div>

          <div className="twoColumns">
            <section>
              <h3>Mitigation (Containment)</h3>
              <p><strong>First Action:</strong> {scenario.runbook.containment}</p>
              <p><strong>Fix:</strong> {scenario.mitigation}</p>
            </section>
            <section>
              <h3>Prevention & Escalation</h3>
              <p><strong>Prevention:</strong> {scenario.prevention}</p>
              <p><strong>Escalation:</strong> {scenario.runbook.escalation}</p>
            </section>
          </div>

          <div className="retainBox" style={{marginTop: '2rem'}}>
            <strong>Executive Summary (For Stakeholders)</strong>
            <p>"{scenario.title}: {scenario.description} The underlying cause was identified as {scenario.expectedRootCause.toLowerCase()} We have {scenario.mitigation.toLowerCase()} to restore service, and will {scenario.prevention.toLowerCase()} to prevent recurrence."</p>
          </div>

          <div style={{marginTop: '2rem'}}>
            <button onClick={() => progressStore.add('troubleshootingCompleted', scenario.id)}>Mark this incident as studied</button>
          </div>
        </section>
      </div>
    </main>
  </Layout>;
}
