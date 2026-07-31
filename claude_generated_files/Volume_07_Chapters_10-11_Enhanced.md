# Chapter 10 — Incident playbook: GPU workload slow or failing
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Walk from workload SLO through GPU, container/runtime, host, network and storage evidence.

## Worked scenario
**Situation:** Distributed training throughput drops 35% after maintenance with no application code change.

1. Scope: one job/node group/all jobs; compare a known-good baseline.
2. Inventory changes: driver, firmware, operator, kernel, NIC, switch, storage, topology.
3. GPU: utilization, clocks, memory, health/error/throttle indicators.
4. Host: CPU/memory/I/O pressure and cgroup throttling.
5. Fabric: link state, RDMA/NIC counters, drops/congestion, collective benchmark.
6. Storage: dataset/checkpoint latency if step timeline aligns with I/O.
7. Perform a controlled node/path benchmark or rollback that isolates the changed layer.

**Conclusion:** "No code change" narrows change history, but evidence must still identify the bottleneck.

➕ **ASCII: the full evidence-descent order from step 1-7, drawn as the layered stack this whole volume has been building toward:**
```
Step 1: SCOPE            "which jobs, since when, vs what baseline"    (Ch.1, Deep Dive 1)
             │
Step 2: CHANGE INVENTORY  "what changed at maintenance window"          (this chapter)
             │
Step 3: GPU               DCGM util/clocks/memory/Xid/ECC               (Ch.5, Deep Dive 4)
             │
Step 4: HOST              CPU/mem pressure, cgroup throttling           (Vol.1 Ch.1/2)
             │
Step 5: FABRIC             link state, RDMA counters, collective bench   (new ground here)
             │
Step 6: STORAGE            dataset/checkpoint I/O latency                (Vol.1 Ch.3 territory)
             │
Step 7: ISOLATE            controlled benchmark/rollback of ONE layer     (proves, doesn't just suggest)
```
The ordering is deliberate: GPU (Step 3) before Host (Step 4) because GPU telemetry is cheaper to check and rules out/in the highest-signal layer first; Fabric (Step 5) after Host because a fabric problem often *presents* as host-level stalling (a stuck NCCL collective looks like a hung process); Storage (Step 6) last because it only matters "if the step timeline aligns with I/O" — you check it conditionally, not by default.

➕ **Sample fabric-layer evidence for step 5, annotated — the piece the original text names but doesn't show output for:**
```
$ nvidia-smi nvlink -e   # NVLink error counters, per GPU
GPU 0: NVLink Errors
   Link 0: Replay Errors: 0, Recovery Errors: 0, CRC Errors: 0
   Link 1: Replay Errors: 142, Recovery Errors: 3, CRC Errors: 891   ← link 1 is unhealthy

$ ibstat mlx5_0 | grep -E "State|Rate"
State: Active
Rate: 100    ← Gb/s; if this reads lower than the NIC's rated speed, link negotiated down after maintenance

$ ib_write_bw -d mlx5_0 -F --report_gbits    # controlled RDMA bandwidth benchmark (step 7's "isolate")
...
 Bandwidth peak[Gb/sec]    94.2    ← compare directly to a known-good baseline number from before maintenance
```
`CRC Errors: 891` on one link with all others at 0 is the exact kind of asymmetric evidence that separates "the whole fabric degraded" from "one bad cable/port after a maintenance window that involved physical reseating" — worth naming explicitly, because the fix (replace one cable) is trivial once you have this evidence and a nightmare to find without it.

➕ **Worked scenario — the "GPU looks fine but the collective is still slow" trap, extending step 3 vs step 5:**
> **Situation:** Following the maintenance in the original scenario: DCGM shows normal utilization, clocks, temps and zero Xid/ECC errors on every GPU in the affected job (step 3 fully exonerated). Throughput is still down 35%.
> 1. Per-GPU health being clean doesn't test the *fabric between* GPUs — a training job's throughput depends on collective operations (all-reduce, etc.) whose latency is dominated by interconnect, not by any single GPU's own health.
> 2. Move to step 5: NVLink/InfiniBand counters as shown above. Find one degraded link (asymmetric CRC errors) or a negotiated-down link rate.
> 3. Run `ib_write_bw` (step 7's controlled benchmark) node-pair by node-pair to localize which specific link/node is the laggard — a distributed job's overall throughput is gated by its *slowest* participant in a synchronous collective, so one bad link can drag down the entire job's reported throughput even though every other node/GPU benchmarks perfectly.
> **Conclusion:** "no code change" plus "GPU health is clean" still leaves an entire evidence layer (fabric) unexamined — this is precisely why the chapter's step list has GPU and Fabric as separate steps rather than folding fabric into "GPU," and it's a common miss for engineers who stop investigating once `nvidia-smi`/DCGM look clean.

➕ **Shortcut:** *"A synchronous collective is only as fast as its slowest link — check pairwise, not just per-GPU."* If DCGM is clean everywhere but throughput is still down on a multi-node job, go straight to fabric counters and a pairwise bandwidth benchmark rather than re-checking GPU health again.

**Interview-ready line:** "For a GPU throughput regression with no code change, I walk GPU health, then host pressure, then fabric — because per-GPU telemetry being clean only exonerates the device, not the interconnect a distributed job's collectives actually depend on."

## Practice
➕ 1. A single-node (no fabric involved) inference job's throughput drops 20% after the same maintenance window. Explain which step of the 7-step list becomes irrelevant for this scoped case and why, and re-order the remaining checks by expected information-per-minute-spent for a single-node scenario.
➕ 2. Using the `nvidia-smi nvlink -e` output above, write the one-liner that would scan all 8 GPUs on a node and print only links with nonzero CRC errors, so you don't have to eyeball every link on every GPU during an incident.

---

# Chapter 11 — Incident communication and postmortem
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Separate mitigation, root cause, contributing factors and prevention; communicate by audience.

During an incident, communicate impact, scope, current hypothesis/evidence, mitigation and next decision time. Afterward, root cause should describe the mechanism that produced failure; contributing factors explain why impact was larger or detection/recovery slower. Action items should change systems/processes, not say "be more careful."

## Practice
1. Write a PromQL expression for 5xx ratio and state assumptions about labels.
2. Design three GPU alerts: one hardware-health, one capacity, one inference SLO alert.
3. For a CrashLoop, list the exact Kubernetes evidence that distinguishes OOM from app exit.
4. Write a one-paragraph executive incident update without losing factual accuracy.

## Targeted references
[NVIDIA: Monitoring GPUs in Kubernetes with DCGM](https://developer.nvidia.com/blog/monitoring-gpus-in-kubernetes-with-dcgm/) - GPU telemetry -> exporter -> Prometheus/Grafana.

[NVIDIA: GPU Usage Monitor](https://developer.nvidia.com/blog/get-real-time-visibility-into-gpu-usage-across-kubernetes-clusters/) - Recent integrated GPU/Kubernetes visibility pattern.

[Prometheus documentation](https://prometheus.io/docs/) - Metric model, PromQL and alerting reference.

➕ **ASCII: the incident-timeline field structure this chapter's opening paragraph is describing, made concrete — the "five things to say" template:**
```
T+0    DETECTED    "Impact: X% error rate on inference-gateway, us-east.
                     Scope: affects tenants A,B,C, not D. Since: 14:02 UTC."
T+8m   UPDATE       "Hypothesis: correlates with driver rollout at 13:58.
                     Evidence: DCGM Xid errors on gpu-nodes 04-09.
                     Mitigation in progress: draining affected nodes.
                     Next update: 14:30 or on change, whichever first."
T+22m  MITIGATED    "Nodes drained, traffic rerouted. Error rate back to baseline
                     at 14:24. Root cause investigation continues — this is
                     NOT yet a resolved incident, monitoring for recurrence."
T+3d   POSTMORTEM   root cause / contributing factors / action items (below)
```
Every update follows the same five-field shape (impact, scope, hypothesis+evidence, mitigation, next decision time) the chapter names — the discipline is saying all five *every time*, even "no change since last update," because silence during an incident is read as "nothing is happening" by anyone watching.

➕ **Root cause vs contributing factor vs action item, disambiguated with one incident run through all three — because conflating them is the most common postmortem-writing mistake:**
```
ROOT CAUSE (the mechanism):
  "A driver rollout introduced a regression causing Xid 79 (GPU fell off the bus)
   errors under sustained load on affected nodes."

CONTRIBUTING FACTORS (why impact was LARGER or detection/recovery SLOWER
— explicitly NOT the same claim as root cause):
  - No canary/staged rollout for the driver update — it hit 100% of the
    affected node pool simultaneously, which is why blast radius was large.
  - DCGM Xid-error alerting existed but had a 30-minute-sustained threshold
    tuned for noise reduction — this delayed detection by ~18 minutes versus
    a threshold tuned for this specific error's known severity.

ACTION ITEMS (must change systems/process, per the chapter's explicit ban
on "be more careful"):
  - Require staged/canary rollout for all driver/firmware changes touching
    >10% of GPU fleet in one change window. [systemic — a rollout policy]
  - Add a separate, lower-threshold, higher-severity alert specifically for
    Xid error codes on NVIDIA's own "hardware fault, act now" list, distinct
    from the general sustained-error alert. [systemic — a new alert rule]
  - NOT an action item: "engineers should double-check driver rollouts before
    pushing" — this is exactly the "be more careful" pattern the chapter
    explicitly rules out; it changes no system or process.
```

➕ **Worked scenario — writing the executive update the original Practice question 4 asks for, shown end to end with the discipline of "without losing factual accuracy":**
> **Situation:** The Xid-79 incident above needs a one-paragraph update for a VP with no infrastructure background, 10 minutes after mitigation.
> **Draft:** *"Between 14:02 and 14:24 UTC, a subset of inference traffic (tenants A, B, C; roughly 8% of total request volume) experienced elevated errors due to a hardware-level fault on several GPU nodes, triggered by a driver update earlier that day. We detected the issue via automated monitoring, took the affected nodes out of service, and restored normal error rates within 22 minutes. No data was lost. We are still completing root-cause analysis and will follow up with prevention steps, including changes to how driver updates are rolled out."*
> Why this preserves accuracy while dropping jargon: "Xid 79" becomes "hardware-level fault" (accurate, not dumbed-down-wrong); "8% of total request volume" is a real, checkable number, not a vague "some users"; "we are still completing root-cause analysis" is an honest hedge — it does not claim root cause is already fully known just to sound resolved, which is a common and damaging exec-update failure mode (prematurely declaring root cause before evidence supports it).
> **Conclusion:** the skill being tested isn't "write simpler sentences," it's "preserve every factually load-bearing number and honesty-hedge while removing jargon" — that's a materially harder skill than plain simplification, and it's what Practice #4 is actually checking for.

➕ **Shortcut:** *"Impact, scope, hypothesis+evidence, mitigation, next update — say all five, every time, even if one is 'unchanged.'"* This is the field checklist for every incident comms update, live or postmortem.

**Interview-ready line:** "Root cause is the mechanism that broke; contributing factors are why it was worse or slower to catch than it had to be; action items change a system or a process — never a person's diligence — and I keep those three things in visibly separate sections so a postmortem doesn't quietly turn into blame."

## Practice
➕ 5. Take the contributing-factors list above and, for each one, write the action item that directly closes it — confirm every contributing factor has a corresponding systemic fix, not just the root cause.
➕ 6. Rewrite the executive update above assuming root cause was *not* yet known at the time of the update (only mitigation had happened) — identify which sentence changes and why the honesty-hedge becomes even more load-bearing in that version.
