import React from 'react';
import ChatGPTStudyLink from './ChatGPTStudyLink';
import {chapterStudyContexts} from '@site/src/data/chapterStudyContexts';

export default function ChapterStudyPanel({title, route}: {title: string; route: string}) {
  const context = chapterStudyContexts[title];
  const outcome = context?.learningOutcome || `Build senior-level command of ${title}.`;
  const sections = context?.sections?.length ? context.sections.join('; ') : title;
  const prompt = `Act as my interactive senior DevOps and AI-infrastructure mentor for one specific academy chapter.

CHAPTER
- Title: ${title}
- Curriculum route: ${route}
- Volume: ${context?.volume || 'NVIDIA SA Academy'}
- Technical lens: ${context?.lens || 'senior DevOps and AI-infrastructure engineering'}
- Learning outcome: ${outcome}
- Actual chapter sections: ${sections}
- Code and configuration formats present: ${context?.codeLanguages?.join(', ') || 'determine from the topic'}

MY BACKGROUND AND STUDY MODE
- I am an experienced engineer, but this particular domain may be completely new to me. Do not confuse professional seniority with prior subject knowledge.
- Never use an acronym or specialist term before defining it in plain language.
- Teach one small block at a time and pause for my question or confirmation before advancing.

1. Begin with the problem this technology solves, what sits immediately below and above it, and a compact normal-path diagram. Do not begin with architecture internals or an interview scenario.
2. Give me no more than ten prerequisite terms. Define each without relying on another undefined specialist term, and check that I can explain them back.
3. Walk through the listed sections in order using this progression: working model → vocabulary → one concrete example → expected output → safe observation → common failure. Connect adjacent layers only when useful.
4. For Python or configuration code, begin with the smallest runnable example. Explain every new syntax element, show representative output, let me predict a modification, then break and repair it. Add production structure only after the simple version works.
5. Give complete commands or code where appropriate. Label read-only versus mutating actions, simulated output, prerequisites, safety boundary, rollback, and validation. Never treat one metric or successful command as proof of the entire stack.
6. After the normal path is stable, create one realistic incident or architecture challenge based specifically on this chapter. Let me propose a diagnosis/design before revealing the solution and evidence ladder.
7. End with: common misconceptions, a readiness checklist, three beginner questions, three operational questions, three senior questions, a hands-on task, and a spaced-repetition summary.
8. If I ask a doubt, answer it directly first, identify the missing prerequisite if any, then reconnect it to the chapter’s normal path.

Do not invent live system results or environment facts. Label simulated output clearly. Ask for my environment only when it materially changes the answer.`;

  return <section className="chapterStudyPanel" aria-label="Chapter-specific ChatGPT study">
    <div><span className="eyebrow">One chapter · one tailored prompt</span><strong>Study this chapter interactively with ChatGPT</strong><p>{outcome}</p></div>
    <details><summary>Preview this chapter’s prompt</summary><pre className="promptPreview">{prompt}</pre></details>
    <ChatGPTStudyLink prompt={prompt} label="Open this chapter in ChatGPT ↗"/>
  </section>;
}
