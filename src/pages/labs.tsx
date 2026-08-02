import React, {useState} from 'react';
import Layout from '@theme/Layout';
import PythonPlayground, {type PythonExercise} from '@site/src/components/PythonPlayground';

const labs: PythonExercise[] = [
  {id:'gpu-temp',title:'1 · Classify a GPU temperature reading',prompt:'Write a function that looks at one GPU temperature and says whether it is normal, warm, or hot. This is the simplest possible shape of an operations function: read one number, make a decision, return a word.',starter:`def classify_temp(temp_c: int) -> str:
    # Return 'normal' if below 70, 'warm' if 70-84, 'hot' if 85 or above.
    return ''

print(classify_temp(72))`,expected:"'warm', because 72 falls in the 70-84 range",tests:`assert classify_temp(50) == 'normal'
assert classify_temp(70) == 'warm'
assert classify_temp(85) == 'hot'
print('PASS')`,hint:'Check the lowest threshold first with if, then the middle range with elif, then fall back to hot with else.',solution:`def classify_temp(temp_c):
    if temp_c < 70:
        return 'normal'
    elif temp_c < 85:
        return 'warm'
    else:
        return 'hot'`,explanation:'Every alerting rule you will ever write for GPU fleets starts as exactly this shape: a threshold check that turns a raw sensor number into a category a human or an alert manager can act on. Once this feels easy, later labs just add more inputs to the same decision.'},
  {id:'node-health-count',title:'2 · Count how many nodes in a fleet are healthy',prompt:'Given a list of node statuses, count how many say "healthy" by walking through the list yourself with a loop and a counter. This is the pattern behind almost every fleet-health summary you will ever build.',starter:`def count_healthy(statuses: list) -> int:
    # Return how many entries in statuses equal 'healthy'.
    return 0

print(count_healthy(['healthy', 'healthy', 'degraded', 'healthy']))`,expected:'3',tests:`assert count_healthy(['healthy', 'healthy', 'degraded', 'healthy']) == 3
assert count_healthy(['degraded', 'offline']) == 0
assert count_healthy([]) == 0
print('PASS')`,hint:'Start a counter at 0 before the loop, and add 1 to it every time you see a healthy status inside the loop.',solution:`def count_healthy(statuses):
    count = 0
    for status in statuses:
        if status == 'healthy':
            count += 1
    return count`,explanation:'This loop-and-counter pattern is the manual version of what dashboards do constantly: turning a long list of raw states into one number someone can glance at. Later you will meet shortcuts like .count(), but doing it by hand first means you actually understand what the shortcut is doing.'},
  {id:'fault-report',title:'3 · Build a simple status report from a dict',prompt:'Given a dictionary mapping GPU names to their status, return just the names that are broken. Dictionaries are how most real infrastructure data arrives, so getting comfortable looping over one now will pay off immediately.',starter:`def find_faults(fleet: dict) -> list:
    # fleet maps a GPU name to its status, e.g. {'gpu-1': 'ok', 'gpu-2': 'fault'}.
    # Return a list of just the names whose status is 'fault'.
    return []

print(find_faults({'gpu-1': 'ok', 'gpu-2': 'fault', 'gpu-3': 'ok'}))`,expected:"['gpu-2']",tests:`assert find_faults({'gpu-1': 'ok', 'gpu-2': 'fault', 'gpu-3': 'ok'}) == ['gpu-2']
assert find_faults({'gpu-1': 'ok'}) == []
assert find_faults({}) == []
print('PASS')`,hint:'Use fleet.items() in your for loop to get both the name and the status on each pass, then check the status.',solution:`def find_faults(fleet):
    faulty = []
    for name, status in fleet.items():
        if status == 'fault':
            faulty.append(name)
    return faulty`,explanation:'This is the exact shape of a "which of my GPUs need attention" report. Real monitoring tools store health data as dictionaries keyed by device name, so looping with .items() to pick out the ones that need attention is a skill you will reuse constantly.'},
  {id:'lowercase-gpus',title:'4 · Convert a list of GPU names to lowercase, safely',prompt:'Given a list of GPU names with inconsistent capitalization, return a new list where every name is lowercase. Inconsistent casing is a very common source of bugs when matching names across systems.',starter:`def lowercase_all(names: list) -> list:
    # Return a new list with every name lowercased.
    return []

print(lowercase_all(['GPU-A', 'gpu-b', 'Gpu-C']))`,expected:"['gpu-a', 'gpu-b', 'gpu-c']",tests:`assert lowercase_all(['GPU-A', 'gpu-b', 'Gpu-C']) == ['gpu-a', 'gpu-b', 'gpu-c']
assert lowercase_all([]) == []
assert lowercase_all(['SINGLE']) == ['single']
print('PASS')`,hint:'Create an empty list before the loop, then for each name call .lower() on it and append the result to that list.',solution:`def lowercase_all(names):
    result = []
    for name in names:
        result.append(name.lower())
    return result`,explanation:'Two systems rarely agree on capitalization for the same device name, so normalizing case before comparing or storing names avoids silent mismatches. This lab deliberately builds the new list by hand with append; once this feels natural, list comprehensions (used in the labs ahead) are just a shorter way to write this exact same loop.'},
  {id:'split-node-line',title:'5 · Parse one simple space-separated line without regex',prompt:'Given one line of text like a hostname, a status, and a temperature separated by spaces, pull out the three fields using .split() and return them as a dictionary. No regex needed yet — just splitting on whitespace.',starter:`def parse_line(line: str) -> dict:
    # line looks like "node-04 online 62": hostname, status, temperature.
    # Return {'host': ..., 'status': ..., 'temp': ...} with temp as an int.
    return {}

print(parse_line("node-04 online 62"))`,expected:"{'host': 'node-04', 'status': 'online', 'temp': 62}",tests:`assert parse_line("node-04 online 62") == {'host': 'node-04', 'status': 'online', 'temp': 62}
assert parse_line("node-11 offline 0") == {'host': 'node-11', 'status': 'offline', 'temp': 0}
result = parse_line("gpu-a warm 85")
assert result['temp'] == 85 and isinstance(result['temp'], int)
print('PASS')`,hint:'Calling .split() with no arguments splits on any whitespace and gives you a list of three pieces in order.',solution:`def parse_line(line):
    parts = line.split()
    host = parts[0]
    status = parts[1]
    temp = int(parts[2])
    return {'host': host, 'status': status, 'temp': temp}`,explanation:'Plenty of real log and status lines are this simple: fixed fields separated by spaces, no punctuation to worry about. .split() handles that fine. The next tier up replaces .split() with regex once your data gets messier than fixed positions — extra fields, optional sections, or punctuation mixed in — but you do not need that complexity yet.'},
  {id:'safe-memory-pct',title:'6 · Try dividing GPU memory usage without crashing on bad input',prompt:'Given how much GPU memory is used and the total available, calculate the percentage used — but if the total is zero, catch the error instead of letting your program crash, and return 0.0 instead.',starter:`def memory_used_pct(used_mb: int, total_mb: int) -> float:
    # Return the percentage of memory used. If total_mb is 0, return 0.0 instead of crashing.
    return 0.0

print(memory_used_pct(4096, 16384))`,expected:'25.0, and 0.0 when total_mb is 0 instead of crashing',tests:`assert memory_used_pct(4096, 16384) == 25.0
assert memory_used_pct(0, 0) == 0.0
assert memory_used_pct(8192, 8192) == 100.0
print('PASS')`,hint:'Put the division inside a try block, and catch ZeroDivisionError to return 0.0 instead of letting it crash your program.',solution:`def memory_used_pct(used_mb, total_mb):
    try:
        return (used_mb / total_mb) * 100
    except ZeroDivisionError:
        return 0.0`,explanation:'This is your first try/except, and it matters for a real reason: infrastructure code often reports on hundreds of devices, and one device with a total of 0 (maybe it just has not reported in yet) should not crash the whole report. Returning a safe default and moving on is usually better than crashing everything for one bad data point — you can always log it separately and investigate.'},
  {id:'regex',title:'7 · Parse a kubelet incident log',prompt:'Turn raw kubelet evidence into a typed record. Reject malformed input: ambiguous parsing is unsafe during an incident.',starter:`import re

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
  {id:'retry',title:'8 · Retry only transient API failures',prompt:'Produce a deterministic retry decision for an API client. A retry without a deadline or classification can amplify an outage.',starter:`RETRYABLE = {429, 500, 502, 503, 504}

def retry_plan(statuses: list[int], max_attempts: int = 3) -> list[int]:
    # Return retryable statuses, up to max_attempts.
    return []

print(retry_plan([503, 401, 429, 500]))`,expected:'[503, 429, 500]',tests:`assert retry_plan([503, 401, 429, 500]) == [503, 429, 500]
assert retry_plan([404, 409]) == []
assert retry_plan([500, 503, 429, 504], 2) == [500, 503]
print('PASS')`,hint:'Separate classification from sleeping and I/O. 401/403/404 require a decision, not an automatic retry.',solution:`def retry_plan(statuses, max_attempts=3):
    return [status for status in statuses if status in RETRYABLE][:max_attempts]`,explanation:'In a real client, combine this pure decision with a total deadline, idempotency awareness, exponential backoff, jitter, and `Retry-After` handling.'},
  {id:'gpu',title:'9 · Normalize GPU inventory',prompt:'Convert nvidia-smi CSV output to immutable records. Inventory is a boundary: command text must not leak into placement decisions.',starter:`from dataclasses import dataclass

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
  {id:'oom',title:'10 · Detect cgroup memory risk',prompt:'Classify containers before an OOMKill. Use the limit—not node free memory—as the container safety boundary.',starter:`def memory_risk(working_set_mib: int, limit_mib: int) -> str:
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
  {id:'scheduling',title:'11 · Explain an unschedulable GPU Pod',prompt:'Turn scheduler event fragments into a ranked, human-readable diagnosis. Prefer specific constraints over a generic “Pending” message.',starter:`def scheduling_diagnosis(events: list[str]) -> list[str]:
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
  {id:'prometheus',title:'12 · Guard a Prometheus query',prompt:'Reject a dangerous unbounded query shape before it becomes a high-cardinality incident.',starter:`def query_guard(query: str) -> str:
    # Return safe or review.
    return ''

print(query_guard('sum(rate(http_requests_total[5m]))'))`,expected:'review for wildcard/regex selectors or a missing range selector',tests:`assert query_guard('sum(rate(http_requests_total[5m]))') == 'safe'
assert query_guard('rate(http_requests_total{pod=~".*"}[5m])') == 'review'
assert query_guard('http_requests_total') == 'review'
print('PASS')`,hint:'This deliberately small guard is a teaching aid, not a PromQL parser.',solution:`def query_guard(query):
    if '=~".*"' in query or '[' not in query or ']' not in query:
        return 'review'
    return 'safe'`,explanation:'Senior observability work treats cardinality and query cost as reliability concerns. Inspect labels, bounded time windows, and recording rules.'},
  {id:'runbook',title:'13 · Turn evidence into a safe action',prompt:'Choose the least-destructive action from an incident state. Do not restart a node before preserving the evidence needed to prove the cause.',starter:`def next_action(node_ready: bool, disk_pressure: bool, xid_seen: bool) -> str:
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
  {id:'capacity',title:'14 · Size a GPU capacity buffer',prompt:'Calculate a simple allocatable capacity target from demand, failure-domain reserve, and operational headroom.',starter:`def required_gpus(peak: int, reserve: int, headroom: float) -> int:
    return 0

print(required_gpus(64, 8, .15))`,expected:'ceil((peak + reserve) × (1 + headroom))',tests:`assert required_gpus(64, 8, .15) == 83
assert required_gpus(10, 0, 0) == 10
print('PASS')`,hint:'Use math.ceil; validate that counts and headroom are non-negative.',solution:`import math

def required_gpus(peak, reserve, headroom):
    if peak < 0 or reserve < 0 or headroom < 0:
        raise ValueError('capacity inputs cannot be negative')
    return math.ceil((peak + reserve) * (1 + headroom))`,explanation:'This is intentionally a planning baseline. Real capacity work also models GPU SKU, MIG geometry, queueing SLOs, maintenance windows, topology, and demand variance.'},
  {id:'subprocess',title:'15 · Classify subprocess failures safely',prompt:'Convert return code, stdout, and stderr from an infrastructure command into a typed operational result. Never use shell=True for interpolated input.',starter:`from dataclasses import dataclass

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
  {id:'linux-load',title:'16 · Diagnose Linux load without guessing',prompt:'Interpret a vmstat-style snapshot. High load is not automatically high CPU: runnable work and uninterruptible I/O need different actions.',starter:`def diagnose_load(load1: float, cpus: int, run_queue: int, blocked: int, iowait_pct: float) -> str:
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
  {id:'xid-correlation',title:'17 · Correlate GPU Xid events',prompt:'Group kernel Xid events by GPU UUID and identify repeated offenders without pretending every Xid has the same remediation.',starter:`def repeated_gpu_faults(events: list[dict], threshold: int = 2) -> dict[str, list[int]]:
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
  {id:'nccl-ranks',title:'18 · Find a distributed-training straggler',prompt:'Use per-rank step durations to identify a statistically meaningful outlier before blaming NCCL or the network.',starter:`def straggler_ranks(step_ms: dict[int, float], tolerance: float = 1.20) -> list[int]:
    return []

print(straggler_ranks({0:101, 1:99, 2:103, 3:162}))`,expected:'Ranks slower than median × tolerance',tests:`assert straggler_ranks({0:101, 1:99, 2:103, 3:162}) == [3]
assert straggler_ranks({0:100, 1:101, 2:99}) == []
print('PASS')`,hint:'Median is more robust than mean when one rank is already an outlier.',solution:`import statistics

def straggler_ranks(step_ms, tolerance=1.20):
    if not step_ms:
        return []
    baseline = statistics.median(step_ms.values())
    return sorted(rank for rank, duration in step_ms.items() if duration > baseline * tolerance)`,explanation:'Next correlate the rank with node, GPU, NUMA/NIC locality, data-loader time, GPU clocks/errors, and collective traces. A rank outlier is evidence—not yet a root cause.'},
  {id:'inference-slo',title:'19 · Separate TTFT from decode regression',prompt:'Classify an inference SLO regression using queue, prefill, and decode signals instead of one average latency metric.',starter:`def inference_bottleneck(ttft_ms: float, tpot_ms: float, queue_ms: float, baseline: dict) -> str:
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
  {id:'reconcile',title:'20 · Plan a Kubernetes reconciliation',prompt:'Compare desired and observed replica state and emit an idempotent plan rather than imperative trial-and-error.',starter:`def reconciliation_plan(desired: int, ready: int, terminating: int) -> list[str]:
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
  {id:'retry-storm',title:'21 · Detect an API retry storm',prompt:'Analyze client retry telemetry and flag amplification before a struggling dependency is overwhelmed.',starter:`def retry_storm(requests: int, attempts: int, error_rate: float, clients: int) -> dict:
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
  {id:'timeline',title:'22 · Build an incident timeline',prompt:'Merge changes, alerts, and symptoms into a stable chronological timeline while preserving source and correlation IDs.',starter:`def incident_timeline(records: list[dict]) -> list[str]:
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
  {id:'bmc-sensors',title:'23 · Classify BMC sensor health from a Redfish/IPMI sweep',prompt:'Turn a raw `sensor list` sweep into a single health verdict before paging anyone. A discrete PSU sensor reading 0 is not “temperature zero”—misreading it sends someone chasing the wrong fault.',starter:`def node_health(sensors: list[dict]) -> str:
    # Each sensor is either {'type':'threshold','reading':..,'unc':..,'ucr':..}
    # or {'type':'discrete','value':..}. 0x0180 is the only healthy discrete bitmap.
    return ''

sample = [
    {'name':'CPU1 Temp','type':'threshold','reading':70,'unc':92,'ucr':95},
    {'name':'PSU1 Status','type':'discrete','value':0x0180},
    {'name':'PSU2 Status','type':'discrete','value':0},
]
print(node_health(sample))`,expected:"'critical', because PSU2's discrete bitmap 0x0 means no AC input, not a zero reading",tests:`ok = [{'name':'CPU1 Temp','type':'threshold','reading':70,'unc':92,'ucr':95}, {'name':'PSU1 Status','type':'discrete','value':0x0180}, {'name':'PSU2 Status','type':'discrete','value':0x0180}]
assert node_health(ok) == 'healthy'
psu_fault = [{'name':'CPU1 Temp','type':'threshold','reading':70,'unc':92,'ucr':95}, {'name':'PSU1 Status','type':'discrete','value':0x0180}, {'name':'PSU2 Status','type':'discrete','value':0}]
assert node_health(psu_fault) == 'critical'
warn = [{'name':'CPU2 Temp','type':'threshold','reading':93,'unc':92,'ucr':95}, {'name':'PSU1 Status','type':'discrete','value':0x0180}, {'name':'PSU2 Status','type':'discrete','value':0x0180}]
assert node_health(warn) == 'warning'
print('PASS')`,hint:'Decode discrete sensors by exact bitmap match, never by numeric comparison; threshold sensors compare reading against unc/ucr.',solution:`def node_health(sensors):
    statuses = []
    for sensor in sensors:
        if sensor['type'] == 'discrete':
            statuses.append('healthy' if sensor['value'] == 0x0180 else 'critical')
        else:
            reading, unc, ucr = sensor['reading'], sensor['unc'], sensor['ucr']
            if reading >= ucr:
                statuses.append('critical')
            elif reading >= unc:
                statuses.append('warning')
            else:
                statuses.append('healthy')
    if 'critical' in statuses:
        return 'critical'
    if 'warning' in statuses:
        return 'warning'
    return 'healthy'`,explanation:'The next real step is `ipmitool sensor list` plus the SDR to confirm the bitmap decode, then check the PDU/breaker feeding that PSU before assuming a server-side fault.'},
  {id:'firmware-drift',title:'24 · Detect firmware baseline drift across a fleet',prompt:'Compare installed component versions against the qualified baseline manifest before a coordinated change window opens. A node one revision behind is a normal backlog item; three revisions behind on BMC firmware is a blocker.',starter:`def firmware_drift(installed: dict[str, dict[str, str]], baseline: dict[str, str]) -> list[str]:
    # installed: {node: {component: version}}. Return "node/component: installed < baseline"
    # for every component below baseline, sorted by node then component.
    return []

installed = {'gpu-node-02': {'bios':'1.2.0','bmc':'2.16.0'}, 'gpu-node-01': {'bios':'1.3.0','bmc':'2.14.3'}}
baseline = {'bios':'1.3.0','bmc':'2.16.0'}
print(firmware_drift(installed, baseline))`,expected:"['gpu-node-01/bmc: 2.14.3 < 2.16.0', 'gpu-node-02/bios: 1.2.0 < 1.3.0']",tests:`installed = {'gpu-node-02': {'bios':'1.2.0','bmc':'2.16.0'}, 'gpu-node-01': {'bios':'1.3.0','bmc':'2.14.3'}}
baseline = {'bios':'1.3.0','bmc':'2.16.0'}
assert firmware_drift(installed, baseline) == ['gpu-node-01/bmc: 2.14.3 < 2.16.0', 'gpu-node-02/bios: 1.2.0 < 1.3.0']
assert firmware_drift({'gpu-node-03': {'bios':'1.3.0'}}, baseline) == []
assert firmware_drift({'gpu-node-04': {'nic':'22.35.1012'}}, baseline) == []
print('PASS')`,hint:'Compare dotted version strings as tuples of ints, not lexicographically, and skip components absent from the baseline.',solution:`def parse_version(v):
    return tuple(int(part) for part in v.split('.'))

def firmware_drift(installed, baseline):
    drift = []
    for node in sorted(installed):
        for component in sorted(installed[node]):
            if component not in baseline:
                continue
            if parse_version(installed[node][component]) < parse_version(baseline[component]):
                drift.append(f"{node}/{component}: {installed[node][component]} < {baseline[component]}")
    return drift`,explanation:'This is the read-only half of change management; pair it with the compatibility matrix from Volume 10 before deciding which nodes are safe to include in a canary wave.'},
  {id:'ansible-idempotency',title:'25 · Spot false idempotency in an Ansible --check --diff run',prompt:'Classify repeated `--check --diff` results per module before trusting “changed” as a signal. A module reporting changed=True every run on a semantically identical diff is noise that will bury the one node with a real drift.',starter:`def classify_idempotency(runs: dict[str, list[tuple[bool, str]]]) -> dict[str, str]:
    # runs: {module: [(changed, diff_or_None), ...]} across consecutive check runs.
    # Return 'idempotent', 'false-idempotency', or 'real-drift' per module.
    return {}

runs = {
    'ntp_config': [(True, 'server=ntp1,timeout=5'), (True, 'timeout=5,server=ntp1'), (True, 'server=ntp1,timeout=5')],
    'kernel_module': [(True, 'state=absent'), (False, None), (False, None)],
    'motd': [(False, None), (False, None)],
}
print(classify_idempotency(runs))`,expected:"{'ntp_config': 'false-idempotency', 'kernel_module': 'real-drift', 'motd': 'idempotent'}",tests:`runs = {
    'ntp_config': [(True, 'server=ntp1,timeout=5'), (True, 'timeout=5,server=ntp1'), (True, 'server=ntp1,timeout=5')],
    'kernel_module': [(True, 'state=absent'), (False, None), (False, None)],
    'motd': [(False, None), (False, None)],
}
result = classify_idempotency(runs)
assert result['ntp_config'] == 'false-idempotency'
assert result['kernel_module'] == 'real-drift'
assert result['motd'] == 'idempotent'
print('PASS')`,hint:'Normalize each diff (e.g. split and sort its key=value pairs) before comparing runs for sameness; a reordered diff is not a new diff.',solution:`def normalize_diff(diff):
    if diff is None:
        return None
    return sorted(part.strip() for part in diff.split(','))

def classify_idempotency(runs):
    result = {}
    for module, entries in runs.items():
        changed_flags = [changed for changed, _ in entries]
        diffs = [normalize_diff(diff) for _, diff in entries]
        if not any(changed_flags):
            result[module] = 'idempotent'
        elif all(changed_flags) and all(diff == diffs[0] for diff in diffs):
            result[module] = 'false-idempotency'
        else:
            result[module] = 'real-drift'
    return result`,explanation:'A real fix replaces the offending module invocation (often a raw `command`/`shell` task) with an idempotent module; this classifier just tells you which resource to inspect first.'},
  {id:'terraform-risk',title:'26 · Classify Terraform plan risk before apply',prompt:'Reduce a `terraform plan` action list to one risk verdict so a reviewer knows whether to read every line or just skim it. A `-/+` destroy-and-recreate or a bare `-` outweighs any number of plain creates.',starter:`def plan_risk(actions: list[str]) -> str:
    # Each action looks like "+ create", "~ update in-place", "-/+ destroy and re-create", "- destroy".
    # Return 'safe', 'review', or 'dangerous'.
    return ''

print(plan_risk(['+ create', '~ update in-place', '-/+ destroy and re-create']))`,expected:"'dangerous', because a -/+ action outweighs the create and update in the same plan",tests:`assert plan_risk(['+ create', '+ create']) == 'safe'
assert plan_risk(['+ create', '~ update in-place']) == 'review'
assert plan_risk(['~ update in-place', '-/+ destroy and re-create']) == 'dangerous'
assert plan_risk(['+ create', '- destroy']) == 'dangerous'
assert plan_risk([]) == 'safe'
print('PASS')`,hint:'Score each action by its worst-case symbol, then take the maximum across the whole plan; do not average.',solution:`def plan_risk(actions):
    if not actions:
        return 'safe'
    weights = []
    for action in actions:
        if action.startswith('-/+') or action.startswith('- '):
            weights.append(2)
        elif action.startswith('~'):
            weights.append(1)
        elif action.startswith('+'):
            weights.append(0)
        else:
            raise ValueError(f'unknown plan action: {action!r}')
    worst = max(weights)
    if worst >= 2:
        return 'dangerous'
    if worst == 1:
        return 'review'
    return 'safe'`,explanation:'Treat this as a merge-gate signal only; still read the actual resource addresses in a dangerous plan—a destroy on a stateful resource (a volume, a DNS record) needs a human decision, not just a risk label.'},
  {id:'slurm-fairshare',title:'27 · Flag Slurm fairshare starvation risk versus a normal burst',prompt:'Distinguish an account that is sustainably over its allocated share—the kind of misconfiguration that quietly starves everyone else for weeks—from a single busy day that self-corrects.',starter:`def fairshare_status(allocated_share: float, usage_by_day: list[float]) -> str:
    # allocated_share and each usage_by_day entry are fractions of total cluster GPU-hours.
    # Return 'starvation-risk', 'normal-burst', or 'within-share'.
    return ''

print(fairshare_status(0.20, [0.30, 0.32, 0.29, 0.31, 0.30]))`,expected:"'starvation-risk' when every day is well over the allocated share, not just one",tests:`assert fairshare_status(0.20, [0.30, 0.32, 0.29, 0.31, 0.30]) == 'starvation-risk'
assert fairshare_status(0.20, [0.19, 0.20, 0.55, 0.18, 0.20]) == 'normal-burst'
assert fairshare_status(0.20, [0.18, 0.19, 0.20, 0.21, 0.19]) == 'within-share'
try: fairshare_status(0.20, [])
except ValueError: pass
else: raise AssertionError('must reject empty usage history')
print('PASS')`,hint:'Compute a usage/allocated ratio per day; sustained means every ratio crosses the threshold, a burst means only the max does.',solution:`def fairshare_status(allocated_share, usage_by_day):
    if not usage_by_day:
        raise ValueError('usage history is required')
    ratios = [usage / allocated_share for usage in usage_by_day]
    if all(ratio >= 1.4 for ratio in ratios):
        return 'starvation-risk'
    if max(ratios) >= 1.4:
        return 'normal-burst'
    return 'within-share'`,explanation:'Confirm with `sshare -l`: FairShare near 1.0 for the flagged account alongside near-0.2 for peers means the allocated share itself is miscalibrated, which `sacctmgr modify account ... set fairshare=` fixes—this function only tells you where to look.'},
  {id:'mpi-ranks',title:'28 · Validate an MPI/PMIx launch against expected rank layout',prompt:'Diff observed “Hello from rank” output against the expected per-node rank layout before assuming a hung job is a NCCL problem—half the ranks may simply never have launched.',starter:`import re

def missing_ranks(expected: dict[str, list[int]], observed: list[str]) -> dict[str, list[int]]:
    # expected: {node: [rank, ...]}. observed lines look like "Hello from rank 3 on node gpu-a".
    # Return {node: [missing ranks]} only for nodes with at least one missing rank.
    return {}

expected = {'node-a': [0, 1, 2, 3], 'node-b': [4, 5, 6, 7]}
observed = ['Hello from rank 0 on node node-a', 'Hello from rank 1 on node node-a', 'Hello from rank 3 on node node-a',
            'Hello from rank 4 on node node-b', 'Hello from rank 5 on node node-b', 'Hello from rank 6 on node node-b', 'Hello from rank 7 on node node-b']
print(missing_ranks(expected, observed))`,expected:"{'node-a': [2]}",tests:`expected = {'node-a': [0, 1, 2, 3], 'node-b': [4, 5, 6, 7]}
observed = ['Hello from rank 0 on node node-a', 'Hello from rank 1 on node node-a', 'Hello from rank 3 on node node-a',
            'Hello from rank 4 on node node-b', 'Hello from rank 5 on node node-b', 'Hello from rank 6 on node node-b', 'Hello from rank 7 on node node-b']
assert missing_ranks(expected, observed) == {'node-a': [2]}
assert missing_ranks(expected, observed + ['Hello from rank 2 on node node-a']) == {}
assert missing_ranks({'node-c': [8, 9]}, []) == {'node-c': [8, 9]}
print('PASS')`,hint:'Parse each line with a strict regex into (rank, node) pairs, build a set of seen ranks per node, then set-subtract from expected.',solution:`def missing_ranks(expected, observed):
    seen = {}
    for line in observed:
        match = re.fullmatch(r'Hello from rank (\\d+) on node (\\S+)', line)
        if not match:
            continue
        seen.setdefault(match.group(2), set()).add(int(match.group(1)))
    result = {}
    for node, ranks in expected.items():
        missing = sorted(set(ranks) - seen.get(node, set()))
        if missing:
            result[node] = missing
    return result`,explanation:'Missing ranks concentrated on one node points at that node—PMIx launch failure, SSH/hostfile issue, or a GRES/cgroup binding rejection—rather than a collective-communication bug; correlate with the launcher exit code before touching NCCL.'},
  {id:'enroot-gpu',title:'29 · Diagnose why GPUs are not visible inside an Enroot/Pyxis container',prompt:'Given the exact launch configuration, name the single specific missing piece—not a generic “check your container setup”—so the fix is one command, not a debugging session.',starter:`def diagnose_gpu_visibility(config: dict) -> str:
    # config keys: visible_devices_env (str|None), cdi_spec_present (bool), driver_mount_present (bool)
    return ''

print(diagnose_gpu_visibility({'visible_devices_env': None, 'cdi_spec_present': True, 'driver_mount_present': True}))`,expected:'A specific cause: missing env var, missing CDI spec, or missing driver mount—checked in that order',tests:`assert diagnose_gpu_visibility({'visible_devices_env': None, 'cdi_spec_present': True, 'driver_mount_present': True}) == 'NVIDIA_VISIBLE_DEVICES not set or empty'
assert diagnose_gpu_visibility({'visible_devices_env': 'all', 'cdi_spec_present': False, 'driver_mount_present': True}) == 'CDI spec file missing'
assert diagnose_gpu_visibility({'visible_devices_env': 'all', 'cdi_spec_present': True, 'driver_mount_present': False}) == 'container-mounts missing the NVIDIA driver path'
assert diagnose_gpu_visibility({'visible_devices_env': 'all', 'cdi_spec_present': True, 'driver_mount_present': True}) == 'configuration looks correct, check nvidia-smi inside the container'
print('PASS')`,hint:'Check the most fundamental prerequisite first: an unset visibility env var makes CDI and mount configuration irrelevant.',solution:`def diagnose_gpu_visibility(config):
    env = config.get('visible_devices_env')
    if not env or env == 'none':
        return 'NVIDIA_VISIBLE_DEVICES not set or empty'
    if not config.get('cdi_spec_present', True):
        return 'CDI spec file missing'
    if not config.get('driver_mount_present', True):
        return 'container-mounts missing the NVIDIA driver path'
    return 'configuration looks correct, check nvidia-smi inside the container'`,explanation:'Once the pure diagnosis narrows the cause, confirm live with `enroot start --root ... nvidia-smi` and `nvidia-ctk cdi generate` output rather than trusting the launch flags alone.'},
  {id:'canary-check',title:'30 · Check whether a canary wave actually represents the fleet',prompt:'A canary that passes every gate item is only evidence about the hardware/firmware combinations it contains. Find exactly which combinations in the fleet the proposed canary group does not cover before it ships to wave two.',starter:`def canary_representativeness(fleet_combos: list[tuple], canary_combos: list[tuple]) -> dict:
    # combos look like ('ConnectX-7', 'fw-22.35'). Return {'representative': bool, 'missing': [...]}.
    return {}

fleet = [('ConnectX-6', 'fw-20.1'), ('ConnectX-7', 'fw-22.35'), ('ConnectX-7', 'fw-22.36')]
canary = [('ConnectX-6', 'fw-20.1'), ('ConnectX-6', 'fw-20.1')]
print(canary_representativeness(fleet, canary))`,expected:"{'representative': False, 'missing': [('ConnectX-7', 'fw-22.35'), ('ConnectX-7', 'fw-22.36')]}",tests:`fleet = [('ConnectX-6', 'fw-20.1'), ('ConnectX-7', 'fw-22.35'), ('ConnectX-7', 'fw-22.36')]
canary = [('ConnectX-6', 'fw-20.1'), ('ConnectX-6', 'fw-20.1')]
result = canary_representativeness(fleet, canary)
assert result == {'representative': False, 'missing': [('ConnectX-7', 'fw-22.35'), ('ConnectX-7', 'fw-22.36')]}
full_canary = fleet + [('ConnectX-6', 'fw-20.1')]
assert canary_representativeness(fleet, full_canary) == {'representative': True, 'missing': []}
print('PASS')`,hint:'Reduce both lists to sets of distinct combinations first; representativeness is a set-coverage question, not a count question.',solution:`def canary_representativeness(fleet_combos, canary_combos):
    fleet_set = set(fleet_combos)
    canary_set = set(canary_combos)
    missing = sorted(fleet_set - canary_set)
    return {'representative': len(missing) == 0, 'missing': missing}`,explanation:'This is the exact “canary passed but 20% of the fleet had different NIC firmware” failure mode—stratify canary node selection by NIC model, firmware revision, and GPU SKU explicitly, not by whichever nodes happened to be idle.'},
  {id:'access-log-summary',title:'31 · Summarize HTTP access logs for an incident',prompt:'Parse structured access-log lines and return request count, error rate, and the slowest route. Reject malformed records instead of silently corrupting incident evidence.',starter:`def summarize_access_logs(lines: list[str]) -> dict:
    # Format: timestamp method path status latency_ms
    return {}

logs = [
    '2026-08-02T10:00:00Z GET /api/orders 200 120',
    '2026-08-02T10:00:01Z GET /api/orders 503 920',
    '2026-08-02T10:00:02Z POST /api/payments 201 240',
]
print(summarize_access_logs(logs))`,expected:"{'requests': 3, 'error_rate': 0.333, 'slowest_route': '/api/orders'}",tests:`result = summarize_access_logs(logs)
assert result == {'requests': 3, 'error_rate': 0.333, 'slowest_route': '/api/orders'}
assert summarize_access_logs([]) == {'requests': 0, 'error_rate': 0.0, 'slowest_route': None}
try: summarize_access_logs(['broken line'])
except ValueError: pass
else: raise AssertionError('malformed input must fail')
print('PASS')`,hint:'Split into exactly five fields, convert status and latency to integers, count status >= 500, and track maximum latency.',solution:`def summarize_access_logs(lines):
    errors = 0
    slowest = None
    slowest_ms = -1
    for line in lines:
        parts = line.split()
        if len(parts) != 5:
            raise ValueError(f'invalid access log: {line!r}')
        _, _, path, status_text, latency_text = parts
        try:
            status, latency = int(status_text), int(latency_text)
        except ValueError as exc:
            raise ValueError(f'invalid numeric field: {line!r}') from exc
        errors += status >= 500
        if latency > slowest_ms:
            slowest, slowest_ms = path, latency
    total = len(lines)
    return {'requests': total, 'error_rate': round(errors / total, 3) if total else 0.0, 'slowest_route': slowest}`,explanation:'In production, stream rather than load an unbounded file, preserve correlation IDs, distinguish upstream from application status, and compute latency distributions per route. The interview signal is a strict parsing boundary plus explicit empty-input behavior.'},
  {id:'latency-percentile',title:'32 · Calculate a latency percentile without hiding tail risk',prompt:'Implement nearest-rank percentile calculation so an SRE report can show p50, p95, and p99 instead of an average that hides slow requests.',starter:`def percentile(values: list[float], percentile_value: float) -> float:
    return 0.0

samples = [10, 20, 30, 40, 50, 1000]
print(percentile(samples, 95))`,expected:'1000 using the nearest-rank definition',tests:`assert percentile([10, 20, 30, 40, 50, 1000], 95) == 1000
assert percentile([4, 1, 3, 2], 50) == 2
assert percentile([7], 99) == 7
try: percentile([], 95)
except ValueError: pass
else: raise AssertionError('empty samples must fail')
print('PASS')`,hint:'Sort a copy. Nearest-rank index is ceil(p/100 × n) - 1, clamped to the valid range.',solution:`import math

def percentile(values, percentile_value):
    if not values:
        raise ValueError('at least one sample is required')
    if not 0 < percentile_value <= 100:
        raise ValueError('percentile must be in (0, 100]')
    ordered = sorted(values)
    index = math.ceil(percentile_value / 100 * len(ordered)) - 1
    return ordered[index]`,explanation:'Real telemetry systems use well-defined histogram/quantile semantics and sufficient sample windows. State the definition in an interview: percentile implementations differ, and averaging per-instance p95 values is invalid.'},
  {id:'alert-dedup',title:'33 · Deduplicate alerts into incidents',prompt:'Group repeated alerts by stable identity while retaining first seen, last seen, count, and highest severity. Do not deduplicate on volatile annotations.',starter:`def deduplicate_alerts(alerts: list[dict]) -> list[dict]:
    # Stable key: service + alertname + region.
    return []

alerts = [
    {'service':'api','alertname':'HighErrors','region':'eu','severity':'warning','ts':10},
    {'service':'api','alertname':'HighErrors','region':'eu','severity':'critical','ts':14},
    {'service':'worker','alertname':'QueueLag','region':'eu','severity':'warning','ts':12},
]
print(deduplicate_alerts(alerts))`,expected:'Two deterministic incident summaries ordered by first_seen',tests:`result = deduplicate_alerts(alerts)
assert result[0] == {'key': ('api', 'HighErrors', 'eu'), 'first_seen': 10, 'last_seen': 14, 'count': 2, 'severity': 'critical'}
assert result[1]['count'] == 1
assert deduplicate_alerts([]) == []
print('PASS')`,hint:'Use a dictionary keyed by a tuple. Define an explicit severity ordering rather than comparing strings.',solution:`def deduplicate_alerts(alerts):
    severity_rank = {'info': 0, 'warning': 1, 'critical': 2}
    incidents = {}
    for alert in alerts:
        key = (alert['service'], alert['alertname'], alert['region'])
        if key not in incidents:
            incidents[key] = {'key': key, 'first_seen': alert['ts'], 'last_seen': alert['ts'], 'count': 0, 'severity': alert['severity']}
        item = incidents[key]
        item['first_seen'] = min(item['first_seen'], alert['ts'])
        item['last_seen'] = max(item['last_seen'], alert['ts'])
        item['count'] += 1
        if severity_rank[alert['severity']] > severity_rank[item['severity']]:
            item['severity'] = alert['severity']
    return sorted(incidents.values(), key=lambda item: (item['first_seen'], item['key']))`,explanation:'Alertmanager fingerprinting, grouping windows and inhibition are richer versions of this model. Good deduplication reduces page volume without erasing duration or severity escalation.'},
  {id:'slo-burn',title:'34 · Calculate SLO error-budget burn rate',prompt:'Given good and total events plus an SLO target, calculate burn rate and classify whether the window is healthy, consuming budget, or paging-worthy.',starter:`def error_budget_burn(good: int, total: int, slo: float) -> dict:
    return {}

print(error_budget_burn(9900, 10000, 0.999))`,expected:"{'error_rate': 0.01, 'burn_rate': 10.0, 'status': 'page'}",tests:`assert error_budget_burn(9900, 10000, .999) == {'error_rate': 0.01, 'burn_rate': 10.0, 'status': 'page'}
assert error_budget_burn(9995, 10000, .999)['status'] == 'ticket'
assert error_budget_burn(9999, 10000, .999)['status'] == 'healthy'
print('PASS')`,hint:'Allowed error rate is 1 - SLO. Burn rate is observed error rate divided by allowed error rate.',solution:`def error_budget_burn(good, total, slo):
    if total <= 0 or not 0 < slo < 1 or not 0 <= good <= total:
        raise ValueError('invalid SLI inputs')
    error_rate = (total - good) / total
    burn_rate = error_rate / (1 - slo)
    status = 'page' if burn_rate >= 10 else 'ticket' if burn_rate >= 2 else 'healthy'
    return {'error_rate': round(error_rate, 4), 'burn_rate': round(burn_rate, 2), 'status': status}`,explanation:'Production alerting normally combines fast and slow burn windows to balance detection speed and false positives. A senior answer connects burn rate to remaining budget and user impact, not an arbitrary availability threshold.'},
  {id:'dependency-order',title:'35 · Compute a safe deployment order from dependencies',prompt:'Topologically order services so dependencies deploy before consumers, and detect a dependency cycle instead of producing a dangerous partial order.',starter:`def deployment_order(dependencies: dict[str, set[str]]) -> list[str]:
    return []

graph = {'api': {'database', 'auth'}, 'worker': {'database'}, 'database': set(), 'auth': set()}
print(deployment_order(graph))`,expected:"A valid deterministic order such as ['auth', 'database', 'api', 'worker']",tests:`order = deployment_order(graph)
assert order == ['auth', 'database', 'api', 'worker']
assert order.index('database') < order.index('api')
try: deployment_order({'a': {'b'}, 'b': {'a'}})
except ValueError: pass
else: raise AssertionError('cycle must fail')
print('PASS')`,hint:'Repeatedly select sorted nodes whose dependencies are already completed. If no node is ready while work remains, a cycle or missing dependency exists.',solution:`def deployment_order(dependencies):
    all_nodes = set(dependencies)
    for required in dependencies.values():
        all_nodes.update(required)
    graph = {node: set(dependencies.get(node, set())) for node in all_nodes}
    completed = []
    remaining = set(all_nodes)
    while remaining:
        ready = sorted(node for node in remaining if graph[node] <= set(completed))
        if not ready:
            raise ValueError('dependency cycle detected')
        completed.extend(ready)
        remaining.difference_update(ready)
    return completed`,explanation:'Deployment ordering does not guarantee readiness or backward compatibility. Production delivery also needs health gates, expand/contract database changes, rollback boundaries and independent failure containment.'},
  {id:'config-precedence',title:'36 · Resolve configuration precedence with provenance',prompt:'Merge defaults, file configuration, environment variables, and CLI flags while recording which layer supplied every final value.',starter:`def resolve_config(layers: list[tuple[str, dict]]) -> tuple[dict, dict]:
    return {}, {}

layers = [('default', {'timeout': 5, 'retries': 2}), ('file', {'timeout': 10}), ('env', {'retries': 4})]
print(resolve_config(layers))`,expected:"({'timeout': 10, 'retries': 4}, {'timeout': 'file', 'retries': 'env'})",tests:`values, sources = resolve_config(layers)
assert values == {'timeout': 10, 'retries': 4}
assert sources == {'timeout': 'file', 'retries': 'env'}
assert resolve_config([]) == ({}, {})
print('PASS')`,hint:'Apply layers from lowest to highest precedence. Update both value and source at the same time.',solution:`def resolve_config(layers):
    values, sources = {}, {}
    for source, settings in layers:
        for key, value in settings.items():
            values[key] = value
            sources[key] = source
    return values, sources`,explanation:'Configuration is an API. Production code must validate types and ranges, redact secrets, distinguish missing from empty, and expose safe provenance so operators can explain why a value won.'},
  {id:'circuit-breaker',title:'37 · Implement a circuit-breaker state transition',prompt:'Model closed, open, and half-open transitions from failures and elapsed cooldown. Keep policy separate from the network call.',starter:`def circuit_transition(state: str, consecutive_failures: int, cooldown_elapsed: bool, probe_ok: bool | None = None) -> str:
    return ''

print(circuit_transition('closed', 5, False))`,expected:"'open' after five failures; half-open after cooldown; closed only after a successful probe",tests:`assert circuit_transition('closed', 4, False) == 'closed'
assert circuit_transition('closed', 5, False) == 'open'
assert circuit_transition('open', 5, True) == 'half-open'
assert circuit_transition('half-open', 5, True, True) == 'closed'
assert circuit_transition('half-open', 5, True, False) == 'open'
print('PASS')`,hint:'Handle state-specific rules explicitly. An open breaker ignores failure count until cooldown permits one probe.',solution:`def circuit_transition(state, consecutive_failures, cooldown_elapsed, probe_ok=None):
    if state == 'closed':
        return 'open' if consecutive_failures >= 5 else 'closed'
    if state == 'open':
        return 'half-open' if cooldown_elapsed else 'open'
    if state == 'half-open':
        if probe_ok is None:
            return 'half-open'
        return 'closed' if probe_ok else 'open'
    raise ValueError(f'unknown state: {state}')`,explanation:'A circuit breaker protects a dependency and the caller from retry amplification. Real implementations need concurrency safety, rolling failure windows, timeouts, metrics, fallback policy and per-dependency isolation.'},
  {id:'token-bucket',title:'38 · Enforce a token-bucket rate limit',prompt:'Simulate a token bucket for timestamped requests and return which requests are admitted. This tests state transitions and burst-versus-sustained capacity reasoning.',starter:`def admitted_requests(times: list[float], rate: float, capacity: float) -> list[bool]:
    return []

print(admitted_requests([0, 0, 0, 1, 1], rate=1, capacity=2))`,expected:'[True, True, False, True, False]',tests:`assert admitted_requests([0, 0, 0, 1, 1], 1, 2) == [True, True, False, True, False]
assert admitted_requests([], 1, 2) == []
try: admitted_requests([1, 0], 1, 2)
except ValueError: pass
else: raise AssertionError('timestamps must be ordered')
print('PASS')`,hint:'Start full. Before each request, refill by elapsed × rate but cap at capacity; admit only when at least one token remains.',solution:`def admitted_requests(times, rate, capacity):
    if rate < 0 or capacity < 1 or times != sorted(times):
        raise ValueError('invalid rate-limit input')
    tokens = capacity
    previous = times[0] if times else 0
    decisions = []
    for current in times:
        tokens = min(capacity, tokens + (current - previous) * rate)
        allowed = tokens >= 1
        if allowed:
            tokens -= 1
        decisions.append(allowed)
        previous = current
    return decisions`,explanation:'Distributed enforcement needs an atomic shared state or deliberately local limits, clock semantics, fairness, retry headers and overload behavior. Rate limiting is admission control, not a substitute for capacity planning.'},
  {id:'retry-budget',title:'39 · Build a retry schedule constrained by a deadline',prompt:'Generate exponential-backoff delays without exceeding the total request deadline. An unbounded retry policy can turn a partial dependency failure into a platform outage.',starter:`def retry_schedule(base_seconds: float, max_delay: float, deadline: float) -> list[float]:
    return []

print(retry_schedule(1, 4, 8))`,expected:'[1, 2, 4] because the next delay would exceed the deadline',tests:`assert retry_schedule(1, 4, 8) == [1, 2, 4]
assert retry_schedule(0.5, 2, 1.6) == [0.5, 1.0]
assert retry_schedule(2, 10, 1) == []
print('PASS')`,hint:'Track cumulative delay. Add the next capped exponential delay only when cumulative + delay is strictly below the deadline.',solution:`def retry_schedule(base_seconds, max_delay, deadline):
    if min(base_seconds, max_delay, deadline) <= 0:
        raise ValueError('retry inputs must be positive')
    result, elapsed, attempt = [], 0.0, 0
    while True:
        delay = min(max_delay, base_seconds * (2 ** attempt))
        if elapsed + delay >= deadline:
            return result
        result.append(delay)
        elapsed += delay
        attempt += 1`,explanation:'Production clients also need jitter, idempotency checks, server Retry-After support, per-attempt timeouts, a total deadline and a retry budget shared across layers.'},
  {id:'pod-capacity-fit',title:'40 · Test whether Kubernetes Pods fit allocatable capacity',prompt:'Calculate how many identical Pods fit a node using both CPU and memory requests, preserving system reserve. Identify the actual limiting resource.',starter:`def pod_capacity(alloc_cpu_m: int, alloc_mem_mib: int, pod_cpu_m: int, pod_mem_mib: int) -> dict:
    return {}

print(pod_capacity(7600, 30000, 900, 4096))`,expected:"{'pods': 7, 'limiting': 'memory'}",tests:`assert pod_capacity(7600, 30000, 900, 4096) == {'pods': 7, 'limiting': 'memory'}
assert pod_capacity(4000, 32000, 1000, 1000) == {'pods': 4, 'limiting': 'cpu'}
assert pod_capacity(4000, 4000, 1000, 1000) == {'pods': 4, 'limiting': 'both'}
print('PASS')`,hint:'Compute integer fit independently for CPU and memory; the smaller is capacity.',solution:`def pod_capacity(alloc_cpu_m, alloc_mem_mib, pod_cpu_m, pod_mem_mib):
    if min(alloc_cpu_m, alloc_mem_mib, pod_cpu_m, pod_mem_mib) <= 0:
        raise ValueError('resources must be positive')
    cpu_fit = alloc_cpu_m // pod_cpu_m
    mem_fit = alloc_mem_mib // pod_mem_mib
    limiting = 'both' if cpu_fit == mem_fit else 'cpu' if cpu_fit < mem_fit else 'memory'
    return {'pods': min(cpu_fit, mem_fit), 'limiting': limiting}`,explanation:'The scheduler also considers max Pods, init containers, extended resources, topology, affinity, taints and fragmentation. Requests drive scheduling; limits govern runtime enforcement.'},
  {id:'subnet-overlap',title:'41 · Detect overlapping cloud network CIDRs',prompt:'Validate a proposed VPC/subnet plan and return every overlap before peering, VPN, or Kubernetes Pod ranges make routing ambiguous.',starter:`import ipaddress

def overlapping_cidrs(cidrs: list[str]) -> list[tuple[str, str]]:
    return []

print(overlapping_cidrs(['10.0.0.0/16', '10.0.8.0/21', '10.1.0.0/16']))`,expected:"[('10.0.0.0/16', '10.0.8.0/21')]",tests:`assert overlapping_cidrs(['10.0.0.0/16', '10.0.8.0/21', '10.1.0.0/16']) == [('10.0.0.0/16', '10.0.8.0/21')]
assert overlapping_cidrs(['192.168.1.0/24', '192.168.2.0/24']) == []
try: overlapping_cidrs(['not-a-cidr'])
except ValueError: pass
else: raise AssertionError('invalid CIDR must fail')
print('PASS')`,hint:'Parse with ipaddress.ip_network(strict=False), then compare each unique pair with overlaps().',solution:`import ipaddress

def overlapping_cidrs(cidrs):
    networks = []
    for cidr in cidrs:
        try:
            networks.append((cidr, ipaddress.ip_network(cidr, strict=False)))
        except ValueError as exc:
            raise ValueError(f'invalid CIDR: {cidr}') from exc
    overlaps = []
    for index, (left_text, left) in enumerate(networks):
        for right_text, right in networks[index + 1:]:
            if left.version == right.version and left.overlaps(right):
                overlaps.append((left_text, right_text))
    return overlaps`,explanation:'At staff level, maintain IPAM across VPC/VNet, on-prem, service, Pod and load-balancer ranges. NAT can bridge some overlaps but adds identity, observability and asymmetric-routing complexity.'},
  {id:'certificate-expiry',title:'42 · Prioritize certificate expiry risk',prompt:'Classify certificates by days remaining and return the renewal queue in urgency order, including already-expired certificates.',starter:`from datetime import date

def renewal_queue(certificates: list[dict], today: date) -> list[tuple[str, str, int]]:
    return []

certs = [{'name':'api','expires':date(2026,8,5)}, {'name':'db','expires':date(2026,9,20)}]
print(renewal_queue(certs, date(2026,8,2)))`,expected:"[('api', 'critical', 3), ('db', 'warning', 49)]",tests:`assert renewal_queue(certs, date(2026,8,2)) == [('api', 'critical', 3), ('db', 'warning', 49)]
assert renewal_queue([{'name':'old','expires':date(2026,8,1)}], date(2026,8,2)) == [('old', 'expired', -1)]
print('PASS')`,hint:'Compute expires - today. Use expired < 0, critical <= 14, warning <= 60, otherwise healthy; sort by days then name.',solution:`def renewal_queue(certificates, today):
    queue = []
    for certificate in certificates:
        days = (certificate['expires'] - today).days
        status = 'expired' if days < 0 else 'critical' if days <= 14 else 'warning' if days <= 60 else 'healthy'
        queue.append((certificate['name'], status, days))
    return sorted(queue, key=lambda item: (item[2], item[0]))`,explanation:'Real certificate readiness includes issuer health, renewal attempts, secret propagation, reload behavior, complete trust chain and client clock skew—not only the notAfter timestamp.'},
  {id:'backup-retention',title:'43 · Select backups with daily/weekly/monthly retention',prompt:'Choose restore points deterministically while preserving recent daily backups, one weekly checkpoint, and one monthly checkpoint without duplicating the same backup.',starter:`from datetime import date

def retained_backups(days: list[date], today: date) -> list[date]:
    # Keep last 7 daily, last 4 ISO-week representatives, and last 3 month representatives.
    return []`,expected:'A sorted unique list that preserves the newest backup in each required bucket',tests:`days = [date(2026, 8, 2), date(2026, 8, 1), date(2026, 7, 31), date(2026, 7, 20), date(2026, 7, 1), date(2026, 6, 1), date(2026, 5, 1)]
kept = retained_backups(days, date(2026, 8, 2))
assert date(2026, 8, 2) in kept and date(2026, 6, 1) in kept and len(kept) == len(set(kept))
assert kept == sorted(kept, reverse=True)
print('PASS')`,hint:'Sort newest first. Keep recent daily dates, then first-seen ISO week and month keys up to their limits, using a set for deduplication.',solution:`from datetime import timedelta

def retained_backups(days, today):
    ordered = sorted(set(days), reverse=True)
    kept = {day for day in ordered if today - day < timedelta(days=7)}
    weeks, months = set(), set()
    for day in ordered:
        week = day.isocalendar()[:2]
        month = (day.year, day.month)
        if len(weeks) < 4 and week not in weeks:
            weeks.add(week); kept.add(day)
        if len(months) < 3 and month not in months:
            months.add(month); kept.add(day)
    return sorted(kept, reverse=True)`,explanation:'Retention policy is useless without tested restore, immutability, encryption, ownership and documented RPO/RTO. Bucket rules must be explicit about timezone and “newest versus oldest in period.”'},
  {id:'quorum-health',title:'44 · Distinguish healthy, degraded, and unsafe quorum',prompt:'Given replicas, reachable members, and writable members, classify a replicated control plane without assuming that one reachable node is safe.',starter:`def quorum_health(replicas: int, reachable: int, writable: int) -> str:
    return ''

print(quorum_health(3, 2, 1))`,expected:"'degraded' with quorum reachable; 'unsafe' without majority",tests:`assert quorum_health(3, 3, 1) == 'healthy'
assert quorum_health(3, 2, 1) == 'degraded'
assert quorum_health(3, 1, 0) == 'unsafe'
assert quorum_health(4, 2, 0) == 'unsafe'
print('PASS')`,hint:'Majority is replicas // 2 + 1. Healthy requires all reachable and exactly one writer; degraded still has majority and one writer.',solution:`def quorum_health(replicas, reachable, writable):
    if replicas <= 0 or not 0 <= reachable <= replicas or not 0 <= writable <= reachable:
        raise ValueError('invalid cluster state')
    majority = replicas // 2 + 1
    if reachable < majority or writable != 1:
        return 'unsafe'
    return 'healthy' if reachable == replicas else 'degraded'`,explanation:'Consensus systems differ in leader, membership and write semantics, but majority math is foundational. “Pod running” is not equivalent to safe quorum or writable service.'},
  {id:'rollout-gate',title:'45 · Decide whether a canary deployment may advance',prompt:'Evaluate SLO, error-budget burn, sample size, and regression guardrails. A canary with no traffic is unknown—not successful.',starter:`def rollout_decision(canary: dict, baseline: dict) -> str:
    return ''

canary = {'requests': 1200, 'error_rate': .006, 'p95_ms': 240, 'burn_rate': 1.2}
baseline = {'error_rate': .005, 'p95_ms': 220}
print(rollout_decision(canary, baseline))`,expected:"'advance', 'hold', or 'rollback'",tests:`assert rollout_decision(canary, baseline) == 'advance'
assert rollout_decision({'requests': 20, 'error_rate': 0, 'p95_ms': 100, 'burn_rate': 0}, baseline) == 'hold'
assert rollout_decision({'requests': 1200, 'error_rate': .02, 'p95_ms': 500, 'burn_rate': 12}, baseline) == 'rollback'
print('PASS')`,hint:'Hold below the minimum sample. Roll back on burn >= 10, error rate > 2× baseline, or p95 > 1.5× baseline.',solution:`def rollout_decision(canary, baseline):
    required = {'requests', 'error_rate', 'p95_ms', 'burn_rate'}
    if not required <= canary.keys():
        raise ValueError('missing canary metrics')
    if canary['requests'] < 500:
        return 'hold'
    regressed = (canary['burn_rate'] >= 10 or canary['error_rate'] > baseline['error_rate'] * 2 or canary['p95_ms'] > baseline['p95_ms'] * 1.5)
    return 'rollback' if regressed else 'advance'`,explanation:'A production gate also needs metric freshness, representative traffic, correctness/business KPIs, deployment health and a maximum observation window. Automation should halt safely when evidence is missing.'},
];

const labGroups: {name: string; ids: string[]}[] = [
  {name: 'Tier 1 — Start here if Python feels unfamiliar', ids: ['gpu-temp', 'node-health-count', 'fault-report', 'lowercase-gpus', 'split-node-line', 'safe-memory-pct']},
  {name: 'Tier 2 — Production Python & systems evidence', ids: ['regex', 'retry', 'gpu', 'subprocess', 'retry-storm', 'oom', 'scheduling', 'prometheus', 'runbook', 'linux-load', 'reconcile', 'timeline']},
  {name: 'Tier 3 — Senior GPU, distributed & infrastructure ops', ids: ['capacity', 'xid-correlation', 'nccl-ranks', 'inference-slo', 'bmc-sensors', 'firmware-drift', 'ansible-idempotency', 'terraform-risk', 'slurm-fairshare', 'mpi-ranks', 'enroot-gpu', 'canary-check']},
  {name: 'Tier 4 — General SRE Python & software design', ids: ['access-log-summary', 'latency-percentile', 'alert-dedup', 'slo-burn', 'dependency-order', 'config-precedence', 'circuit-breaker', 'token-bucket', 'retry-budget', 'pod-capacity-fit', 'subnet-overlap', 'certificate-expiry', 'backup-retention', 'quorum-health', 'rollout-gate']},
];

export default function Labs() {
  const [index, setIndex] = useState(0);
  return <Layout title="Production Python learning system" description="Learn algorithms and production engineering through executable SRE programs">
    <main className="pageShell"><header className="pageHeader"><span className="eyebrow">Staff SRE Python academy</span><h1>Production Python learning system</h1><p><strong>{labs.length} complete study modules</strong> arranged in four tiers. Each module teaches the concepts and data-structure choice, draws the algorithm flow, provides pseudocode, explains the full solution line by line, runs contract tests in the browser, compares alternatives and finishes with production hardening. Coding practice comes after the teaching layer.</p></header>
      <section className="learningRoadmap"><span className="eyebrow">Required learning sequence</span><div className="componentBoundaryDiagram">{['Understand contract', 'Learn Python concepts', 'Design algorithm', 'Study full solution', 'Run and modify code', 'Harden for production'].map((item, step) => <React.Fragment key={item}><article><span>{step + 1}</span><strong>{item}</strong></article>{step < 5 && <b>→</b>}</React.Fragment>)}</div><p>Use Tier 1 only where a foundation is weak. Your highest-value path is Tier 2 and Tier 4: production software boundaries, Linux/networking data, distributed-system control logic and Staff-level operational reasoning.</p></section>
      <div className="prompt"><strong>How to practise:</strong> write the smallest deterministic decision first, run its contract tests, then explain which real command or metric would supply each input. The reveal contains one reference implementation—not the only valid design.</div>
      <div className="labLayout"><aside className="scenarioList">{labGroups.map(group => <div key={group.name}><h4>{group.name}</h4>{group.ids.map(id => { const i = labs.findIndex(lab => lab.id === id); return <button className={i === index ? 'active' : ''} onClick={() => setIndex(i)} key={id}>{labs[i].title}</button>; })}</div>)}</aside><PythonPlayground exercise={labs[index]}/></div>
    </main>
  </Layout>;
}
