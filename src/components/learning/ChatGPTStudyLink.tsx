import React from 'react';

type Props = {prompt: string; label?: string; compact?: boolean};

export default function ChatGPTStudyLink({prompt, label = 'Open in ChatGPT ↗', compact = false}: Props) {
  const href = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
  const copy = async () => { await navigator.clipboard?.writeText(prompt); };
  return <span className={compact ? 'chatgptLink compact' : 'chatgptLink'}><a className="button button--primary chatgptButton" href={href} target="_blank" rel="noreferrer">{label}</a><button className="secondary" onClick={copy}>Copy prompt</button></span>;
}
