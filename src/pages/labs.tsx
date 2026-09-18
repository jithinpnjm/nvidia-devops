import React, {useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import PythonPlayground, {type PythonExercise} from '@site/src/components/PythonPlayground';

const labs: PythonExercise[] = [
  {id:'gpu-temp',title:'1 · Classify a GPU temperature reading',prompt:'Write a function that looks at one GPU temperature and says whether it is normal, warm, or hot. This is the simplest possible shape of an operations function: read one number, make a decision, return a word.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def classify_temp(temp_c: int) -> str:
    # Return 'normal' if below 70, 'warm' if 70-84, 'hot' if 85 or above.
    return ''

print(classify_temp(72))`,expected:"'warm', because 72 falls in the 70-84 range",tests:`assert classify_temp(50) == 'normal'
assert classify_temp(70) == 'warm'
assert classify_temp(85) == 'hot'
print('PASS')`,hint:'Check the lowest threshold first with if, then the middle range with elif, then fall back to hot with else.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def classify_temp(temp_c):
    if temp_c < 70:
        return 'normal'
    elif temp_c < 85:
        return 'warm'
    else:
        return 'hot'

if __name__ == '__main__':
    print(classify_temp(72))`,explanation:'Every alerting rule you will ever write for GPU fleets starts as exactly this shape: a threshold check that turns a raw sensor number into a category a human or an alert manager can act on. Once this feels easy, later labs just add more inputs to the same decision.'},
  {id:'node-health-count',title:'2 · Count how many nodes in a fleet are healthy',prompt:'Given a list of node statuses, count how many say "healthy" by walking through the list yourself with a loop and a counter. This is the pattern behind almost every fleet-health summary you will ever build.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def count_healthy(statuses: list) -> int:
    # Return how many entries in statuses equal 'healthy'.
    return 0

print(count_healthy(['healthy', 'healthy', 'degraded', 'healthy']))`,expected:'3',tests:`assert count_healthy(['healthy', 'healthy', 'degraded', 'healthy']) == 3
assert count_healthy(['degraded', 'offline']) == 0
assert count_healthy([]) == 0
print('PASS')`,hint:'Start a counter at 0 before the loop, and add 1 to it every time you see a healthy status inside the loop.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def count_healthy(statuses):
    count = 0
    for status in statuses:
        if status == 'healthy':
            count += 1
    return count

if __name__ == '__main__':
    print(count_healthy(['healthy', 'healthy', 'degraded', 'healthy']))`,explanation:'This loop-and-counter pattern is the manual version of what dashboards do constantly: turning a long list of raw states into one number someone can glance at. Later you will meet shortcuts like .count(), but doing it by hand first means you actually understand what the shortcut is doing.'},
  {id:'fault-report',title:'3 · Build a simple status report from a dict',prompt:'Given a dictionary mapping GPU names to their status, return just the names that are broken. Dictionaries are how most real infrastructure data arrives, so getting comfortable looping over one now will pay off immediately.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def find_faults(fleet: dict) -> list:
    # fleet maps a GPU name to its status, e.g. {'gpu-1': 'ok', 'gpu-2': 'fault'}.
    # Return a list of just the names whose status is 'fault'.
    return []

print(find_faults({'gpu-1': 'ok', 'gpu-2': 'fault', 'gpu-3': 'ok'}))`,expected:"['gpu-2']",tests:`assert find_faults({'gpu-1': 'ok', 'gpu-2': 'fault', 'gpu-3': 'ok'}) == ['gpu-2']
assert find_faults({'gpu-1': 'ok'}) == []
assert find_faults({}) == []
print('PASS')`,hint:'Use fleet.items() in your for loop to get both the name and the status on each pass, then check the status.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def find_faults(fleet):
    faulty = []
    for name, status in fleet.items():
        if status == 'fault':
            faulty.append(name)
    return faulty

if __name__ == '__main__':
    print(find_faults({'gpu-1': 'ok', 'gpu-2': 'fault', 'gpu-3': 'ok'}))`,explanation:'This is the exact shape of a "which of my GPUs need attention" report. Real monitoring tools store health data as dictionaries keyed by device name, so looping with .items() to pick out the ones that need attention is a skill you will reuse constantly.'},
  {id:'lowercase-gpus',title:'4 · Convert a list of GPU names to lowercase, safely',prompt:'Given a list of GPU names with inconsistent capitalization, return a new list where every name is lowercase. Inconsistent casing is a very common source of bugs when matching names across systems.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def lowercase_all(names: list) -> list:
    # Return a new list with every name lowercased.
    return []

print(lowercase_all(['GPU-A', 'gpu-b', 'Gpu-C']))`,expected:"['gpu-a', 'gpu-b', 'gpu-c']",tests:`assert lowercase_all(['GPU-A', 'gpu-b', 'Gpu-C']) == ['gpu-a', 'gpu-b', 'gpu-c']
assert lowercase_all([]) == []
assert lowercase_all(['SINGLE']) == ['single']
print('PASS')`,hint:'Create an empty list before the loop, then for each name call .lower() on it and append the result to that list.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def lowercase_all(names):
    result = []
    for name in names:
        result.append(name.lower())
    return result

if __name__ == '__main__':
    print(lowercase_all(['GPU-A', 'gpu-b', 'Gpu-C']))`,explanation:'Two systems rarely agree on capitalization for the same device name, so normalizing case before comparing or storing names avoids silent mismatches. This lab deliberately builds the new list by hand with append; once this feels natural, list comprehensions (used in the labs ahead) are just a shorter way to write this exact same loop.'},
  {id:'split-node-line',title:'5 · Parse one simple space-separated line without regex',prompt:'Given one line of text like a hostname, a status, and a temperature separated by spaces, pull out the three fields using .split() and return them as a dictionary. No regex needed yet — just splitting on whitespace.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def parse_line(line: str) -> dict:
    # line looks like "node-04 online 62": hostname, status, temperature.
    # Return {'host': ..., 'status': ..., 'temp': ...} with temp as an int.
    return {}

print(parse_line("node-04 online 62"))`,expected:"{'host': 'node-04', 'status': 'online', 'temp': 62}",tests:`assert parse_line("node-04 online 62") == {'host': 'node-04', 'status': 'online', 'temp': 62}
assert parse_line("node-11 offline 0") == {'host': 'node-11', 'status': 'offline', 'temp': 0}
result = parse_line("gpu-a warm 85")
assert result['temp'] == 85 and isinstance(result['temp'], int)
print('PASS')`,hint:'Calling .split() with no arguments splits on any whitespace and gives you a list of three pieces in order.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def parse_line(line):
    parts = line.split()
    host = parts[0]
    status = parts[1]
    temp = int(parts[2])
    return {'host': host, 'status': status, 'temp': temp}

if __name__ == '__main__':
    print(parse_line("node-04 online 62"))`,explanation:'Plenty of real log and status lines are this simple: fixed fields separated by spaces, no punctuation to worry about. .split() handles that fine. The next tier up replaces .split() with regex once your data gets messier than fixed positions — extra fields, optional sections, or punctuation mixed in — but you do not need that complexity yet.'},
  {id:'safe-memory-pct',title:'6 · Try dividing GPU memory usage without crashing on bad input',prompt:'Given how much GPU memory is used and the total available, calculate the percentage used — but if the total is zero, catch the error instead of letting your program crash, and return 0.0 instead.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def memory_used_pct(used_mb: int, total_mb: int) -> float:
    # Return the percentage of memory used. If total_mb is 0, return 0.0 instead of crashing.
    return 0.0

print(memory_used_pct(4096, 16384))`,expected:'25.0, and 0.0 when total_mb is 0 instead of crashing',tests:`assert memory_used_pct(4096, 16384) == 25.0
assert memory_used_pct(0, 0) == 0.0
assert memory_used_pct(8192, 8192) == 100.0
print('PASS')`,hint:'Put the division inside a try block, and catch ZeroDivisionError to return 0.0 instead of letting it crash your program.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def memory_used_pct(used_mb, total_mb):
    try:
        return (used_mb / total_mb) * 100
    except ZeroDivisionError:
        return 0.0

if __name__ == '__main__':
    print(memory_used_pct(4096, 16384))`,explanation:'This is your first try/except, and it matters for a real reason: infrastructure code often reports on hundreds of devices, and one device with a total of 0 (maybe it just has not reported in yet) should not crash the whole report. Returning a safe default and moving on is usually better than crashing everything for one bad data point — you can always log it separately and investigate.'},
  {id:'regex',title:'7 · Parse a kubelet incident log',prompt:'Turn raw kubelet evidence into a typed record. Reject malformed input: ambiguous parsing is unsafe during an incident.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

import re

def parse_log(line: str) -> dict:
    # Return timestamp, severity, and message.
    return {}

print(parse_log("2026-07-30T10:00:00Z ERROR kubelet timeout"))`,expected:"{'timestamp': '2026-07-30T10:00:00Z', 'severity': 'ERROR', 'message': 'kubelet timeout'}",tests:`item = parse_log("2026-07-30T10:00:00Z ERROR kubelet timeout")
assert item['severity'] == 'ERROR'
try: parse_log('not a log')
except ValueError: pass
else: raise AssertionError('must reject invalid input')
print('PASS')`,hint:'Use re.fullmatch with named groups; a parser should either return a complete record or fail clearly.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def parse_log(line):
    match = re.fullmatch(r"(?P<timestamp>\\S+) (?P<severity>DEBUG|INFO|WARN|ERROR) (?P<message>.+)", line)
    if not match:
        raise ValueError(f"invalid log line: {line!r}")
    return match.groupdict()

if __name__ == '__main__':
    print(parse_log("2026-07-30T10:00:00Z ERROR kubelet timeout"))`,explanation:'This is the pure parsing boundary from Volume 2. Keep file reads and log transport outside it so edge cases are cheap to test.'},
  {id:'retry',title:'8 · Retry only transient API failures',prompt:'Produce a deterministic retry decision for an API client. A retry without a deadline or classification can amplify an outage.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

RETRYABLE = {429, 500, 502, 503, 504}

def retry_plan(statuses: list[int], max_attempts: int = 3) -> list[int]:
    # Return retryable statuses, up to max_attempts.
    return []

print(retry_plan([503, 401, 429, 500]))`,expected:'[503, 429, 500]',tests:`assert retry_plan([503, 401, 429, 500]) == [503, 429, 500]
assert retry_plan([404, 409]) == []
assert retry_plan([500, 503, 429, 504], 2) == [500, 503]
print('PASS')`,hint:'Separate classification from sleeping and I/O. 401/403/404 require a decision, not an automatic retry.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def retry_plan(statuses, max_attempts=3):
    return [status for status in statuses if status in RETRYABLE][:max_attempts]

if __name__ == '__main__':
    print(retry_plan([503, 401, 429, 500]))`,explanation:'In a real client, combine this pure decision with a total deadline, idempotency awareness, exponential backoff, jitter, and `Retry-After` handling.'},
  {id:'gpu',title:'9 · Normalize GPU inventory',prompt:'Convert nvidia-smi CSV output to immutable records. Inventory is a boundary: command text must not leak into placement decisions.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

from dataclasses import dataclass

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
print('PASS')`,hint:'Ignore blank lines; split each row into exactly three stripped fields.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def parse_inventory(text):
    records = []
    for line in text.splitlines():
        if not line.strip():
            continue
        uuid, name, memory = (field.strip() for field in line.split(',', 2))
        records.append(GPU(uuid, name, int(memory)))
    return records

if __name__ == '__main__':
    sample = "GPU-a, NVIDIA H100, 81559\\nGPU-b, NVIDIA H100, 81559"
    print(parse_inventory(sample))`,explanation:'Typed data lets a later scheduler or report work independently of `nvidia-smi` and makes invalid inventory testable.'},
  {id:'oom',title:'10 · Detect cgroup memory risk',prompt:'Classify containers before an OOMKill. Use the limit—not node free memory—as the container safety boundary.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def memory_risk(working_set_mib: int, limit_mib: int) -> str:
    # Return normal, warning, or critical.
    return ''

print(memory_risk(14300, 16000))`,expected:'normal < 80%, warning 80–94%, critical ≥ 95%',tests:`assert memory_risk(100, 1000) == 'normal'
assert memory_risk(800, 1000) == 'warning'
assert memory_risk(950, 1000) == 'critical'
print('PASS')`,hint:'Compute the ratio once. Treat a missing/non-positive limit as invalid input.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def memory_risk(working_set_mib, limit_mib):
    if limit_mib <= 0:
        raise ValueError('a positive cgroup limit is required')
    ratio = working_set_mib / limit_mib
    if ratio >= .95: return 'critical'
    if ratio >= .80: return 'warning'
    return 'normal'

if __name__ == '__main__':
    print(memory_risk(14300, 16000))`,explanation:'For inference, correlate this with active sequences, prompt tokens, KV-cache allocation, and restart evidence before raising a limit.'},
  {id:'scheduling',title:'11 · Explain an unschedulable GPU Pod',prompt:'Turn scheduler event fragments into a ranked, human-readable diagnosis. Prefer specific constraints over a generic “Pending” message.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def scheduling_diagnosis(events: list[str]) -> list[str]:
    # Return unique diagnoses in order of evidence.
    return []

print(scheduling_diagnosis(['Insufficient nvidia.com/gpu', 'node affinity mismatch']))`,expected:"['insufficient GPU capacity', 'node affinity conflict']",tests:`assert scheduling_diagnosis(['Insufficient nvidia.com/gpu', 'node affinity mismatch']) == ['insufficient GPU capacity', 'node affinity conflict']
assert scheduling_diagnosis(['node affinity mismatch', 'node affinity mismatch']) == ['node affinity conflict']
print('PASS')`,hint:'Map known fragments to explanations, then preserve first-seen order while removing duplicates.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def scheduling_diagnosis(events):
    rules = [('nvidia.com/gpu', 'insufficient GPU capacity'), ('affinity', 'node affinity conflict'), ('taint', 'missing toleration')]
    found = []
    for event in events:
        for needle, diagnosis in rules:
            if needle.lower() in event.lower() and diagnosis not in found:
                found.append(diagnosis)
    return found

if __name__ == '__main__':
    print(scheduling_diagnosis(['Insufficient nvidia.com/gpu', 'node affinity mismatch']))`,explanation:'The production next step is `kubectl describe pod` plus node allocatable resources, taints, affinity, and topology labels—not deleting the Pod.'},
  {id:'prometheus',title:'12 · Guard a Prometheus query',prompt:'Reject a dangerous unbounded query shape before it becomes a high-cardinality incident.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def query_guard(query: str) -> str:
    # Return safe or review.
    return ''

print(query_guard('sum(rate(http_requests_total[5m]))'))`,expected:'review for wildcard/regex selectors or a missing range selector',tests:`assert query_guard('sum(rate(http_requests_total[5m]))') == 'safe'
assert query_guard('rate(http_requests_total{pod=~".*"}[5m])') == 'review'
assert query_guard('http_requests_total') == 'review'
print('PASS')`,hint:'This deliberately small guard is a teaching aid, not a PromQL parser.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def query_guard(query):
    if '=~".*"' in query or '[' not in query or ']' not in query:
        return 'review'
    return 'safe'

if __name__ == '__main__':
    print(query_guard('sum(rate(http_requests_total[5m]))'))`,explanation:'Senior observability work treats cardinality and query cost as reliability concerns. Inspect labels, bounded time windows, and recording rules.'},
  {id:'runbook',title:'13 · Turn evidence into a safe action',prompt:'Choose the least-destructive action from an incident state. Do not restart a node before preserving the evidence needed to prove the cause.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def next_action(node_ready: bool, disk_pressure: bool, xid_seen: bool) -> str:
    return ''

print(next_action(False, True, False))`,expected:'A single safe, ordered action',tests:`assert next_action(False, True, False) == 'cordon and inspect runtime disk'
assert next_action(True, False, True) == 'drain and quarantine GPU node'
assert next_action(True, False, False) == 'collect scoped evidence'
print('PASS')`,hint:'Order by containment first, then diagnosis; a repeated Xid is a hardware/driver safety signal.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def next_action(node_ready, disk_pressure, xid_seen):
    if xid_seen:
        return 'drain and quarantine GPU node'
    if not node_ready and disk_pressure:
        return 'cordon and inspect runtime disk'
    return 'collect scoped evidence'

if __name__ == '__main__':
    print(next_action(False, True, False))`,explanation:'This implements the Volume 7 distinction between mitigation and repair. The correct action depends on blast radius, redundancy, and change control.'},
  {id:'capacity',title:'14 · Size a GPU capacity buffer',prompt:'Calculate a simple allocatable capacity target from demand, failure-domain reserve, and operational headroom.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def required_gpus(peak: int, reserve: int, headroom: float) -> int:
    return 0

print(required_gpus(64, 8, .15))`,expected:'ceil((peak + reserve) × (1 + headroom))',tests:`assert required_gpus(64, 8, .15) == 83
assert required_gpus(10, 0, 0) == 10
print('PASS')`,hint:'Use math.ceil; validate that counts and headroom are non-negative.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

import math

def required_gpus(peak, reserve, headroom):
    if peak < 0 or reserve < 0 or headroom < 0:
        raise ValueError('capacity inputs cannot be negative')
    return math.ceil((peak + reserve) * (1 + headroom))

if __name__ == '__main__':
    print(required_gpus(64, 8, .15))`,explanation:'This is intentionally a planning baseline. Real capacity work also models GPU SKU, MIG geometry, queueing SLOs, maintenance windows, topology, and demand variance.'},
  {id:'subprocess',title:'15 · Classify subprocess failures safely',prompt:'Convert return code, stdout, and stderr from an infrastructure command into a typed operational result. Never use shell=True for interpolated input.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

from dataclasses import dataclass

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
print('PASS')`,hint:'Normalize stderr to lowercase. Return useful detail without hiding the original failure.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def classify_command(returncode, stdout, stderr):
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
    return CommandResult(False, category, detail)

if __name__ == '__main__':
    print(classify_command(1, '', 'connection timed out'))`,explanation:'The I/O wrapper should call subprocess.run with an argument list, timeout, text mode, and captured output. This pure classifier makes policy testable without executing a command.'},
  {id:'linux-load',title:'16 · Diagnose Linux load without guessing',prompt:'Interpret a vmstat-style snapshot. High load is not automatically high CPU: runnable work and uninterruptible I/O need different actions.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def diagnose_load(load1: float, cpus: int, run_queue: int, blocked: int, iowait_pct: float) -> str:
    return ''

print(diagnose_load(24, 16, 2, 19, 42.0))`,expected:'cpu-pressure, io-pressure, mixed-pressure, or healthy',tests:`assert diagnose_load(24, 16, 2, 19, 42) == 'io-pressure'
assert diagnose_load(20, 8, 18, 0, 1) == 'cpu-pressure'
assert diagnose_load(20, 8, 14, 8, 35) == 'mixed-pressure'
assert diagnose_load(2, 8, 1, 0, 0) == 'healthy'
print('PASS')`,hint:'Use run_queue versus CPU count for CPU pressure; use blocked tasks plus iowait for I/O pressure.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def diagnose_load(load1, cpus, run_queue, blocked, iowait_pct):
    if cpus <= 0:
        raise ValueError('cpus must be positive')
    cpu_pressure = run_queue > cpus
    io_pressure = blocked > 0 and iowait_pct >= 10
    if cpu_pressure and io_pressure: return 'mixed-pressure'
    if cpu_pressure: return 'cpu-pressure'
    if io_pressure: return 'io-pressure'
    return 'healthy'

if __name__ == '__main__':
    print(diagnose_load(24, 16, 2, 19, 42.0))`,explanation:'Use this only to rank the next check. Confirm with vmstat, pidstat, pressure stall information, process state/wchan, and storage latency before mitigating.'},
  {id:'xid-correlation',title:'17 · Parse & Correlate GPU Xid Events',prompt:'(Interview Scenario) `dmesg` contains raw `NVRM: Xid` errors with PCI bus IDs, but SLURM schedules using GPU UUIDs. Write a senior-level script that parses raw `dmesg` output to extract the PCI bus and Xid, correlates the PCI bus to a UUID using mocked `nvidia-smi` JSON topology, and flags hardware for RMA.',starter:`import re\nimport json\nfrom typing import Dict, List\n\ndef correlate_xids_to_uuids(dmesg_log: str, smi_topo_json: str) -> Dict[str, List[int]]:\n    \"\"\"\n    dmesg_log contains: "[123.4] NVRM: Xid (PCI:0000:01:00.0): 79"\n    smi_topo_json contains: {"0000:01:00.0": "GPU-abcd123"}\n    Return a mapping of GPU UUID to a list of its Xid integers.\n    \"\"\"\n    faults = {}\n    # TODO: Implement regex parsing and mapping\n    return faults\n`,expected:"A dictionary mapping exact UUIDs to their raw Xid integers",tests:`dmesg = "[  100.12] NVRM: Xid (PCI:0000:41:00.0): 79, GPU fallen off bus\n[  150.00] NVRM: Xid (PCI:0000:41:00.0): 48, DBE error"\ntopo = '{"0000:41:00.0": "GPU-1234", "0000:81:00.0": "GPU-5678"}'\n\nresult = correlate_xids_to_uuids(dmesg, topo)\nassert result == {"GPU-1234": [79, 48]}, f"Failed, got {result}"\nprint('PASS')`,hint:'Use `re.finditer(r"NVRM: Xid \\(PCI:(.*?)\\): (\\d+)", dmesg_log)` to extract the PCI ID and the Xid number. Load the JSON, then map it.',solution:`import re\nimport json\nfrom collections import defaultdict\nfrom typing import Dict, List\n\ndef correlate_xids_to_uuids(dmesg_log: str, smi_topo_json: str) -> Dict[str, List[int]]:\n    try:\n        topo_map = json.loads(smi_topo_json)\n    except json.JSONDecodeError:\n        raise ValueError("Invalid topology JSON")\n\n    pattern = re.compile(r"NVRM: Xid \\(PCI:(?P<pci>.*?)\\): (?P<xid>\d+)")\n    faults = defaultdict(list)\n    \n    for match in pattern.finditer(dmesg_log):\n        pci_bus = match.group('pci')\n        xid = int(match.group('xid'))\n        \n        uuid = topo_map.get(pci_bus)\n        if uuid:\n            faults[uuid].append(xid)\n            \n    return dict(faults)\n\nif __name__ == '__main__':\n    dmesg_sample = "[12.3] NVRM: Xid (PCI:0000:81:00.0): 79, fallen off bus\n"\n    topo_sample = '{"0000:81:00.0": "GPU-98765432-1111-2222-3333"}'\n    \n    correlated = correlate_xids_to_uuids(dmesg_sample, topo_sample)\n    for uuid, xids in correlated.items():\n        print(f"Hardware Faults for {uuid}: Xid {xids}")\n`,explanation:'A critical infrastructure skill is "evidence fusion". The kernel (`dmesg`) only knows PCIe paths. The cluster orchestrator only knows GPU UUIDs. You must write scripts that dynamically query NVML or `nvidia-smi` to bridge the gap, enabling automated cordoning of the exact failing hardware.'},
  {id:'nccl-ranks',title:'18 · Find a distributed-training straggler',prompt:'Use per-rank step durations to identify a statistically meaningful outlier before blaming NCCL or the network.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def straggler_ranks(step_ms: dict[int, float], tolerance: float = 1.20) -> list[int]:
    return []

print(straggler_ranks({0:101, 1:99, 2:103, 3:162}))`,expected:'Ranks slower than median × tolerance',tests:`assert straggler_ranks({0:101, 1:99, 2:103, 3:162}) == [3]
assert straggler_ranks({0:100, 1:101, 2:99}) == []
print('PASS')`,hint:'Median is more robust than mean when one rank is already an outlier.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

import statistics

def straggler_ranks(step_ms, tolerance=1.20):
    if not step_ms:
        return []
    baseline = statistics.median(step_ms.values())
    return sorted(rank for rank, duration in step_ms.items() if duration > baseline * tolerance)

if __name__ == '__main__':
    print(straggler_ranks({0:101, 1:99, 2:103, 3:162}))`,explanation:'Next correlate the rank with node, GPU, NUMA/NIC locality, data-loader time, GPU clocks/errors, and collective traces. A rank outlier is evidence—not yet a root cause.'},
  {id:'inference-slo',title:'19 · Separate TTFT from decode regression',prompt:'Classify an inference SLO regression using queue, prefill, and decode signals instead of one average latency metric.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def inference_bottleneck(ttft_ms: float, tpot_ms: float, queue_ms: float, baseline: dict) -> str:
    return ''

baseline = {'ttft': 400, 'tpot': 25, 'queue': 50}
print(inference_bottleneck(900, 27, 420, baseline))`,expected:'queue/prefill, decode, end-to-end, or healthy',tests:`assert inference_bottleneck(900, 27, 420, baseline) == 'queue/prefill'
assert inference_bottleneck(420, 60, 55, baseline) == 'decode'
assert inference_bottleneck(900, 60, 300, baseline) == 'end-to-end'
assert inference_bottleneck(420, 26, 55, baseline) == 'healthy'
print('PASS')`,hint:'Treat more than 1.5× baseline as regressed. TTFT plus queue points toward admission/prefill.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def inference_bottleneck(ttft_ms, tpot_ms, queue_ms, baseline):
    ttft_bad = ttft_ms > baseline['ttft'] * 1.5
    tpot_bad = tpot_ms > baseline['tpot'] * 1.5
    queue_bad = queue_ms > baseline['queue'] * 1.5
    if ttft_bad and tpot_bad: return 'end-to-end'
    if ttft_bad and queue_bad: return 'queue/prefill'
    if tpot_bad: return 'decode'
    return 'healthy'

if __name__ == '__main__':
    baseline = {'ttft': 400, 'tpot': 25, 'queue': 50}
    print(inference_bottleneck(900, 27, 420, baseline))`,explanation:'Segment further by prompt/output length, model, tenant, batch, cache hit, and replica. Tune only after distinguishing admission queue, prefill compute, decode, KV pressure, and dependencies.'},
  {id:'reconcile',title:'20 · Plan a Kubernetes reconciliation',prompt:'Compare desired and observed replica state and emit an idempotent plan rather than imperative trial-and-error.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def reconciliation_plan(desired: int, ready: int, terminating: int) -> list[str]:
    return []

print(reconciliation_plan(5, 3, 0))`,expected:"['create', 'create']",tests:`assert reconciliation_plan(5, 3, 0) == ['create', 'create']
assert reconciliation_plan(3, 5, 0) == ['delete', 'delete']
assert reconciliation_plan(3, 3, 1) == ['wait']
assert reconciliation_plan(3, 3, 0) == []
print('PASS')`,hint:'Do not create/delete while termination is in flight; a real controller requeues and observes again.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def reconciliation_plan(desired, ready, terminating):
    if min(desired, ready, terminating) < 0:
        raise ValueError('replica counts cannot be negative')
    if terminating:
        return ['wait']
    delta = desired - ready
    if delta > 0: return ['create'] * delta
    if delta < 0: return ['delete'] * -delta
    return []

if __name__ == '__main__':
    print(reconciliation_plan(5, 3, 0))`,explanation:'Real controllers handle resourceVersion conflicts, expectations, ownership, finalizers, backoff, and partial failure. This lab isolates the desired-versus-observed control-loop idea.'},
  {id:'retry-storm',title:'21 · Detect an API retry storm',prompt:'Analyze client retry telemetry and flag amplification before a struggling dependency is overwhelmed.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def retry_storm(requests: int, attempts: int, error_rate: float, clients: int) -> dict:
    return {}

print(retry_storm(1000, 2800, .42, 120))`,expected:'retry ratio, amplification factor, and storm boolean',tests:`assert retry_storm(1000, 2800, .42, 120)['storm'] is True
assert retry_storm(1000, 1050, .01, 10)['storm'] is False
print('PASS')`,hint:'attempts includes original requests. A high attempts/requests ratio plus substantial error rate is dangerous.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def retry_storm(requests, attempts, error_rate, clients):
    if requests <= 0 or attempts < requests or clients < 0 or not 0 <= error_rate <= 1:
        raise ValueError('invalid telemetry')
    amplification = attempts / requests
    retry_ratio = (attempts - requests) / attempts
    return {
        'amplification': round(amplification, 2),
        'retry_ratio': round(retry_ratio, 3),
        'storm': amplification >= 1.5 and error_rate >= .10 and clients >= 20,
    }

if __name__ == '__main__':
    print(retry_storm(1000, 2800, .42, 120))`,explanation:'Mitigation may require a retry budget, deadline, jitter, concurrency cap, circuit breaker, or load shedding. Coordinate with the dependency owner before shifting load.'},
  {id:'timeline',title:'22 · Build an incident timeline',prompt:'Merge changes, alerts, and symptoms into a stable chronological timeline while preserving source and correlation IDs.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def incident_timeline(records: list[dict]) -> list[str]:
    return []

records = [
    {'ts':'10:03','source':'alert','message':'TTFT SLO burn'},
    {'ts':'09:58','source':'deploy','message':'batch policy v2'},
]
print(incident_timeline(records))`,expected:'Sorted “timestamp | source | message” lines',tests:`assert incident_timeline(records) == ['09:58 | deploy | batch policy v2', '10:03 | alert | TTFT SLO burn']
assert incident_timeline([]) == []
print('PASS')`,hint:'Return a new list; do not mutate source records. Validate required fields.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def incident_timeline(records):
    required = {'ts', 'source', 'message'}
    if any(not required.issubset(record) for record in records):
        raise ValueError('timeline record missing required fields')
    ordered = sorted(records, key=lambda record: (record['ts'], record['source']))
    return [f"{record['ts']} | {record['source']} | {record['message']}" for record in ordered]

if __name__ == '__main__':
    ]
    print(incident_timeline(records))`,explanation:'Production timestamps need timezone and preferably UTC/ISO-8601. Preserve raw evidence separately; the human timeline should link observations to queries, deploy IDs, tickets, and decisions.'},
  {id:'bmc-sensors',title:'23 · Classify BMC sensor health from a Redfish/IPMI sweep',prompt:'Turn a raw `sensor list` sweep into a single health verdict before paging anyone. A discrete PSU sensor reading 0 is not “temperature zero”—misreading it sends someone chasing the wrong fault.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def node_health(sensors: list[dict]) -> str:
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
print('PASS')`,hint:'Decode discrete sensors by exact bitmap match, never by numeric comparison; threshold sensors compare reading against unc/ucr.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def node_health(sensors):
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
    return 'healthy'

if __name__ == '__main__':
    ]
    print(node_health(sample))`,explanation:'The next real step is `ipmitool sensor list` plus the SDR to confirm the bitmap decode, then check the PDU/breaker feeding that PSU before assuming a server-side fault.'},
  {id:'firmware-drift',title:'22 · Infrastructure Firmware Drift Detection',prompt:'(Interview Scenario) Managing 1,000 DGX nodes means firmware drifts. Write a senior-level script that parses raw `mlxfwmanager` InfiniBand output strings and compares it against a desired state dataclass to detect missing Mellanox firmware updates.',starter:`from dataclasses import dataclass\nfrom typing import List, Dict\nimport re\n\n@dataclass\nclass FirmwareState:\n    device_id: str\n    current_fw: str\n    \ndef parse_mlxfwmanager_output(raw_output: str) -> List[FirmwareState]:\n    # TODO: Parse lines like "Device: MT4123" and "FW: 20.31.1014"\n    pass\n\ndef check_drift(current_states: List[FirmwareState], desired_fw: str) -> List[FirmwareState]:\n    # TODO: Return devices where current_fw != desired_fw\n    pass\n`,expected:"Proper parsing of raw CLI text and object-based drift detection",tests:`raw_output = "Device: MT4123\nFW: 20.31.1014\nDevice: MT4124\nFW: 20.32.0000\n"\nstates = parse_mlxfwmanager_output(raw_output)\nassert len(states) == 2\nassert states[0].current_fw == "20.31.1014"\n\ndrifted = check_drift(states, "20.32.0000")\nassert len(drifted) == 1\nassert drifted[0].current_fw == "20.31.1014"\nprint('PASS')`,hint:'Use a loop over the lines. If line starts with "Device:", save it. If line starts with "FW:", you have a pair—instantiate `FirmwareState` and append it.',solution:`from dataclasses import dataclass\nfrom typing import List\nimport re\n\n@dataclass\nclass FirmwareState:\n    device_id: str\n    current_fw: str\n\ndef parse_mlxfwmanager_output(raw_output: str) -> List[FirmwareState]:\n    states = []\n    current_device = None\n    \n    for line in raw_output.strip().split('\n'):\n        line = line.strip()\n        if line.startswith("Device:"):\n            current_device = line.split(":", 1)[1].strip()\n        elif line.startswith("FW:") and current_device:\n            fw_version = line.split(":", 1)[1].strip()\n            states.append(FirmwareState(device_id=current_device, current_fw=fw_version))\n            current_device = None\n            \n    return states\n\ndef check_drift(current_states: List[FirmwareState], desired_fw: str) -> List[FirmwareState]:\n    return [state for state in current_states if state.current_fw != desired_fw]\n\nif __name__ == '__main__':\n    mock_cli_output = '''\nDevice: ConnectX-6\nFW: 20.31.1014\nDevice: ConnectX-6\nFW: 20.32.0123\n'''\n    DESIRED_FIRMWARE = "20.32.0123"\n    \n    states = parse_mlxfwmanager_output(mock_cli_output)\n    drifted_cards = check_drift(states, DESIRED_FIRMWARE)\n    \n    for card in drifted_cards:\n        print(f"ALERT: Drift on {card.device_id}. Found {card.current_fw}, expected {DESIRED_FIRMWARE}.")\n`,explanation:'Senior engineers do not manually check firmware. They write Python operators that parse raw OEM tool outputs (`mlxfwmanager`, `nvfwupd`), instantiate strongly typed state objects, diff them against GitOps desired state, and automatically schedule BMC/Redfish firmware updates on mismatched hosts.'},
  {id:'ansible-idempotency',title:'25 · Spot false idempotency in an Ansible --check --diff run',prompt:'Classify repeated `--check --diff` results per module before trusting “changed” as a signal. A module reporting changed=True every run on a semantically identical diff is noise that will bury the one node with a real drift.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def classify_idempotency(runs: dict[str, list[tuple[bool, str]]]) -> dict[str, str]:
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
print('PASS')`,hint:'Normalize each diff (e.g. split and sort its key=value pairs) before comparing runs for sameness; a reordered diff is not a new diff.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def normalize_diff(diff):
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
    return result

if __name__ == '__main__':
    }
    print(classify_idempotency(runs))`,explanation:'A real fix replaces the offending module invocation (often a raw `command`/`shell` task) with an idempotent module; this classifier just tells you which resource to inspect first.'},
  {id:'terraform-risk',title:'26 · Classify Terraform plan risk before apply',prompt:'Reduce a `terraform plan` action list to one risk verdict so a reviewer knows whether to read every line or just skim it. A `-/+` destroy-and-recreate or a bare `-` outweighs any number of plain creates.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def plan_risk(actions: list[str]) -> str:
    # Each action looks like "+ create", "~ update in-place", "-/+ destroy and re-create", "- destroy".
    # Return 'safe', 'review', or 'dangerous'.
    return ''

print(plan_risk(['+ create', '~ update in-place', '-/+ destroy and re-create']))`,expected:"'dangerous', because a -/+ action outweighs the create and update in the same plan",tests:`assert plan_risk(['+ create', '+ create']) == 'safe'
assert plan_risk(['+ create', '~ update in-place']) == 'review'
assert plan_risk(['~ update in-place', '-/+ destroy and re-create']) == 'dangerous'
assert plan_risk(['+ create', '- destroy']) == 'dangerous'
assert plan_risk([]) == 'safe'
print('PASS')`,hint:'Score each action by its worst-case symbol, then take the maximum across the whole plan; do not average.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def plan_risk(actions):
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
    return 'safe'

if __name__ == '__main__':
    print(plan_risk(['+ create', '~ update in-place', '-/+ destroy and re-create']))`,explanation:'Treat this as a merge-gate signal only; still read the actual resource addresses in a dangerous plan—a destroy on a stateful resource (a volume, a DNS record) needs a human decision, not just a risk label.'},
  {id:'slurm-fairshare',title:'27 · Flag Slurm fairshare starvation risk versus a normal burst',prompt:'Distinguish an account that is sustainably over its allocated share—the kind of misconfiguration that quietly starves everyone else for weeks—from a single busy day that self-corrects.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def fairshare_status(allocated_share: float, usage_by_day: list[float]) -> str:
    # allocated_share and each usage_by_day entry are fractions of total cluster GPU-hours.
    # Return 'starvation-risk', 'normal-burst', or 'within-share'.
    return ''

print(fairshare_status(0.20, [0.30, 0.32, 0.29, 0.31, 0.30]))`,expected:"'starvation-risk' when every day is well over the allocated share, not just one",tests:`assert fairshare_status(0.20, [0.30, 0.32, 0.29, 0.31, 0.30]) == 'starvation-risk'
assert fairshare_status(0.20, [0.19, 0.20, 0.55, 0.18, 0.20]) == 'normal-burst'
assert fairshare_status(0.20, [0.18, 0.19, 0.20, 0.21, 0.19]) == 'within-share'
try: fairshare_status(0.20, [])
except ValueError: pass
else: raise AssertionError('must reject empty usage history')
print('PASS')`,hint:'Compute a usage/allocated ratio per day; sustained means every ratio crosses the threshold, a burst means only the max does.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def fairshare_status(allocated_share, usage_by_day):
    if not usage_by_day:
        raise ValueError('usage history is required')
    ratios = [usage / allocated_share for usage in usage_by_day]
    if all(ratio >= 1.4 for ratio in ratios):
        return 'starvation-risk'
    if max(ratios) >= 1.4:
        return 'normal-burst'
    return 'within-share'

if __name__ == '__main__':
    print(fairshare_status(0.20, [0.30, 0.32, 0.29, 0.31, 0.30]))`,explanation:'Confirm with `sshare -l`: FairShare near 1.0 for the flagged account alongside near-0.2 for peers means the allocated share itself is miscalibrated, which `sacctmgr modify account ... set fairshare=` fixes—this function only tells you where to look.'},
  {id:'mpi-ranks',title:'28 · Validate an MPI/PMIx launch against expected rank layout',prompt:'Diff observed “Hello from rank” output against the expected per-node rank layout before assuming a hung job is a NCCL problem—half the ranks may simply never have launched.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

import re

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
print('PASS')`,hint:'Parse each line with a strict regex into (rank, node) pairs, build a set of seen ranks per node, then set-subtract from expected.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def missing_ranks(expected, observed):
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
    return result

if __name__ == '__main__':
    print(missing_ranks(expected, observed))`,explanation:'Missing ranks concentrated on one node points at that node—PMIx launch failure, SSH/hostfile issue, or a GRES/cgroup binding rejection—rather than a collective-communication bug; correlate with the launcher exit code before touching NCCL.'},
  {id:'enroot-gpu',title:'29 · Diagnose Pyxis/Enroot GPU Visibility',prompt:'(Interview Scenario) You are handed a cluster where `srun --container-image=... nvidia-smi` shows no GPUs. As a Senior AI Infra Engineer, write a diagnostic script that parses raw `slurm.conf` and `enroot.conf` files to detect the exact missing misconfigurations (missing GresTypes, missing Enroot NVIDIA hook).',starter:`import re\nfrom typing import List, Dict\n\ndef diagnose_enroot_pyxis(slurm_conf_content: str, enroot_conf_content: str) -> List[str]:\n    \"\"\"\n    Parse raw configuration files.\n    - Check if 'GresTypes=gpu' exists in slurm_conf_content.\n    - Check if enroot configuration contains '40-nvidia.sh'.\n    \"\"\"\n    errors = []\n    # TODO: Implement parsing logic\n    return errors\n`,expected:"Returns exact infrastructure misconfigurations based on raw file parsing",tests:`slurm_bad = "ControlMachine=slurmctld\nSelectType=select/cons_tres"\nenroot_bad = "ENROOT_RUNTIME_PATH=/run/enroot\nENROOT_LIBRARY_PATH=/usr/lib/enroot"\n\nslurm_good = "ControlMachine=slurmctld\nGresTypes=gpu,mic\nSelectType=select/cons_tres"\nenroot_good = "ENROOT_RUNTIME_PATH=/run/enroot\nENROOT_ENVIRON_PATH=/etc/enroot/hooks.d/40-nvidia.sh"\n\nassert len(diagnose_enroot_pyxis(slurm_bad, enroot_bad)) == 2\nassert len(diagnose_enroot_pyxis(slurm_good, enroot_good)) == 0\nassert diagnose_enroot_pyxis(slurm_bad, enroot_good)[0].startswith("SLURM")\nprint('PASS')`,hint:'Use `re.search(r"(?i)GresTypes=.*gpu", slurm_conf_content)` for SLURM. Use string matching for `40-nvidia.sh` in the enroot content.',solution:`import re\nimport sys\nfrom typing import List\n\ndef diagnose_enroot_pyxis(slurm_conf_content: str, enroot_conf_content: str) -> List[str]:\n    errors = []\n    \n    # Check SLURM Configuration for Generic Resource (GRES) GPU tracking\n    if not re.search(r'(?i)^GresTypes=.*gpu', slurm_conf_content, re.MULTILINE):\n        errors.append("SLURM Error: 'GresTypes=gpu' is missing. SLURM will not allocate GPUs to Pyxis.")\n        \n    # Check Enroot Configuration for the NVIDIA Container Toolkit hook\n    if '40-nvidia.sh' not in enroot_conf_content:\n        errors.append("Enroot Error: The NVIDIA container hook (40-nvidia.sh) is missing.")\n        \n    return errors\n\nif __name__ == '__main__':\n    # Mock reading from /etc/slurm/slurm.conf and /etc/enroot/enroot.conf\n    mock_slurm = "ClusterName=ai-cluster\nGresTypes=gpu\n"\n    mock_enroot = "ENROOT_RUNTIME_PATH=/run/enroot\n"\n    \n    issues = diagnose_enroot_pyxis(mock_slurm, mock_enroot)\n    if issues:\n        for issue in issues:\n            print(f"CRITICAL: {issue}")\n    else:\n        print("Cluster container runtime is healthy.")\n`,explanation:'A senior engineer does not just say "check the configuration." They automate config parsing at the fleet level. In Enroot/Pyxis, GPU visibility requires SLURM to be aware of the GPU (GresTypes), SPANK to intercept the job, and Enroot to inject the NVIDIA Container Toolkit hook to mount `/dev/nvidia*` and userland drivers into the unprivileged container namespace.'},
  {id:'canary-check',title:'30 · Check whether a canary wave actually represents the fleet',prompt:'A canary that passes every gate item is only evidence about the hardware/firmware combinations it contains. Find exactly which combinations in the fleet the proposed canary group does not cover before it ships to wave two.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def canary_representativeness(fleet_combos: list[tuple], canary_combos: list[tuple]) -> dict:
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
print('PASS')`,hint:'Reduce both lists to sets of distinct combinations first; representativeness is a set-coverage question, not a count question.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def canary_representativeness(fleet_combos, canary_combos):
    fleet_set = set(fleet_combos)
    canary_set = set(canary_combos)
    missing = sorted(fleet_set - canary_set)
    return {'representative': len(missing) == 0, 'missing': missing}

if __name__ == '__main__':
    fleet = [('ConnectX-6', 'fw-20.1'), ('ConnectX-7', 'fw-22.35'), ('ConnectX-7', 'fw-22.36')]
    canary = [('ConnectX-6', 'fw-20.1'), ('ConnectX-6', 'fw-20.1')]
    print(canary_representativeness(fleet, canary))`,explanation:'This is the exact “canary passed but 20% of the fleet had different NIC firmware” failure mode—stratify canary node selection by NIC model, firmware revision, and GPU SKU explicitly, not by whichever nodes happened to be idle.'},
  {id:'access-log-summary',title:'31 · Summarize HTTP access logs for an incident',prompt:'Parse structured access-log lines and return request count, error rate, and the slowest route. Reject malformed records instead of silently corrupting incident evidence.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def summarize_access_logs(lines: list[str]) -> dict:
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
print('PASS')`,hint:'Split into exactly five fields, convert status and latency to integers, count status >= 500, and track maximum latency.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def summarize_access_logs(lines):
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
    return {'requests': total, 'error_rate': round(errors / total, 3) if total else 0.0, 'slowest_route': slowest}

if __name__ == '__main__':
    ]
    print(summarize_access_logs(logs))`,explanation:'In production, stream rather than load an unbounded file, preserve correlation IDs, distinguish upstream from application status, and compute latency distributions per route. The interview signal is a strict parsing boundary plus explicit empty-input behavior.'},
  {id:'latency-percentile',title:'32 · Calculate a latency percentile without hiding tail risk',prompt:'Implement nearest-rank percentile calculation so an SRE report can show p50, p95, and p99 instead of an average that hides slow requests.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def percentile(values: list[float], percentile_value: float) -> float:
    return 0.0

samples = [10, 20, 30, 40, 50, 1000]
print(percentile(samples, 95))`,expected:'1000 using the nearest-rank definition',tests:`assert percentile([10, 20, 30, 40, 50, 1000], 95) == 1000
assert percentile([4, 1, 3, 2], 50) == 2
assert percentile([7], 99) == 7
try: percentile([], 95)
except ValueError: pass
else: raise AssertionError('empty samples must fail')
print('PASS')`,hint:'Sort a copy. Nearest-rank index is ceil(p/100 × n) - 1, clamped to the valid range.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

import math

def percentile(values, percentile_value):
    if not values:
        raise ValueError('at least one sample is required')
    if not 0 < percentile_value <= 100:
        raise ValueError('percentile must be in (0, 100]')
    ordered = sorted(values)
    index = math.ceil(percentile_value / 100 * len(ordered)) - 1
    return ordered[index]

if __name__ == '__main__':
    samples = [10, 20, 30, 40, 50, 1000]
    print(percentile(samples, 95))`,explanation:'Real telemetry systems use well-defined histogram/quantile semantics and sufficient sample windows. State the definition in an interview: percentile implementations differ, and averaging per-instance p95 values is invalid.'},
  {id:'alert-dedup',title:'33 · Deduplicate alerts into incidents',prompt:'Group repeated alerts by stable identity while retaining first seen, last seen, count, and highest severity. Do not deduplicate on volatile annotations.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def deduplicate_alerts(alerts: list[dict]) -> list[dict]:
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
print('PASS')`,hint:'Use a dictionary keyed by a tuple. Define an explicit severity ordering rather than comparing strings.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def deduplicate_alerts(alerts):
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
    return sorted(incidents.values(), key=lambda item: (item['first_seen'], item['key']))

if __name__ == '__main__':
    ]
    print(deduplicate_alerts(alerts))`,explanation:'Alertmanager fingerprinting, grouping windows and inhibition are richer versions of this model. Good deduplication reduces page volume without erasing duration or severity escalation.'},
  {id:'slo-burn',title:'34 · Calculate SLO error-budget burn rate',prompt:'Given good and total events plus an SLO target, calculate burn rate and classify whether the window is healthy, consuming budget, or paging-worthy.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def error_budget_burn(good: int, total: int, slo: float) -> dict:
    return {}

print(error_budget_burn(9900, 10000, 0.999))`,expected:"{'error_rate': 0.01, 'burn_rate': 10.0, 'status': 'page'}",tests:`assert error_budget_burn(9900, 10000, .999) == {'error_rate': 0.01, 'burn_rate': 10.0, 'status': 'page'}
assert error_budget_burn(9995, 10000, .999)['status'] == 'ticket'
assert error_budget_burn(9999, 10000, .999)['status'] == 'healthy'
print('PASS')`,hint:'Allowed error rate is 1 - SLO. Burn rate is observed error rate divided by allowed error rate.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def error_budget_burn(good, total, slo):
    if total <= 0 or not 0 < slo < 1 or not 0 <= good <= total:
        raise ValueError('invalid SLI inputs')
    error_rate = (total - good) / total
    burn_rate = error_rate / (1 - slo)
    status = 'page' if burn_rate >= 10 else 'ticket' if burn_rate >= 2 else 'healthy'
    return {'error_rate': round(error_rate, 4), 'burn_rate': round(burn_rate, 2), 'status': status}

if __name__ == '__main__':
    print(error_budget_burn(9900, 10000, 0.999))`,explanation:'Production alerting normally combines fast and slow burn windows to balance detection speed and false positives. A senior answer connects burn rate to remaining budget and user impact, not an arbitrary availability threshold.'},
  {id:'dependency-order',title:'35 · Compute a safe deployment order from dependencies',prompt:'Topologically order services so dependencies deploy before consumers, and detect a dependency cycle instead of producing a dangerous partial order.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def deployment_order(dependencies: dict[str, set[str]]) -> list[str]:
    return []

graph = {'api': {'database', 'auth'}, 'worker': {'database'}, 'database': set(), 'auth': set()}
print(deployment_order(graph))`,expected:"A valid deterministic order such as ['auth', 'database', 'api', 'worker']",tests:`order = deployment_order(graph)
assert order == ['auth', 'database', 'api', 'worker']
assert order.index('database') < order.index('api')
try: deployment_order({'a': {'b'}, 'b': {'a'}})
except ValueError: pass
else: raise AssertionError('cycle must fail')
print('PASS')`,hint:'Repeatedly select sorted nodes whose dependencies are already completed. If no node is ready while work remains, a cycle or missing dependency exists.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def deployment_order(dependencies):
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
    return completed

if __name__ == '__main__':
    graph = {'api': {'database', 'auth'}, 'worker': {'database'}, 'database': set(), 'auth': set()}
    print(deployment_order(graph))`,explanation:'Deployment ordering does not guarantee readiness or backward compatibility. Production delivery also needs health gates, expand/contract database changes, rollback boundaries and independent failure containment.'},
  {id:'config-precedence',title:'36 · Resolve configuration precedence with provenance',prompt:'Merge defaults, file configuration, environment variables, and CLI flags while recording which layer supplied every final value.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def resolve_config(layers: list[tuple[str, dict]]) -> tuple[dict, dict]:
    return {}, {}

layers = [('default', {'timeout': 5, 'retries': 2}), ('file', {'timeout': 10}), ('env', {'retries': 4})]
print(resolve_config(layers))`,expected:"({'timeout': 10, 'retries': 4}, {'timeout': 'file', 'retries': 'env'})",tests:`values, sources = resolve_config(layers)
assert values == {'timeout': 10, 'retries': 4}
assert sources == {'timeout': 'file', 'retries': 'env'}
assert resolve_config([]) == ({}, {})
print('PASS')`,hint:'Apply layers from lowest to highest precedence. Update both value and source at the same time.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def resolve_config(layers):
    values, sources = {}, {}
    for source, settings in layers:
        for key, value in settings.items():
            values[key] = value
            sources[key] = source
    return values, sources

if __name__ == '__main__':
    layers = [('default', {'timeout': 5, 'retries': 2}), ('file', {'timeout': 10}), ('env', {'retries': 4})]
    print(resolve_config(layers))`,explanation:'Configuration is an API. Production code must validate types and ranges, redact secrets, distinguish missing from empty, and expose safe provenance so operators can explain why a value won.'},
  {id:'circuit-breaker',title:'37 · Implement a circuit-breaker state transition',prompt:'Model closed, open, and half-open transitions from failures and elapsed cooldown. Keep policy separate from the network call.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def circuit_transition(state: str, consecutive_failures: int, cooldown_elapsed: bool, probe_ok: bool | None = None) -> str:
    return ''

print(circuit_transition('closed', 5, False))`,expected:"'open' after five failures; half-open after cooldown; closed only after a successful probe",tests:`assert circuit_transition('closed', 4, False) == 'closed'
assert circuit_transition('closed', 5, False) == 'open'
assert circuit_transition('open', 5, True) == 'half-open'
assert circuit_transition('half-open', 5, True, True) == 'closed'
assert circuit_transition('half-open', 5, True, False) == 'open'
print('PASS')`,hint:'Handle state-specific rules explicitly. An open breaker ignores failure count until cooldown permits one probe.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def circuit_transition(state, consecutive_failures, cooldown_elapsed, probe_ok=None):
    if state == 'closed':
        return 'open' if consecutive_failures >= 5 else 'closed'
    if state == 'open':
        return 'half-open' if cooldown_elapsed else 'open'
    if state == 'half-open':
        if probe_ok is None:
            return 'half-open'
        return 'closed' if probe_ok else 'open'
    raise ValueError(f'unknown state: {state}')

if __name__ == '__main__':
    print(circuit_transition('closed', 5, False))`,explanation:'A circuit breaker protects a dependency and the caller from retry amplification. Real implementations need concurrency safety, rolling failure windows, timeouts, metrics, fallback policy and per-dependency isolation.'},
  {id:'token-bucket',title:'38 · Enforce a token-bucket rate limit',prompt:'Simulate a token bucket for timestamped requests and return which requests are admitted. This tests state transitions and burst-versus-sustained capacity reasoning.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def admitted_requests(times: list[float], rate: float, capacity: float) -> list[bool]:
    return []

print(admitted_requests([0, 0, 0, 1, 1], rate=1, capacity=2))`,expected:'[True, True, False, True, False]',tests:`assert admitted_requests([0, 0, 0, 1, 1], 1, 2) == [True, True, False, True, False]
assert admitted_requests([], 1, 2) == []
try: admitted_requests([1, 0], 1, 2)
except ValueError: pass
else: raise AssertionError('timestamps must be ordered')
print('PASS')`,hint:'Start full. Before each request, refill by elapsed × rate but cap at capacity; admit only when at least one token remains.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def admitted_requests(times, rate, capacity):
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
    return decisions

if __name__ == '__main__':
    print(admitted_requests([0, 0, 0, 1, 1], rate=1, capacity=2))`,explanation:'Distributed enforcement needs an atomic shared state or deliberately local limits, clock semantics, fairness, retry headers and overload behavior. Rate limiting is admission control, not a substitute for capacity planning.'},
  {id:'retry-budget',title:'39 · Build a retry schedule constrained by a deadline',prompt:'Generate exponential-backoff delays without exceeding the total request deadline. An unbounded retry policy can turn a partial dependency failure into a platform outage.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def retry_schedule(base_seconds: float, max_delay: float, deadline: float) -> list[float]:
    return []

print(retry_schedule(1, 4, 8))`,expected:'[1, 2, 4] because the next delay would exceed the deadline',tests:`assert retry_schedule(1, 4, 8) == [1, 2, 4]
assert retry_schedule(0.5, 2, 1.6) == [0.5, 1.0]
assert retry_schedule(2, 10, 1) == []
print('PASS')`,hint:'Track cumulative delay. Add the next capped exponential delay only when cumulative + delay is strictly below the deadline.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def retry_schedule(base_seconds, max_delay, deadline):
    if min(base_seconds, max_delay, deadline) <= 0:
        raise ValueError('retry inputs must be positive')
    result, elapsed, attempt = [], 0.0, 0
    while True:
        delay = min(max_delay, base_seconds * (2 ** attempt))
        if elapsed + delay >= deadline:
            return result
        result.append(delay)
        elapsed += delay
        attempt += 1

if __name__ == '__main__':
    print(retry_schedule(1, 4, 8))`,explanation:'Production clients also need jitter, idempotency checks, server Retry-After support, per-attempt timeouts, a total deadline and a retry budget shared across layers.'},
  {id:'pod-capacity-fit',title:'40 · Test whether Kubernetes Pods fit allocatable capacity',prompt:'Calculate how many identical Pods fit a node using both CPU and memory requests, preserving system reserve. Identify the actual limiting resource.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def pod_capacity(alloc_cpu_m: int, alloc_mem_mib: int, pod_cpu_m: int, pod_mem_mib: int) -> dict:
    return {}

print(pod_capacity(7600, 30000, 900, 4096))`,expected:"{'pods': 7, 'limiting': 'memory'}",tests:`assert pod_capacity(7600, 30000, 900, 4096) == {'pods': 7, 'limiting': 'memory'}
assert pod_capacity(4000, 32000, 1000, 1000) == {'pods': 4, 'limiting': 'cpu'}
assert pod_capacity(4000, 4000, 1000, 1000) == {'pods': 4, 'limiting': 'both'}
print('PASS')`,hint:'Compute integer fit independently for CPU and memory; the smaller is capacity.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def pod_capacity(alloc_cpu_m, alloc_mem_mib, pod_cpu_m, pod_mem_mib):
    if min(alloc_cpu_m, alloc_mem_mib, pod_cpu_m, pod_mem_mib) <= 0:
        raise ValueError('resources must be positive')
    cpu_fit = alloc_cpu_m // pod_cpu_m
    mem_fit = alloc_mem_mib // pod_mem_mib
    limiting = 'both' if cpu_fit == mem_fit else 'cpu' if cpu_fit < mem_fit else 'memory'
    return {'pods': min(cpu_fit, mem_fit), 'limiting': limiting}

if __name__ == '__main__':
    print(pod_capacity(7600, 30000, 900, 4096))`,explanation:'The scheduler also considers max Pods, init containers, extended resources, topology, affinity, taints and fragmentation. Requests drive scheduling; limits govern runtime enforcement.'},
  {id:'subnet-overlap',title:'41 · Detect overlapping cloud network CIDRs',prompt:'Validate a proposed VPC/subnet plan and return every overlap before peering, VPN, or Kubernetes Pod ranges make routing ambiguous.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

import ipaddress

def overlapping_cidrs(cidrs: list[str]) -> list[tuple[str, str]]:
    return []

print(overlapping_cidrs(['10.0.0.0/16', '10.0.8.0/21', '10.1.0.0/16']))`,expected:"[('10.0.0.0/16', '10.0.8.0/21')]",tests:`assert overlapping_cidrs(['10.0.0.0/16', '10.0.8.0/21', '10.1.0.0/16']) == [('10.0.0.0/16', '10.0.8.0/21')]
assert overlapping_cidrs(['192.168.1.0/24', '192.168.2.0/24']) == []
try: overlapping_cidrs(['not-a-cidr'])
except ValueError: pass
else: raise AssertionError('invalid CIDR must fail')
print('PASS')`,hint:'Parse with ipaddress.ip_network(strict=False), then compare each unique pair with overlaps().',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

import ipaddress

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
    return overlaps

if __name__ == '__main__':
    print(overlapping_cidrs(['10.0.0.0/16', '10.0.8.0/21', '10.1.0.0/16']))`,explanation:'At staff level, maintain IPAM across VPC/VNet, on-prem, service, Pod and load-balancer ranges. NAT can bridge some overlaps but adds identity, observability and asymmetric-routing complexity.'},
  {id:'certificate-expiry',title:'42 · Prioritize certificate expiry risk',prompt:'Classify certificates by days remaining and return the renewal queue in urgency order, including already-expired certificates.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

from datetime import date

def renewal_queue(certificates: list[dict], today: date) -> list[tuple[str, str, int]]:
    return []

certs = [{'name':'api','expires':date(2026,8,5)}, {'name':'db','expires':date(2026,9,20)}]
print(renewal_queue(certs, date(2026,8,2)))`,expected:"[('api', 'critical', 3), ('db', 'warning', 49)]",tests:`assert renewal_queue(certs, date(2026,8,2)) == [('api', 'critical', 3), ('db', 'warning', 49)]
assert renewal_queue([{'name':'old','expires':date(2026,8,1)}], date(2026,8,2)) == [('old', 'expired', -1)]
print('PASS')`,hint:'Compute expires - today. Use expired < 0, critical <= 14, warning <= 60, otherwise healthy; sort by days then name.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def renewal_queue(certificates, today):
    queue = []
    for certificate in certificates:
        days = (certificate['expires'] - today).days
        status = 'expired' if days < 0 else 'critical' if days <= 14 else 'warning' if days <= 60 else 'healthy'
        queue.append((certificate['name'], status, days))
    return sorted(queue, key=lambda item: (item[2], item[0]))

if __name__ == '__main__':
    certs = [{'name':'api','expires':date(2026,8,5)}, {'name':'db','expires':date(2026,9,20)}]
    print(renewal_queue(certs, date(2026,8,2)))`,explanation:'Real certificate readiness includes issuer health, renewal attempts, secret propagation, reload behavior, complete trust chain and client clock skew—not only the notAfter timestamp.'},
  {id:'backup-retention',title:'43 · Select backups with daily/weekly/monthly retention',prompt:'Choose restore points deterministically while preserving recent daily backups, one weekly checkpoint, and one monthly checkpoint without duplicating the same backup.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

from datetime import date

def retained_backups(days: list[date], today: date) -> list[date]:
    # Keep last 7 daily, last 4 ISO-week representatives, and last 3 month representatives.
    return []`,expected:'A sorted unique list that preserves the newest backup in each required bucket',tests:`days = [date(2026, 8, 2), date(2026, 8, 1), date(2026, 7, 31), date(2026, 7, 20), date(2026, 7, 1), date(2026, 6, 1), date(2026, 5, 1)]
kept = retained_backups(days, date(2026, 8, 2))
assert date(2026, 8, 2) in kept and date(2026, 6, 1) in kept and len(kept) == len(set(kept))
assert kept == sorted(kept, reverse=True)
print('PASS')`,hint:'Sort newest first. Keep recent daily dates, then first-seen ISO week and month keys up to their limits, using a set for deduplication.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

from datetime import timedelta

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
  {id:'quorum-health',title:'44 · Distinguish healthy, degraded, and unsafe quorum',prompt:'Given replicas, reachable members, and writable members, classify a replicated control plane without assuming that one reachable node is safe.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def quorum_health(replicas: int, reachable: int, writable: int) -> str:
    return ''

print(quorum_health(3, 2, 1))`,expected:"'degraded' with quorum reachable; 'unsafe' without majority",tests:`assert quorum_health(3, 3, 1) == 'healthy'
assert quorum_health(3, 2, 1) == 'degraded'
assert quorum_health(3, 1, 0) == 'unsafe'
assert quorum_health(4, 2, 0) == 'unsafe'
print('PASS')`,hint:'Majority is replicas // 2 + 1. Healthy requires all reachable and exactly one writer; degraded still has majority and one writer.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def quorum_health(replicas, reachable, writable):
    if replicas <= 0 or not 0 <= reachable <= replicas or not 0 <= writable <= reachable:
        raise ValueError('invalid cluster state')
    majority = replicas // 2 + 1
    if reachable < majority or writable != 1:
        return 'unsafe'
    return 'healthy' if reachable == replicas else 'degraded'

if __name__ == '__main__':
    print(quorum_health(3, 2, 1))`,explanation:'Consensus systems differ in leader, membership and write semantics, but majority math is foundational. “Pod running” is not equivalent to safe quorum or writable service.'},
  {id:'rollout-gate',title:'45 · Decide whether a canary deployment may advance',prompt:'Evaluate SLO, error-budget burn, sample size, and regression guardrails. A canary with no traffic is unknown—not successful.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

def rollout_decision(canary: dict, baseline: dict) -> str:
    return ''

canary = {'requests': 1200, 'error_rate': .006, 'p95_ms': 240, 'burn_rate': 1.2}
baseline = {'error_rate': .005, 'p95_ms': 220}
print(rollout_decision(canary, baseline))`,expected:"'advance', 'hold', or 'rollback'",tests:`assert rollout_decision(canary, baseline) == 'advance'
assert rollout_decision({'requests': 20, 'error_rate': 0, 'p95_ms': 100, 'burn_rate': 0}, baseline) == 'hold'
assert rollout_decision({'requests': 1200, 'error_rate': .02, 'p95_ms': 500, 'burn_rate': 12}, baseline) == 'rollback'
print('PASS')`,hint:'Hold below the minimum sample. Roll back on burn >= 10, error rate > 2× baseline, or p95 > 1.5× baseline.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

def rollout_decision(canary, baseline):
    required = {'requests', 'error_rate', 'p95_ms', 'burn_rate'}
    if not required <= canary.keys():
        raise ValueError('missing canary metrics')
    if canary['requests'] < 500:
        return 'hold'
    regressed = (canary['burn_rate'] >= 10 or canary['error_rate'] > baseline['error_rate'] * 2 or canary['p95_ms'] > baseline['p95_ms'] * 1.5)
    return 'rollback' if regressed else 'advance'

if __name__ == '__main__':
    canary = {'requests': 1200, 'error_rate': .006, 'p95_ms': 240, 'burn_rate': 1.2}
    baseline = {'error_rate': .005, 'p95_ms': 220}
    print(rollout_decision(canary, baseline))`,explanation:'A production gate also needs metric freshness, representative traffic, correctness/business KPIs, deployment health and a maximum observation window. Automation should halt safely when evidence is missing.'},
  {id:'async-retry',title:'46 · Async Retry with Full Jitter',prompt:'(Interview Scenario) A junior engineer wrote a simple linear retry loop. Upgrade it: Add standard `logging`, catch specific custom exceptions rather than `Exception`, and implement AWS-style "Full Jitter" exponential backoff (`random.uniform(0, base_delay * 2**attempt)`) to prevent thundering herds on recovery.',starter:`import asyncio\nimport logging\nimport random\nfrom typing import Callable, Any, Awaitable\n\nlogging.basicConfig(level=logging.WARNING)\nlogger = logging.getLogger(__name__)\n\nclass UpstreamAPIError(Exception):\n    pass\n\n# TODO: Implement fetch_with_retry using full jitter backoff\n`,expected:"Logs warnings, uses jitter, and raises custom exception",tests:`import time\n\nasync def fail_func():\n    raise UpstreamAPIError("Test")\n\nstart = time.time()\ntry:\n    await fetch_with_retry(fail_func, max_attempts=3, base_delay=0.1)\nexcept UpstreamAPIError:\n    pass\n\nduration = time.time() - start\nassert duration > 0.05, "Backoff was too fast"\nprint('PASS')`,hint:'Full Jitter formula: `sleep_time = random.uniform(0, base_delay * (2 ** (attempt - 1)))`. Catch `UpstreamAPIError`, log it, sleep, and if it is the last attempt, re-raise.',solution:`import asyncio\nimport logging\nimport random\nfrom typing import Callable, Any, Awaitable\n\nlogging.basicConfig(level=logging.WARNING, format="%(asctime)s - %(levelname)s - %(message)s")\nlogger = logging.getLogger(__name__)\n\nclass UpstreamAPIError(Exception):\n    pass\n\nasync def fetch_with_retry(func: Callable[[], Awaitable[Any]], max_attempts: int = 3, base_delay: float = 0.1) -> Any:\n    for attempt in range(1, max_attempts + 1):\n        try:\n            return await func()\n        except UpstreamAPIError as e:\n            if attempt == max_attempts:\n                logger.error(f"Failed after {max_attempts} attempts. Last error: {e}")\n                raise\n            \n            # Full Jitter Exponential Backoff\n            sleep_time = random.uniform(0, base_delay * (2 ** (attempt - 1)))\n            logger.warning(f"Attempt {attempt} failed. Retrying in {sleep_time:.2f}s...")\n            await asyncio.sleep(sleep_time)\n\nif __name__ == '__main__':\n    async def mock_network_call():\n        raise UpstreamAPIError("Connection Reset")\n    \n    asyncio.run(fetch_with_retry(mock_network_call))\n`,explanation:'In distributed systems, if an API goes down and 10,000 clients retry exactly 1 second later, the returning API is instantly DDoSed (Thundering Herd). Senior engineers introduce "Jitter" (randomness) to smooth out the retry spikes. They also catch specific exceptions rather than broad `Exception`, which would wrongly mask `KeyboardInterrupt` or `SyntaxError`.'},
  {id:'json-validation',title:'47 · Strict JSON Validation',prompt:'Write a function that parses a raw JSON payload (a string) representing an infrastructure request. It must enforce that `gpu_count` is an integer between 1 and 8, and `image` is a string. If validation fails or JSON is malformed, raise a ValueError.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

import json

def validate_job_payload(raw_json: str) -> dict:
    # Parse the json.
    # Validate gpu_count (int, 1-8) and image (str).
    # Return the parsed dict if valid, else raise ValueError.
    return {}

payload = '{"gpu_count": 4, "image": "nvcr.io/cuda:12.1"}'
print(validate_job_payload(payload))`,expected:"{'gpu_count': 4, 'image': 'nvcr.io/cuda:12.1'}",tests:`
try:
    validate_job_payload('malformed')
    assert False, "Should raise ValueError on bad JSON"
except ValueError:
    pass

try:
    validate_job_payload('{"gpu_count": 10, "image": "ubuntu"}')
    assert False, "Should raise ValueError on gpu_count > 8"
except ValueError:
    pass

try:
    validate_job_payload('{"gpu_count": "4", "image": "ubuntu"}')
    assert False, "Should raise ValueError on string gpu_count"
except ValueError:
    pass

assert validate_job_payload('{"gpu_count": 4, "image": "ubuntu"}')["gpu_count"] == 4
print('PASS')`,hint:'Use `json.loads(raw_json)`. Catch `json.JSONDecodeError` and re-raise as `ValueError`. Check `type(data["gpu_count"]) is int`.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

import json

def validate_job_payload(raw_json):
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON format")
        
    if "gpu_count" not in data or "image" not in data:
        raise ValueError("Missing required fields")
        
    if type(data["gpu_count"]) is not int or not (1 <= data["gpu_count"] <= 8):
        raise ValueError("gpu_count must be an integer between 1 and 8")
        
    if type(data["image"]) is not str:
        raise ValueError("image must be a string")
        
    return data

if __name__ == '__main__':
    payload = '{"gpu_count": 4, "image": "nvcr.io/cuda:12.1"}'
    print(validate_job_payload(payload))`,explanation:'In modern Python microservices, this manual validation is usually fully automated by Pydantic (used deeply in FastAPI). Validating inputs at the absolute edge of your API guarantees that deeply nested infrastructure logic never crashes due to a string being passed where a math operation expected an integer.'},
  {id:'async-gather',title:'48 · Concurrent API Aggregation',prompt:'You need to fetch the health status of 3 different Kubernetes clusters. Doing this synchronously takes 3x the latency. Use `asyncio.gather` to fetch all 3 concurrently and return a dictionary mapping the cluster ID to its status.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

import asyncio

async def fetch_cluster(cluster_id: str) -> str:
    await asyncio.sleep(0.1) # Simulate network latency
    return "healthy" if cluster_id != "cluster-2" else "degraded"

async def check_all_clusters(clusters: list[str]) -> dict:
    # Use asyncio.gather to run fetch_cluster for all clusters concurrently.
    # Return a dict mapping cluster_id -> status
    pass
`,expected:"{'cluster-1': 'healthy', 'cluster-2': 'degraded', 'cluster-3': 'healthy'}",tests:`import time

start = time.time()
results = await check_all_clusters(["cluster-1", "cluster-2", "cluster-3"])
duration = time.time() - start

assert results == {"cluster-1": "healthy", "cluster-2": "degraded", "cluster-3": "healthy"}
assert duration < 0.2, "Execution took too long; tasks were not run concurrently."
print('PASS')`,hint:'Create a list of awaitables: `tasks = [fetch_cluster(c) for c in clusters]`. Then `results = await asyncio.gather(*tasks)`. Zip the original clusters with the results to build the dictionary.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

import asyncio

async def check_all_clusters(clusters):
    # Create the concurrent tasks
    tasks = [fetch_cluster(c) for c in clusters]
    
    # Await them all at once
    statuses = await asyncio.gather(*tasks)
    
    # Combine the inputs with the outputs
    return dict(zip(clusters, statuses))`,explanation:'When building a control-plane API or dashboard backend, a single request often needs data from multiple backend APIs. Sequential awaiting (`await a()`, then `await b()`) ruins performance. `asyncio.gather` fires them simultaneously, bounding the total latency to the single slowest request.'},
  {id:'file-batching',title:'49 · Memory-Safe Generator',prompt:'You need to parse a 50GB JSONL log file. Reading `file.readlines()` will OOM-kill your container. Write a Python generator function `process_logs` that yields one parsed JSON dict at a time from a list of strings, filtering out logs where `level != "ERROR"`.',starter:`from typing import List, Dict, Tuple, Optional, Any, Union

import json

def process_logs(lines: list[str]):
    # Do not return a full list! Use the 'yield' keyword.
    # Parse each line with json.loads. 
    # Only yield the dictionary if data['level'] == 'ERROR'
    pass

logs = [
    '{"level": "INFO", "msg": "started"}',
    '{"level": "ERROR", "msg": "CUDA OOM"}',
    '{"level": "ERROR", "msg": "Node lost"}'
]
for error in process_logs(logs):
    print(error['msg'])`,expected:"'CUDA OOM' then 'Node lost'",tests:`
logs = [
    '{"level": "INFO", "msg": "a"}',
    '{"level": "ERROR", "msg": "b"}',
    '{"level": "WARN", "msg": "c"}',
    '{"level": "ERROR", "msg": "d"}'
]

gen = process_logs(logs)
import types
assert isinstance(gen, types.GeneratorType), "Function must be a generator (use yield, not return)"

results = list(gen)
assert len(results) == 2
assert results[0]['msg'] == 'b'
assert results[1]['msg'] == 'd'
print('PASS')`,hint:'Loop over the lines. Inside the loop, parse the json. If the level is ERROR, use `yield data` instead of `return` or appending to a list.',solution:`from typing import List, Dict, Tuple, Optional, Any, Union

import json

def process_logs(lines):
    for line in lines:
        try:
            data = json.loads(line)
            if data.get('level') == 'ERROR':
                yield data
        except json.JSONDecodeError:
            continue`,explanation:'Generators (`yield`) are mandatory for Data/AI Infrastructure. Whether you are streaming a 50GB dataset into a training loop, paginating through 10,000 Kubernetes pods, or exporting billing metrics, returning a massive list will exhaust memory and kill the pod. Generators keep the memory footprint bounded to exactly 1 item at a time.'},
  {id:'oop-polymorphism',title:'50 · OOP Polymorphism: The Senior Cloud Interface',prompt:'(Interview Scenario) You are given a junior script that raises NotImplementedError. As a senior, upgrade this to a production-ready Abstract Base Class. You must use `abc.ABC`, `@abstractmethod`, `logging`, strict type hints, a `dataclass` for configuration, and robust error handling.',starter:`import logging\nfrom abc import ABC, abstractmethod\nfrom dataclasses import dataclass\n\n# TODO: Define a frozen dataclass NodeConfig(instance_type: str, region: str)\n# TODO: Define CloudProvider(ABC) with abstractmethod provision_node(self, config: NodeConfig) -> str\n# TODO: Implement AWSProvider and GCPProvider\n# TODO: Implement orchestration function scale_out(provider, config) with logging\n`,expected:"Proper abstract base classes and logging",tests:`import logging\nimport sys\nfrom abc import ABC\n\nassert issubclass(CloudProvider, ABC), "CloudProvider must inherit from abc.ABC"\nassert "provision_node" in CloudProvider.__abstractmethods__, "provision_node must be an @abstractmethod"\n\nconfig = NodeConfig(instance_type="gpu.large", region="us-east-1")\naws = AWSProvider()\nassert "aws" in aws.provision_node(config).lower()\n\nprint('PASS')`,hint:'Use `from abc import ABC, abstractmethod`. Pass a dataclass into the method instead of raw strings. Use `logging.getLogger(__name__)`.',solution:`import logging\nfrom abc import ABC, abstractmethod\nfrom dataclasses import dataclass\n\nlogging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")\nlogger = logging.getLogger(__name__)\n\n@dataclass(frozen=True)\nclass NodeConfig:\n    instance_type: str\n    region: str\n\nclass CloudProvider(ABC):\n    @abstractmethod\n    def provision_node(self, config: NodeConfig) -> str:\n        \"\"\"Provisions a node and returns the instance ID.\"\"\"\n        pass\n\nclass AWSProvider(CloudProvider):\n    def provision_node(self, config: NodeConfig) -> str:\n        logger.info(f"Provisioning AWS EC2 {config.instance_type} in {config.region}")\n        return f"i-aws-{config.instance_type}"\n\nclass GCPProvider(CloudProvider):\n    def provision_node(self, config: NodeConfig) -> str:\n        logger.info(f"Provisioning GCP Compute {config.instance_type} in {config.region}")\n        return f"gcp-{config.instance_type}"\n\ndef scale_out(provider: CloudProvider, config: NodeConfig) -> str:\n    try:\n        node_id = provider.provision_node(config)\n        logger.info(f"Successfully scaled out: {node_id}")\n        return node_id\n    except Exception as e:\n        logger.error(f"Failed to scale out: {e}")\n        raise\n\nif __name__ == '__main__':\n    config = NodeConfig(instance_type="gpu.large", region="us-east-1")\n    scale_out(AWSProvider(), config)\n`,explanation:'In a senior interview, simply raising NotImplementedError is not enough. You must demonstrate interface enforcement (ABC), immutability (frozen dataclasses), observability (structured logging), and proper type hints. This proves your code can safely scale across a team of developers.'},
  {id:'decorator-timer',title:'51 · Execution Timer: Production Decorator',prompt:'(Interview Scenario) A junior engineer wrote a timer decorator using `time.time()` and `print()`. Upgrade this to senior level: Use `time.perf_counter()` for high-resolution timing, `logging` for observability, `functools.wraps` to preserve docstrings, and a `try/finally` block so the timer still logs even if the function crashes.',starter:`import logging\nimport time\nfrom functools import wraps\nfrom typing import Callable, Any\n\nlogging.basicConfig(level=logging.INFO)\nlogger = logging.getLogger(__name__)\n\n# TODO: Implement time_execution decorator\n`,expected:"Logs high-res duration regardless of exceptions",tests:`import io\nimport logging\n\nlog_capture = io.StringIO()\nch = logging.StreamHandler(log_capture)\nlogger.addHandler(ch)\n\n@time_execution\ndef fail_task():\n    raise ValueError("Crashing!")\n\ntry:\n    fail_task()\nexcept ValueError:\n    pass\n\noutput = log_capture.getvalue()\nassert "executed in" in output.lower(), "Must log duration even if function raises an exception!"\nprint('PASS')`,hint:'Use `start = time.perf_counter()`. Wrap the function call in `try:` and do the timing/logging in a `finally:` block.',solution:`import logging\nimport time\nfrom functools import wraps\nfrom typing import Callable, Any\n\nlogging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")\nlogger = logging.getLogger(__name__)\n\ndef time_execution(func: Callable) -> Callable:\n    @wraps(func)\n    def wrapper(*args: Any, **kwargs: Any) -> Any:\n        start_time = time.perf_counter()\n        try:\n            return func(*args, **kwargs)\n        finally:\n            duration = time.perf_counter() - start_time\n            logger.info(f"Function '{func.__name__}' executed in {duration:.4f}s")\n    return wrapper\n\nif __name__ == '__main__':\n    @time_execution\n    def heavy_task():\n        time.sleep(0.1)\n        return "Done"\n    \n    heavy_task()\n`,explanation:'Senior engineers know that `time.time()` is subject to NTP clock skew (time can go backward on a server!). They use `time.perf_counter()`. They also use `try/finally` to guarantee metrics are emitted even if the task fails, and use `logging` instead of `print` so the output can be scraped by monitoring agents.'},
  {id:'dataclasses',title:'52 · Dataclasses and Default Mutability',prompt:'Create a `dataclass` called `JobConfig` with a `job_name` string, an `image` string, and a list of strings called `flags`. You MUST ensure that the `flags` list does not share memory across instances (use `field(default_factory=list)`).',starter:`from dataclasses import dataclass, field
from typing import List

# Use the @dataclass decorator
class JobConfig:
    pass

job1 = JobConfig(job_name="train", image="cuda:12")
job2 = JobConfig(job_name="infer", image="cuda:12")
job1.flags.append("--verbose")`,expected:"job2.flags remains empty",tests:`
job1 = JobConfig(job_name="a", image="b")
job2 = JobConfig(job_name="c", image="d")

job1.flags.append("test")
assert "test" not in job2.flags, "CRITICAL: job1 and job2 are sharing the same 'flags' list in memory!"
assert job1.job_name == "a"
print('PASS')`,hint:'Use `@dataclass`. Add fields: `job_name: str`, `image: str`, and `flags: List[str] = field(default_factory=list)`.',solution:`from dataclasses import dataclass, field
from typing import List

@dataclass
class JobConfig:
    job_name: str
    image: str
    flags: List[str] = field(default_factory=list)

if __name__ == '__main__':
    job1 = JobConfig(job_name="train", image="cuda:12")
    job2 = JobConfig(job_name="infer", image="cuda:12")
    job1.flags.append("--verbose")`,explanation:'If you set `flags: list = []` as a class variable, Python evaluates `[]` exactly once when the file is loaded. Every instance of `JobConfig` will share the exact same list in RAM, leading to horrific, hard-to-debug cross-contamination bugs in production. `default_factory=list` creates a fresh list every time a class is instantiated.'},
];

const labGroups: {name: string; ids: string[]}[] = [
  {name: 'Tier 1 — Start here if Python feels unfamiliar', ids: ['gpu-temp', 'node-health-count', 'fault-report', 'lowercase-gpus', 'split-node-line', 'safe-memory-pct']},
  {name: 'Tier 2 — Production Python & systems evidence', ids: ['regex', 'retry', 'gpu', 'subprocess', 'retry-storm', 'oom', 'scheduling', 'prometheus', 'runbook', 'linux-load', 'reconcile', 'timeline']},
  {name: 'Tier 3 — Senior GPU, distributed & infrastructure ops', ids: ['capacity', 'xid-correlation', 'nccl-ranks', 'inference-slo', 'bmc-sensors', 'firmware-drift', 'ansible-idempotency', 'terraform-risk', 'slurm-fairshare', 'mpi-ranks', 'enroot-gpu', 'canary-check']},
  {name: 'Tier 4 — General SRE Python & software design', ids: ['access-log-summary', 'latency-percentile', 'alert-dedup', 'slo-burn', 'dependency-order', 'config-precedence', 'circuit-breaker', 'token-bucket', 'retry-budget', 'pod-capacity-fit', 'subnet-overlap', 'certificate-expiry', 'backup-retention', 'quorum-health', 'rollout-gate']},
  {name: 'Tier 5 — Advanced Microservices & Async Ops (Senior)', ids: ['async-retry', 'json-validation', 'async-gather', 'file-batching']},
  {name: 'Tier 6 — Advanced OOP, Classes & Decorators', ids: ['oop-polymorphism', 'decorator-timer', 'dataclasses']},
];

export default function Labs() {
  const [index, setIndex] = useState(0);
  return <Layout title="Python SRE Academy" description="Learn Python algorithms and production engineering for SRE">
    <main className="pageShell">
      <header className="pageHeader" style={{borderBottom: '2px solid var(--ifm-color-primary)', paddingBottom: '2rem'}}>
        <span className="eyebrow">Python scripting for operations</span>
        <h1>Python SRE Academy</h1>
        <p><strong>{labs.length} complete study modules</strong> arranged in six tiers to teach you the fundamentals of Python string/list manipulation, dict parsing, and generic SRE logic. <em>Note: If you are already comfortable with Python and looking for advanced cluster-level AI Infrastructure labs, please proceed to the <Link to="/curriculum/nvidia-zero-to-hero">Zero to Hero Masterclasses</Link>.</em></p>
      </header>
      <div className="prompt"><strong>How to practise:</strong> Write the smallest deterministic decision first, run its contract tests, then explain which real command or metric would supply each input.</div>
      <div className="labLayout">
        <aside className="scenarioList">
          {labGroups.map(group => 
            <div key={group.name}>
              <h4>{group.name}</h4>
              {group.ids.map(id => { 
                const i = labs.findIndex(lab => lab.id === id); 
                return <button className={i === index ? 'active' : ''} onClick={() => setIndex(i)} key={id}>{labs[i].title}</button>; 
              })}
            </div>
          )}
        </aside>
        <PythonPlayground exercise={labs[index]}/>
      </div>
    </main>
  </Layout>;
}
