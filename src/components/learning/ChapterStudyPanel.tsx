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

MY STUDY MODE
1. Begin with a concise mechanism-first mental model tied to this chapter—not a generic DevOps overview.
2. Walk through the listed sections in order. For each, explain why it matters in production, show a realistic example, and connect it to adjacent layers only when useful.
3. Give complete commands, Python, YAML, PromQL, or configuration examples where appropriate. Explain inputs, expected/representative output, failure interpretation, safety boundary, rollback, and validation.
4. Create one realistic senior-level incident or architecture challenge based specifically on this chapter. Let me propose a diagnosis/design before revealing the complete solution.
5. End with: common misconceptions, five interview questions with strong answer points, a hands-on practice task, and a spaced-repetition memory summary.
6. If I ask a doubt, answer it directly first, then reconnect it to the chapter’s mechanism.

Do not invent live system results or environment facts. Label simulated output clearly. Ask for my environment only when it materially changes the answer.`;

  return <section className="chapterStudyPanel" aria-label="Chapter-specific ChatGPT study">
    <div><span className="eyebrow">One chapter · one tailored prompt</span><strong>Study this chapter interactively with ChatGPT</strong><p>{outcome}</p></div>
    <details><summary>Preview this chapter’s prompt</summary><pre className="promptPreview">{prompt}</pre></details>
    <ChatGPTStudyLink prompt={prompt} label="Open this chapter in ChatGPT ↗"/>
  </section>;
}
