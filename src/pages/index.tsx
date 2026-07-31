import React, {useEffect, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import CurriculumFlow from '@site/src/components/diagrams/CurriculumFlow';
import {progressStore} from '@site/src/components/learning/progressStore';

const areas = [
  ['Curriculum','Nine full source-derived technical volumes','/curriculum/intro/master-index'], ['Visual Learning','Interactive systems and topology diagrams','/visuals'],
  ['Python Labs','Browser-side infrastructure exercises','/labs'], ['Troubleshooting','Evidence-driven production scenarios','/troubleshooting'],
  ['Architecture Lab','Senior whiteboard practice','/architecture'], ['Interview Practice','Progressive question and answer mode','/interview'],
  ['Resources','Contextual official references','/resources'], ['Tutor','Topic-aware tutor integration hook','/tutor'], ['Progress','Browser-local completion and weak topics','/progress'],
];
export default function Home() {
  const [last, setLast] = useState<string>();
  useEffect(() => setLast(progressStore.load().lastVisited), []);
  return <Layout title="Senior DevOps & AI Infrastructure Academy" description="A content-rich technical academy for NVIDIA-focused DevOps, GPU, Kubernetes, HPC and Solutions Architecture mastery.">
    <main className="homePage"><header className="technicalHero"><span className="eyebrow">NVIDIA SA Academy</span><Heading as="h1">Senior DevOps / AI Infrastructure<br/>Solutions Architect Academy</Heading><p>Full-depth curriculum, systems visualizations, production labs, incident reasoning, architecture practice, and interview coaching.</p><div className="buttonRow"><Link className="button button--primary" to={last || '/curriculum/intro/master-index'}>{last ? 'Continue learning' : 'Start with the master index'}</Link><Link className="button button--secondary" to="/progress">View progress</Link></div></header>
    <section><div className="sectionTitle"><span className="eyebrow">Learning path</span><h2>From host mechanics to customer architecture</h2></div><CurriculumFlow/></section>
    <section><div className="sectionTitle"><span className="eyebrow">Workbench</span><h2>Learn, operate, troubleshoot, and design</h2></div><div className="areaGrid">{areas.map(([title, text, to]) => <Link className="areaCard" to={to} key={title}><strong>{title}</strong><span>{text}</span><small>Open →</small></Link>)}</div></section></main>
  </Layout>;
}
