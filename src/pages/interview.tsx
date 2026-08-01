import React, {useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import {interviewQuestions} from '@site/src/data/interview';
import {progressStore} from '@site/src/components/learning/progressStore';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

export default function Interview() {
  const categories = ['All'].concat(Array.from(new Set(interviewQuestions.map((q) => q.category)))); const [category, setCategory] = useState('All'); const [index, setIndex] = useState(0); const [follow, setFollow] = useState(false); const [framework, setFramework] = useState(false); const [answer, setAnswer] = useState(false); const [notes, setNotes] = useState(''); const [level, setLevel] = useState(3);
  const bank = useMemo(() => category === 'All' ? interviewQuestions : interviewQuestions.filter((q) => q.category === category), [category]); const question = bank[index % bank.length];
  const reset = (next = index + 1) => {progressStore.add('interviewAttempted', question.id); setIndex(next % bank.length); setFollow(false); setFramework(false); setAnswer(false); setNotes('');};
  const rubric = question.answerStructure.map((s) => `- ${s.label}: ${s.content}`).join('\n');
  const mockInterviewPrompt = `Act as a live senior-level mock interviewer for an NVIDIA Senior Solutions Architect / DevOps interview (job req JR2018680).

QUESTION TO ASK ME
- Category: ${question.category}
- Question: ${question.question}

HOW TO RUN THIS
1. Ask me the question above exactly as a real interviewer would — do not soften it, do not preview the framework or answer, and do not ask it in a different form than written.
2. Wait for my typed or spoken answer. Do not interrupt or hint while I am answering.
3. Once I answer, grade my answer against this rubric — the framework I am expected to reason through, and the specific labeled parts of a strong answer:

Framework: ${question.framework}

Strong-answer rubric:
${rubric}

4. Give me direct, specific feedback: what I covered well, and any gap versus this "interview-ready line" I should have hit: "${question.answerStructure[question.answerStructure.length - 1]?.content || ''}"
5. Then ask this natural follow-up exactly as a real interviewer would, and grade that answer the same way: "${question.followUp}"
6. Finish by asking one harder variation of the original question — something that pushes past the framework above into an edge case, a failure mode, or a trade-off this rubric does not fully cover — and grade that too.

Do not reveal the rubric or the follow-up to me before I have answered the prior step. Be honest and specific about gaps — this is interview prep for later this week, not a confidence exercise.`;
  return <Layout title="Interview practice"><main className="pageShell narrow"><header className="pageHeader"><span className="eyebrow">Senior interview mode</span><h1>Reason aloud, then compare</h1><p>Answers stay hidden until requested. The 0–6 scale moves from no familiarity to customer advice and trade-offs.</p></header><div className="filterRow">{categories.map((item) => <button className={category === item ? 'active' : 'secondary'} key={item} onClick={() => {setCategory(item); setIndex(0);}}>{item}</button>)}</div><article className="questionPanel"><span className="eyebrow">{question.category} · question {index + 1}/{bank.length}</span><h2>{question.question}</h2><textarea rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Structure your answer here before revealing guidance…"/><label>Self-assessed depth: <strong>{level}</strong><input type="range" min="0" max="6" value={level} onChange={(e) => setLevel(Number(e.target.value))}/></label><section className="chatgptCoachPanel"><div><span className="eyebrow">Live ChatGPT mock interviewer</span><h3>Have ChatGPT ask this question out loud and grade your answer</h3><p>The prompt carries this exact question, the framework, and the full answer rubric, so ChatGPT can ask it cold, grade your free-form answer against the rubric, surface gaps versus the interview-ready line, then continue with the real follow-up and a harder variation.</p></div><details><summary>Preview the mock-interview prompt</summary><pre className="promptPreview">{mockInterviewPrompt}</pre></details><ChatGPTStudyLink prompt={mockInterviewPrompt} label="Start mock interview in ChatGPT ↗"/></section><div className="buttonRow"><button onClick={() => setFollow(!follow)}>Show follow-up</button><button onClick={() => setFramework(!framework)}>Reveal framework</button><button onClick={() => setAnswer(!answer)}>Reveal strong answer</button></div>{follow && <div className="reveal"><strong>Follow-up</strong><p>{question.followUp}</p></div>}{framework && <div className="reveal"><strong>Framework</strong><p>{question.framework}</p></div>}{answer && <div className="reveal answer"><strong>Strong answer</strong>{question.answerStructure.map((section) => <div key={section.label}><h3>{section.label}</h3><p>{section.content}</p></div>)}</div>}<button onClick={() => reset()}>Next question →</button></article></main></Layout>;
}
