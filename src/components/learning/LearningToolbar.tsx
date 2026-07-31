import React, {useEffect, useState} from 'react';
import Link from '@docusaurus/Link';
import {progressStore} from './progressStore';

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
  return <nav className="learningToolbar" aria-label="Lesson tools">
    <span>Learn</span><Link to="/visuals">Visualize</Link><Link to={`/resources?topic=${encodeURIComponent(title)}`}>Commands & resources</Link>
    <Link to="/labs">Lab</Link><Link to="/troubleshooting">Troubleshoot</Link>
    <button className={completed ? 'active' : ''} onClick={() => toggle('completedLessons')}>{completed ? '✓ Complete' : 'Mark complete'}</button>
    <button className={bookmarked ? 'active' : ''} onClick={() => toggle('bookmarks')}>{bookmarked ? '★ Saved' : '☆ Bookmark'}</button>
  </nav>;
}
