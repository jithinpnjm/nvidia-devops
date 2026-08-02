import React, {useEffect, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import CurriculumFlow from '@site/src/components/diagrams/CurriculumFlow';
import {progressStore} from '@site/src/components/learning/progressStore';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

const areas = [
  ['Curriculum','Nine full source-derived technical volumes','/curriculum/intro/master-index'], ['Visual Learning','Interactive systems and topology diagrams','/visuals'],
  ['Python Labs','Browser-side infrastructure exercises','/labs'], ['Troubleshooting','Evidence-driven production scenarios','/troubleshooting'],
  ['Architecture Lab','Senior whiteboard practice','/architecture'], ['Interview Practice','Progressive question and answer mode','/interview'],
  ['Resources','Contextual official references','/resources'], ['Tutor','Topic-aware tutor integration hook','/tutor'], ['Progress','Browser-local completion and weak topics','/progress'],
];
export default function Home() {
  const [last, setLast] = useState<string>();
  useEffect(() => setLast(progressStore.load().lastVisited), []);
  const prompt = `Act as my learning-path architect for this NVIDIA DevOps and AI infrastructure academy. I am a senior engineer but new to some NVIDIA, GPU, AI, HPC, Slurm, BCM, Linux, Python, Kubernetes, networking and IaC concepts. Ask me which of those are genuinely new, then create a foundation-first route through the academy. Explain why each volume comes next, define prerequisites before advanced terms, assign one lesson, one lab, one visual trace and one ChatGPT assessment per stage, and do not move on until I can explain the normal path and one failure mode. End with a senior Solutions Architect interview plan.`;
  return <Layout title="Senior DevOps & AI Infrastructure Academy" description="A content-rich technical academy for NVIDIA-focused DevOps, GPU, Kubernetes, HPC and Solutions Architecture mastery.">
    <main className="homePage"><header className="technicalHero"><span className="eyebrow">NVIDIA SA Academy</span><Heading as="h1">Senior DevOps / AI Infrastructure<br/>Solutions Architect Academy</Heading><p>Full-depth curriculum, systems visualizations, production labs, incident reasoning, architecture practice, and interview coaching.</p><div className="buttonRow"><Link className="button button--primary" to={last || '/curriculum/intro/master-index'}>{last ? 'Continue learning' : 'Start with the master index'}</Link><Link className="button button--secondary" to="/progress">View progress</Link></div><section className="chatgptCoachPanel"><div><span className="eyebrow">Personalized academy guide</span><h3>Build my foundation-first study route in ChatGPT</h3><p>Use this when you are unsure which volume or prerequisite to study next.</p></div><ChatGPTStudyLink prompt={prompt} label="Plan my learning route in ChatGPT ↗"/></section></header>
    <section><div className="sectionTitle"><span className="eyebrow">Learning path</span><h2>From host mechanics to customer architecture</h2></div><CurriculumFlow/></section>
    <section><div className="sectionTitle"><span className="eyebrow">Workbench</span><h2>Learn, operate, troubleshoot, and design</h2></div><div className="areaGrid">{areas.map(([title, text, to]) => <Link className="areaCard" to={to} key={title}><strong>{title}</strong><span>{text}</span><small>Open →</small></Link>)}</div></section></main>
  </Layout>;
}
