import React, {useEffect, useState} from 'react';
import Link from '@docusaurus/Link';
import {progressStore} from './progressStore';
import ChatGPTStudyLink from './ChatGPTStudyLink';

export default function LearningToolbar({route, title}: {route: string; title: string}) {
  const [completed, setCompleted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  useEffect(() => {
    const state = progressStore.load();
    setCompleted(state.completedLessons.includes(route));
    setBookmarked(state.bookmarks.includes(route));
    progressStore.visit(route);
  }, [route]);
  const toggle = (key: 'completedLessons' | 'bookmarks') => {
    const state = progressStore.toggle(key, route);
    setCompleted(state.completedLessons.includes(route));
    setBookmarked(state.bookmarks.includes(route));
  };
  const prompt = `Act as my interactive senior DevOps and AI-infrastructure tutor for this exact academy lesson.

Lesson: ${title}
Route: ${route}

Teach me from first principles even though I am a senior engineer: define every acronym before using it, explain the problem and normal path before internals, and connect each concept to NVIDIA GPU, Kubernetes, Linux, networking, HPC, Slurm, BCM, Python, Git, observability, or solutions architecture only when relevant. Use this sequence: working model → vocabulary → smallest example → expected output → safe read-only observation → common failure → complete production solution → validation and rollback. For every command or code block, explain why it is used, what each important option means, what output would prove, and what it cannot prove. Ask me one question at a time and wait for my answer before revealing the next step. End with misconceptions, a hands-on exercise, and beginner/intermediate/senior interview questions. Do not invent live environment results; label simulated output.`;
  return <nav className="learningToolbar" aria-label="Lesson tools">
    <span>Learn</span><ChatGPTStudyLink compact prompt={prompt} label="ChatGPT study ↗"/><Link to="/visuals">Visualize</Link><Link to={`/resources?topic=${encodeURIComponent(title)}`}>Commands & resources</Link>
    <Link to="/labs">Lab</Link><Link to="/troubleshooting">Troubleshoot</Link>
    <button className={completed ? 'active' : ''} onClick={() => toggle('completedLessons')}>{completed ? '✓ Complete' : 'Mark complete'}</button>
    <button className={bookmarked ? 'active' : ''} onClick={() => toggle('bookmarks')}>{bookmarked ? '★ Saved' : '☆ Bookmark'}</button>
  </nav>;
}
