import React, {useState} from 'react';
import Layout from '@theme/Layout';
import PythonPlayground, {type PythonExercise} from '@site/src/components/PythonPlayground';

const labs: PythonExercise[] = [
  {id:'regex',title:'1 · Parse a kubelet incident log',prompt:'Turn raw kubelet evidence into a typed record. Reject malformed input: ambiguous parsing is unsafe during an incident.',starter:`import re

def parse_log(line: str) -> dict:
    # Return timestamp, severity, and message.
    return {}

print(parse_log("2026-07-30T10:00:00Z ERROR kubelet timeout"))`,expected:"{'timestamp': '2026-07-30T10:00:00Z', 'severity': 'ERROR', 'message': 'kubelet timeout'}",tests:`item = parse_log("2026-07-30T10:00:00Z ERROR kubelet timeout")
assert item['severity'] == 'ERROR'
try: parse_log('not a log')
except ValueError: pass
else: raise AssertionError('must reject invalid input')
print('PASS')`,hint:'Use re.fullmatch with named groups; a parser should either return a complete record or fail clearly.',solution:`def parse_log(line):
    match = re.fullmatch(r"(?P<timestamp>\\S+) (?P<severity>DEBUG|INFO|WARN|ERROR) (?P<message>.+)", line)
    if not match:
        raise ValueError(f"invalid log line: {line!r}")
    return match.groupdict()`,explanation:'This is the pure parsing boundary from Volume 2. Keep file reads and log transport outside it so edge cases are cheap to test.'},
  {id:'retry',title:'2 · Retry only transient API failures',prompt:'Produce a deterministic retry decision for an API client. A retry without a deadline or classification can amplify an outage.',starter:`RETRYABLE = {429, 500, 502, 503, 504}

def retry_plan(statuses: list[int], max_attempts: int = 3) -> list[int]:
    # Return retryable statuses, up to max_attempts.
    return []

print(retry_plan([503, 401, 429, 500]))`,expected:'[503, 429, 500]',tests:`assert retry_plan([503, 401, 429, 500]) == [503, 429, 500]
assert retry_plan([404, 409]) == []
assert retry_plan([500, 503, 429, 504], 2) == [500, 503]
print('PASS')`,hint:'Separate classification from sleeping and I/O. 401/403/404 require a decision, not an automatic retry.',solution:`def retry_plan(statuses, max_attempts=3):
    return [status for status in statuses if status in RETRYABLE][:max_attempts]`,explanation:'In a real client, combine this pure decision with a total deadline, idempotency awareness, exponential backoff, jitter, and `Retry-After` handling.'},
  {id:'gpu',title:'3 · Normalize GPU inventory',prompt:'Convert nvidia-smi CSV output to immutable records. Inventory is a boundary: command text must not leak into placement decisions.',starter:`from dataclasses import dataclass

@dataclass(frozen=True)
class GPU:
    uuid: str
    name: str
    memory_mb: int

def parse_inventory(text: str) -> list[GPU]:
    return []

sample = "GPU-a, NVIDIA H100, 81559\\nGPU-b, NVIDIA H100, 81559"
print(parse_inventory(sample))`,expected:'Two GPU objects with UUID, model, and integer memory_mb',tests:`items = parse_inventory(sample)
assert len(items) == 2
assert items[0] == GPU('GPU-a', 'NVIDIA H100', 81559)
print('PASS')`,hint:'Ignore blank lines; split each row into exactly three stripped fields.',solution:`def parse_inventory(text):
    records = []
    for line in text.splitlines():
        if not line.strip():
            continue
        uuid, name, memory = (field.strip() for field in line.split(',', 2))
        records.append(GPU(uuid, name, int(memory)))
    return records`,explanation:'Typed data lets a later scheduler or report work independently of `nvidia-smi` and makes invalid inventory testable.'},
  {id:'oom',title:'4 · Detect cgroup memory risk',prompt:'Classify containers before an OOMKill. Use the limit—not node free memory—as the container safety boundary.',starter:`def memory_risk(working_set_mib: int, limit_mib: int) -> str:
    # Return normal, warning, or critical.
    return ''

print(memory_risk(14300, 16000))`,expected:'normal < 80%, warning 80–94%, critical ≥ 95%',tests:`assert memory_risk(100, 1000) == 'normal'
assert memory_risk(800, 1000) == 'warning'
assert memory_risk(950, 1000) == 'critical'
print('PASS')`,hint:'Compute the ratio once. Treat a missing/non-positive limit as invalid input.',solution:`def memory_risk(working_set_mib, limit_mib):
    if limit_mib <= 0:
        raise ValueError('a positive cgroup limit is required')
    ratio = working_set_mib / limit_mib
    if ratio >= .95: return 'critical'
    if ratio >= .80: return 'warning'
    return 'normal'`,explanation:'For inference, correlate this with active sequences, prompt tokens, KV-cache allocation, and restart evidence before raising a limit.'},
  {id:'scheduling',title:'5 · Explain an unschedulable GPU Pod',prompt:'Turn scheduler event fragments into a ranked, human-readable diagnosis. Prefer specific constraints over a generic “Pending” message.',starter:`def scheduling_diagnosis(events: list[str]) -> list[str]:
    # Return unique diagnoses in order of evidence.
    return []

print(scheduling_diagnosis(['Insufficient nvidia.com/gpu', 'node affinity mismatch']))`,expected:"['insufficient GPU capacity', 'node affinity conflict']",tests:`assert scheduling_diagnosis(['Insufficient nvidia.com/gpu', 'node affinity mismatch']) == ['insufficient GPU capacity', 'node affinity conflict']
assert scheduling_diagnosis(['node affinity mismatch', 'node affinity mismatch']) == ['node affinity conflict']
print('PASS')`,hint:'Map known fragments to explanations, then preserve first-seen order while removing duplicates.',solution:`def scheduling_diagnosis(events):
    rules = [('nvidia.com/gpu', 'insufficient GPU capacity'), ('affinity', 'node affinity conflict'), ('taint', 'missing toleration')]
    found = []
    for event in events:
        for needle, diagnosis in rules:
            if needle.lower() in event.lower() and diagnosis not in found:
                found.append(diagnosis)
    return found`,explanation:'The production next step is `kubectl describe pod` plus node allocatable resources, taints, affinity, and topology labels—not deleting the Pod.'},
  {id:'prometheus',title:'6 · Guard a Prometheus query',prompt:'Reject a dangerous unbounded query shape before it becomes a high-cardinality incident.',starter:`def query_guard(query: str) -> str:
    # Return safe or review.
    return ''

print(query_guard('sum(rate(http_requests_total[5m]))'))`,expected:'review for wildcard/regex selectors or a missing range selector',tests:`assert query_guard('sum(rate(http_requests_total[5m]))') == 'safe'
assert query_guard('rate(http_requests_total{pod=~".*"}[5m])') == 'review'
assert query_guard('http_requests_total') == 'review'
print('PASS')`,hint:'This deliberately small guard is a teaching aid, not a PromQL parser.',solution:`def query_guard(query):
    if '=~".*"' in query or '[' not in query or ']' not in query:
        return 'review'
    return 'safe'`,explanation:'Senior observability work treats cardinality and query cost as reliability concerns. Inspect labels, bounded time windows, and recording rules.'},
  {id:'runbook',title:'7 · Turn evidence into a safe action',prompt:'Choose the least-destructive action from an incident state. Do not restart a node before preserving the evidence needed to prove the cause.',starter:`def next_action(node_ready: bool, disk_pressure: bool, xid_seen: bool) -> str:
    return ''

print(next_action(False, True, False))`,expected:'A single safe, ordered action',tests:`assert next_action(False, True, False) == 'cordon and inspect runtime disk'
assert next_action(True, False, True) == 'drain and quarantine GPU node'
assert next_action(True, False, False) == 'collect scoped evidence'
print('PASS')`,hint:'Order by containment first, then diagnosis; a repeated Xid is a hardware/driver safety signal.',solution:`def next_action(node_ready, disk_pressure, xid_seen):
    if xid_seen:
        return 'drain and quarantine GPU node'
    if not node_ready and disk_pressure:
        return 'cordon and inspect runtime disk'
    return 'collect scoped evidence'`,explanation:'This implements the Volume 7 distinction between mitigation and repair. The correct action depends on blast radius, redundancy, and change control.'},
  {id:'capacity',title:'8 · Size a GPU capacity buffer',prompt:'Calculate a simple allocatable capacity target from demand, failure-domain reserve, and operational headroom.',starter:`def required_gpus(peak: int, reserve: int, headroom: float) -> int:
    return 0

print(required_gpus(64, 8, .15))`,expected:'ceil((peak + reserve) × (1 + headroom))',tests:`assert required_gpus(64, 8, .15) == 83
assert required_gpus(10, 0, 0) == 10
print('PASS')`,hint:'Use math.ceil; validate that counts and headroom are non-negative.',solution:`import math

def required_gpus(peak, reserve, headroom):
    if peak < 0 or reserve < 0 or headroom < 0:
        raise ValueError('capacity inputs cannot be negative')
    return math.ceil((peak + reserve) * (1 + headroom))`,explanation:'This is intentionally a planning baseline. Real capacity work also models GPU SKU, MIG geometry, queueing SLOs, maintenance windows, topology, and demand variance.'},
];

export default function Labs() {
  const [index, setIndex] = useState(0);
  return <Layout title="Senior DevOps labs" description="Executable Python exercises for production operations">
    <main className="pageShell"><header className="pageHeader"><span className="eyebrow">Production Python</span><h1>Senior DevOps engineering labs</h1><p>Eight focused exercises from the curriculum: parse evidence, protect API clients, understand GPU capacity, write safe diagnostics, and turn observations into deliberate operations. Python runs only in a disposable browser worker.</p></header>
      <div className="prompt"><strong>How to practise:</strong> write the smallest deterministic decision first, run its contract tests, then explain which real command or metric would supply each input. The reveal contains one reference implementation—not the only valid design.</div>
      <div className="labLayout"><aside className="scenarioList">{labs.map((lab, i) => <button className={i === index ? 'active' : ''} onClick={() => setIndex(i)} key={lab.id}>{lab.title}</button>)}</aside><PythonPlayground exercise={labs[index]}/></div>
    </main>
  </Layout>;
}
