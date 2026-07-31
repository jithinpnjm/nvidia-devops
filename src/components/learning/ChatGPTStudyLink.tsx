import React from 'react';

type Props = {prompt: string; label?: string; compact?: boolean};

export function lessonPrompt(title: string, route: string) {
  return `Act as my senior DevOps, Kubernetes, Linux, GPU, AI-infrastructure, networking, and Python mentor. I am studying the NVIDIA SA Academy lesson “${title}” at ${route}.

Teach this at senior-engineer depth, but interactively:
1. Start with a 60-second mental model and the mechanism behind the topic.
2. Explain the important internals, failure modes, operational signals, and trade-offs. Connect it to Linux, Kubernetes, GPU workloads, networking, observability, or Python where relevant.
3. Give two realistic production incidents: symptom, ranked hypotheses, high-information commands/metrics, safe mitigation, validation, and prevention.
4. Include complete, safe example commands or Python code where useful. Explain each step, assumptions, rollback, and what output would change the decision. Never invent command output.
5. Give me a short senior interview question, wait for my answer, then critique it precisely.

Ask one clarifying question if my environment matters. Keep the focus on this lesson rather than giving a generic overview.`;
}

export default function ChatGPTStudyLink({prompt, label = 'Open in ChatGPT ↗', compact = false}: Props) {
  const href = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
  const copy = async () => { await navigator.clipboard?.writeText(prompt); };
  return <span className={compact ? 'chatgptLink compact' : 'chatgptLink'}><a className="button button--primary" href={href} target="_blank" rel="noreferrer">{label}</a><button className="secondary" onClick={copy}>Copy prompt</button></span>;
}
