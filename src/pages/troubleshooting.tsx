import React, {useState} from 'react';
import Layout from '@theme/Layout';
import {scenarios} from '@site/src/data/troubleshooting';
import {progressStore} from '@site/src/components/learning/progressStore';

export default function Troubleshooting() {
  const [selectedId, setSelectedId] = useState(scenarios[0].id); const [revealed, setRevealed] = useState<number[]>([]); const [answer, setAnswer] = useState(false); const [hypothesis, setHypothesis] = useState('');
  const scenario = scenarios.find((item) => item.id === selectedId)!;
  const choose = (id: string) => {setSelectedId(id); setRevealed([]); setAnswer(false); setHypothesis('');};
  return <Layout title="Troubleshooting simulator" description="Evidence-driven production incident practice"><main className="pageShell"><header className="pageHeader"><span className="eyebrow">Operations lab</span><h1>Troubleshooting simulator</h1><p>Form a hypothesis, choose high-information investigations, reveal evidence gradually, then separate mitigation from prevention.</p></header>
    <div className="simulatorLayout"><aside className="scenarioList">{scenarios.map((item) => <button className={item.id === selectedId ? 'active' : ''} onClick={() => choose(item.id)} key={item.id}>{item.title}</button>)}</aside><section className="simulatorPanel"><span className="eyebrow">Symptom</span><h2>{scenario.title}</h2><p>{scenario.description}</p><label><strong>Your current hypothesis</strong><textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="State a falsifiable cause and the evidence you expect…"/></label>
      <h3>Investigation actions</h3><div className="evidenceGrid">{scenario.evidence.map((step, index) => <div className="evidence" key={step.action}><button disabled={revealed.includes(index)} onClick={() => setRevealed([...revealed, index])}>{revealed.includes(index) ? 'Evidence revealed' : step.action}</button>{revealed.includes(index) && <><pre>{step.output}</pre><p>{step.interpretation}</p></>}</div>)}</div>
      <button disabled={revealed.length < 2} onClick={() => {setAnswer(!answer); if (!answer) progressStore.add('troubleshootingCompleted', scenario.id);}}>{answer ? 'Hide diagnosis' : 'Reveal diagnosis'}</button>{answer && <div className="diagnosis"><h3>Root cause</h3><p>{scenario.expectedRootCause}</p><h3>Mitigation</h3><p>{scenario.mitigation}</p><h3>Prevention</h3><p>{scenario.prevention}</p></div>}
    </section></div></main></Layout>;
}
