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
  {id:'subprocess',title:'9 · Classify subprocess failures safely',prompt:'Convert return code, stdout, and stderr from an infrastructure command into a typed operational result. Never use shell=True for interpolated input.',starter:`from dataclasses import dataclass

@dataclass(frozen=True)
class CommandResult:
    ok: bool
    category: str
    detail: str

def classify_command(returncode: int, stdout: str, stderr: str) -> CommandResult:
    return CommandResult(False, 'unknown', '')

print(classify_command(1, '', 'connection timed out'))`,expected:'success, transient, permission, not-found, or permanent classification',tests:`assert classify_command(0, 'node/worker ready', '') == CommandResult(True, 'success', 'node/worker ready')
assert classify_command(1, '', 'connection timed out').category == 'transient'
assert classify_command(13, '', 'permission denied').category == 'permission'
assert classify_command(127, '', 'command not found').category == 'not-found'
print('PASS')`,hint:'Normalize stderr to lowercase. Return useful detail without hiding the original failure.',solution:`def classify_command(returncode, stdout, stderr):
    detail = (stderr or stdout).strip()
    if returncode == 0:
        return CommandResult(True, 'success', detail)
    lowered = detail.lower()
    if 'timed out' in lowered or 'temporarily unavailable' in lowered:
        category = 'transient'
    elif returncode == 13 or 'permission denied' in lowered:
        category = 'permission'
    elif returncode == 127 or 'not found' in lowered:
        category = 'not-found'
    else:
        category = 'permanent'
    return CommandResult(False, category, detail)`,explanation:'The I/O wrapper should call subprocess.run with an argument list, timeout, text mode, and captured output. This pure classifier makes policy testable without executing a command.'},
  {id:'linux-load',title:'10 · Diagnose Linux load without guessing',prompt:'Interpret a vmstat-style snapshot. High load is not automatically high CPU: runnable work and uninterruptible I/O need different actions.',starter:`def diagnose_load(load1: float, cpus: int, run_queue: int, blocked: int, iowait_pct: float) -> str:
    return ''

print(diagnose_load(24, 16, 2, 19, 42.0))`,expected:'cpu-pressure, io-pressure, mixed-pressure, or healthy',tests:`assert diagnose_load(24, 16, 2, 19, 42) == 'io-pressure'
assert diagnose_load(20, 8, 18, 0, 1) == 'cpu-pressure'
assert diagnose_load(20, 8, 14, 8, 35) == 'mixed-pressure'
assert diagnose_load(2, 8, 1, 0, 0) == 'healthy'
print('PASS')`,hint:'Use run_queue versus CPU count for CPU pressure; use blocked tasks plus iowait for I/O pressure.',solution:`def diagnose_load(load1, cpus, run_queue, blocked, iowait_pct):
    if cpus <= 0:
        raise ValueError('cpus must be positive')
    cpu_pressure = run_queue > cpus
    io_pressure = blocked > 0 and iowait_pct >= 10
    if cpu_pressure and io_pressure: return 'mixed-pressure'
    if cpu_pressure: return 'cpu-pressure'
    if io_pressure: return 'io-pressure'
    return 'healthy'`,explanation:'Use this only to rank the next check. Confirm with vmstat, pidstat, pressure stall information, process state/wchan, and storage latency before mitigating.'},
  {id:'xid-correlation',title:'11 · Correlate GPU Xid events',prompt:'Group kernel Xid events by GPU UUID and identify repeated offenders without pretending every Xid has the same remediation.',starter:`def repeated_gpu_faults(events: list[dict], threshold: int = 2) -> dict[str, list[int]]:
    return {}

events = [
    {'uuid':'GPU-a','xid':79}, {'uuid':'GPU-b','xid':31},
    {'uuid':'GPU-a','xid':79}, {'uuid':'GPU-a','xid':48},
]
print(repeated_gpu_faults(events))`,expected:"{'GPU-a': [48, 79]}",tests:`assert repeated_gpu_faults(events) == {'GPU-a': [48, 79]}
assert repeated_gpu_faults([], 1) == {}
print('PASS')`,hint:'Count events per UUID, then return sorted unique Xid codes only for GPUs meeting the threshold.',solution:`from collections import defaultdict

def repeated_gpu_faults(events, threshold=2):
    counts = defaultdict(int)
    codes = defaultdict(set)
    for event in events:
        uuid = event['uuid']
        counts[uuid] += 1
        codes[uuid].add(int(event['xid']))
    return {uuid: sorted(codes[uuid]) for uuid in sorted(counts) if counts[uuid] >= threshold}`,explanation:'Production correlation must preserve timestamps, PCI bus IDs, node/image/driver versions, job IDs, and Xid class. Repetition supports quarantine; remediation still follows NVIDIA guidance for that Xid.'},
  {id:'nccl-ranks',title:'12 · Find a distributed-training straggler',prompt:'Use per-rank step durations to identify a statistically meaningful outlier before blaming NCCL or the network.',starter:`def straggler_ranks(step_ms: dict[int, float], tolerance: float = 1.20) -> list[int]:
    return []

print(straggler_ranks({0:101, 1:99, 2:103, 3:162}))`,expected:'Ranks slower than median × tolerance',tests:`assert straggler_ranks({0:101, 1:99, 2:103, 3:162}) == [3]
assert straggler_ranks({0:100, 1:101, 2:99}) == []
print('PASS')`,hint:'Median is more robust than mean when one rank is already an outlier.',solution:`import statistics

def straggler_ranks(step_ms, tolerance=1.20):
    if not step_ms:
        return []
    baseline = statistics.median(step_ms.values())
    return sorted(rank for rank, duration in step_ms.items() if duration > baseline * tolerance)`,explanation:'Next correlate the rank with node, GPU, NUMA/NIC locality, data-loader time, GPU clocks/errors, and collective traces. A rank outlier is evidence—not yet a root cause.'},
  {id:'inference-slo',title:'13 · Separate TTFT from decode regression',prompt:'Classify an inference SLO regression using queue, prefill, and decode signals instead of one average latency metric.',starter:`def inference_bottleneck(ttft_ms: float, tpot_ms: float, queue_ms: float, baseline: dict) -> str:
    return ''

baseline = {'ttft': 400, 'tpot': 25, 'queue': 50}
print(inference_bottleneck(900, 27, 420, baseline))`,expected:'queue/prefill, decode, end-to-end, or healthy',tests:`assert inference_bottleneck(900, 27, 420, baseline) == 'queue/prefill'
assert inference_bottleneck(420, 60, 55, baseline) == 'decode'
assert inference_bottleneck(900, 60, 300, baseline) == 'end-to-end'
assert inference_bottleneck(420, 26, 55, baseline) == 'healthy'
print('PASS')`,hint:'Treat more than 1.5× baseline as regressed. TTFT plus queue points toward admission/prefill.',solution:`def inference_bottleneck(ttft_ms, tpot_ms, queue_ms, baseline):
    ttft_bad = ttft_ms > baseline['ttft'] * 1.5
    tpot_bad = tpot_ms > baseline['tpot'] * 1.5
    queue_bad = queue_ms > baseline['queue'] * 1.5
    if ttft_bad and tpot_bad: return 'end-to-end'
    if ttft_bad and queue_bad: return 'queue/prefill'
    if tpot_bad: return 'decode'
    return 'healthy'`,explanation:'Segment further by prompt/output length, model, tenant, batch, cache hit, and replica. Tune only after distinguishing admission queue, prefill compute, decode, KV pressure, and dependencies.'},
  {id:'reconcile',title:'14 · Plan a Kubernetes reconciliation',prompt:'Compare desired and observed replica state and emit an idempotent plan rather than imperative trial-and-error.',starter:`def reconciliation_plan(desired: int, ready: int, terminating: int) -> list[str]:
    return []

print(reconciliation_plan(5, 3, 0))`,expected:"['create', 'create']",tests:`assert reconciliation_plan(5, 3, 0) == ['create', 'create']
assert reconciliation_plan(3, 5, 0) == ['delete', 'delete']
assert reconciliation_plan(3, 3, 1) == ['wait']
assert reconciliation_plan(3, 3, 0) == []
print('PASS')`,hint:'Do not create/delete while termination is in flight; a real controller requeues and observes again.',solution:`def reconciliation_plan(desired, ready, terminating):
    if min(desired, ready, terminating) < 0:
        raise ValueError('replica counts cannot be negative')
    if terminating:
        return ['wait']
    delta = desired - ready
    if delta > 0: return ['create'] * delta
    if delta < 0: return ['delete'] * -delta
    return []`,explanation:'Real controllers handle resourceVersion conflicts, expectations, ownership, finalizers, backoff, and partial failure. This lab isolates the desired-versus-observed control-loop idea.'},
  {id:'retry-storm',title:'15 · Detect an API retry storm',prompt:'Analyze client retry telemetry and flag amplification before a struggling dependency is overwhelmed.',starter:`def retry_storm(requests: int, attempts: int, error_rate: float, clients: int) -> dict:
    return {}

print(retry_storm(1000, 2800, .42, 120))`,expected:'retry ratio, amplification factor, and storm boolean',tests:`assert retry_storm(1000, 2800, .42, 120)['storm'] is True
assert retry_storm(1000, 1050, .01, 10)['storm'] is False
print('PASS')`,hint:'attempts includes original requests. A high attempts/requests ratio plus substantial error rate is dangerous.',solution:`def retry_storm(requests, attempts, error_rate, clients):
    if requests <= 0 or attempts < requests or clients < 0 or not 0 <= error_rate <= 1:
        raise ValueError('invalid telemetry')
    amplification = attempts / requests
    retry_ratio = (attempts - requests) / attempts
    return {
        'amplification': round(amplification, 2),
        'retry_ratio': round(retry_ratio, 3),
        'storm': amplification >= 1.5 and error_rate >= .10 and clients >= 20,
    }`,explanation:'Mitigation may require a retry budget, deadline, jitter, concurrency cap, circuit breaker, or load shedding. Coordinate with the dependency owner before shifting load.'},
  {id:'timeline',title:'16 · Build an incident timeline',prompt:'Merge changes, alerts, and symptoms into a stable chronological timeline while preserving source and correlation IDs.',starter:`def incident_timeline(records: list[dict]) -> list[str]:
    return []

records = [
    {'ts':'10:03','source':'alert','message':'TTFT SLO burn'},
    {'ts':'09:58','source':'deploy','message':'batch policy v2'},
]
print(incident_timeline(records))`,expected:'Sorted “timestamp | source | message” lines',tests:`assert incident_timeline(records) == ['09:58 | deploy | batch policy v2', '10:03 | alert | TTFT SLO burn']
assert incident_timeline([]) == []
print('PASS')`,hint:'Return a new list; do not mutate source records. Validate required fields.',solution:`def incident_timeline(records):
    required = {'ts', 'source', 'message'}
    if any(not required.issubset(record) for record in records):
        raise ValueError('timeline record missing required fields')
    ordered = sorted(records, key=lambda record: (record['ts'], record['source']))
    return [f"{record['ts']} | {record['source']} | {record['message']}" for record in ordered]`,explanation:'Production timestamps need timezone and preferably UTC/ISO-8601. Preserve raw evidence separately; the human timeline should link observations to queries, deploy IDs, tickets, and decisions.'},
];

export default function Labs() {
  const [index, setIndex] = useState(0);
  return <Layout title="Senior DevOps labs" description="Executable Python exercises for production operations">
    <main className="pageShell"><header className="pageHeader"><span className="eyebrow">Production Python</span><h1>Senior DevOps engineering labs</h1><p>Sixteen executable challenges spanning production Python, Linux evidence, Kubernetes control loops, GPU faults, NCCL stragglers, inference SLOs, retry storms, capacity, and incident response. Every lab includes tests, a complete reference solution, explanation, and an exact ChatGPT coaching prompt.</p></header>
      <div className="prompt"><strong>How to practise:</strong> write the smallest deterministic decision first, run its contract tests, then explain which real command or metric would supply each input. The reveal contains one reference implementation—not the only valid design.</div>
      <div className="labLayout"><aside className="scenarioList">{labs.map((lab, i) => <button className={i === index ? 'active' : ''} onClick={() => setIndex(i)} key={lab.id}>{lab.title}</button>)}</aside><PythonPlayground exercise={labs[index]}/></div>
    </main>
  </Layout>;
}
