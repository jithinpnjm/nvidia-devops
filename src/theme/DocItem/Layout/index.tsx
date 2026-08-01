import React from 'react';
import OriginalLayout from '@theme-original/DocItem/Layout';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import LearningToolbar from '@site/src/components/learning/LearningToolbar';
import ChapterStudyPanel from '@site/src/components/learning/ChapterStudyPanel';
import LearningStagePanel from '@site/src/components/learning/LearningStagePanel';

export default function Layout(props: React.ComponentProps<typeof OriginalLayout>) {
  const {metadata} = useDoc();
  return <><LearningToolbar route={metadata.permalink} title={metadata.title}/><LearningStagePanel route={metadata.permalink} title={metadata.title}/><ChapterStudyPanel route={metadata.permalink} title={metadata.title}/><OriginalLayout {...props}/></>;
}
