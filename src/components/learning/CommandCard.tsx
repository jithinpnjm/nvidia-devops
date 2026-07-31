import React from 'react';

export type Command = {command: string; asks: string; healthy: string; suspicious: string; next: string};
export default function CommandCard({item}: {item: Command}) {
  return <details className="commandCard"><summary><code>{item.command}</code></summary><dl>
    <dt>What this asks</dt><dd>{item.asks}</dd><dt>Healthy</dt><dd>{item.healthy}</dd>
    <dt>Suspicious</dt><dd>{item.suspicious}</dd><dt>Next command</dt><dd><code>{item.next}</code></dd>
  </dl></details>;
}
