import React from 'react';
import Link from '@docusaurus/Link';

type Stage = {
  label: string;
  summary: string;
  action?: string;
};

function stageFor(title: string, route: string): Stage {
  const normalized = title.toLowerCase();

  if (route.includes('/volume-00/')) {
    return {
      label: 'Volume 0 — Foundations Primer',
      summary: 'No prior domain knowledge is assumed. This chapter builds one mental model from zero before naming any advanced term.',
      action: 'Finish this chapter\'s readiness checklist before moving into the advanced volume it links to.',
    };
  }

  if (route.includes('/intro/') && normalized.includes('foundation')) {
    return {
      label: 'Foundation bridge (compressed reference)',
      summary: 'This is a dense reference companion, not the first explanation of these terms. Read the matching Volume 0 chapter first if this is genuinely new.',
    };
  }

  if (normalized.includes('senior deep dive')) {
    return {
      label: 'Advanced deep dive',
      summary: 'Study this after the corresponding core chapter. You should already be able to draw and observe the healthy path.',
      action: 'If the terms feel unstable, return to the foundation path before using this as interview material.',
    };
  }

  if (route.includes('/volume-09/')) {
    return {
      label: 'Assessment and interview practice',
      summary: 'This tests knowledge learned elsewhere; it is not the first explanation of the underlying technology.',
      action: 'Use each weak answer to route back to its core chapter and hands-on observation.',
    };
  }

  if (route.includes('/volume-10/')) {
    return {
      label: 'Integrated operations',
      summary: 'This chapter combines several layers. Use its beginner bridge, then revisit the linked foundation volume for any unfamiliar layer.',
    };
  }

  return {
    label: 'Core learning chapter',
    summary: 'First learn the problem, essential vocabulary, and normal path; then observe it before attempting senior scenarios.',
  };
}

export default function LearningStagePanel({title, route}: {title: string; route: string}) {
  const stage = stageFor(title, route);

  return <aside className="learningStagePanel" aria-label="Learning stage">
    <div>
      <span className="eyebrow">{stage.label}</span>
      <p>{stage.summary}</p>
      {stage.action && <p className="learningStageAction">{stage.action}</p>}
    </div>
    <Link to="/curriculum/intro/foundation-learning-path">View prerequisites and readiness gates →</Link>
  </aside>;
}

