import React from 'react';
export default function FlowDiagram({title, nodes}: {title: string; nodes: string[]}) { return <figure className="flowDiagram"><figcaption>{title}</figcaption><div>{nodes.map((node, index) => <React.Fragment key={node}><span>{node}</span>{index < nodes.length - 1 && <b aria-hidden="true">→</b>}</React.Fragment>)}</div></figure>; }
