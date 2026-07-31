# Volume 1 — Senior Deep Dives 1-6 + Troubleshooting Exercise: Addendum
*(the original Deep Dive text is already strong — real commands, real tables, correctly pitched at senior level. These largely extend Chapters 1-6, which now have diagrams/outputs/scenarios. Rather than duplicate, this addendum adds only what's genuinely new: a mnemonic index, cross-references, and the couple of gaps worth closing.)*

## Quick cross-reference (so you use both halves together, not as duplicates)
| Deep Dive | Extends chapter | What's genuinely new in the Deep Dive vs the chapter |
|---|---|---|
| 1 — syscalls/scheduling | Ch1 | the observation→mechanism→validate table — memorize this table format, it's a reusable interview answer template |
| 2 — memory/NUMA/OOM | Ch2 | NUMA-and-GPU-locality framing — this is the one genuinely new concept not in Ch2; see below |
| 3 — storage I/O to NVMe | Ch3 | checkpoint-specific latency queue behavior |
| 4 — packet-level networking | Ch4 | conntrack specifically (see below — worth a standalone note) |
| 5 — containers/overlayfs | Ch5 | runtime boundary framing |
| 6 — GPU node readiness | new ground | driver/toolkit/operator readiness checklist — closest thing to a pre-flight checklist for the actual job |

➕ **NUMA + GPU, made concrete (Deep Dive 2's most important paragraph, with the diagram it's missing):**
```
Node 0: CPU 0-15 -- local RAM -- PCIe root complex A -- GPU0, GPU1, NIC0
Node 1: CPU 16-31 -- local RAM -- PCIe root complex B -- GPU2, GPU3, NIC1
                 \-- cross-node QPI/UPI hop (slower) --/
```
A data-loader thread pinned to Node-0 CPUs feeding GPU2 (Node-1) pays a real, measurable latency tax on every batch — and this is invisible to `nvidia-smi` utilization numbers, which only show the GPU side. `numactl --hardware` + `lscpu -e` (from the Deep Dive's own command list) is how you'd catch this. Kubernetes Topology Manager (`--topology-manager-policy=single-numa-node`) is the cluster-level lever to prevent it at scheduling time — worth naming as the fix, not just the diagnosis.

➕ **conntrack — the piece Deep Dive 4 names but a table helps fix in memory (NAT's hidden state table):**
```bash
conntrack -L | wc -l              # current tracked connections
cat /proc/sys/net/netfilter/nf_conntrack_max   # the ceiling
```
Every NAT'd connection (which, per Chapter 4, is *every* Service-routed connection in the default kube-proxy iptables mode) gets an entry here. **Table exhaustion is a real, distinct failure mode** from TIME_WAIT pileup (Ch4.2) — symptom looks similar (new connections failing under load) but the fix is different (raise `nf_conntrack_max` / reduce connection churn, not application-level pooling alone). Worth being able to name both failure modes and explain why they look alike but aren't.

➕ **Mnemonic for the whole Deep-Dive-1-through-6 arc, tying back to the "senior troubleshooting moves from symptom to mechanism" figure (Figure A):**
*"Every symptom lives at a layer — don't fix the symptom's layer, fix the mechanism's layer."* CPU-looks-idle-but-slow → check throttling (mechanism, not the symptom's CPU-graph layer). DNS-resolves-but-times-out → check routing/NAT/TLS (mechanism), not DNS (symptom's layer). This one sentence is a legitimate answer to "how do you approach troubleshooting" as an opener, before you even get into specific tools.

## Troubleshooting exercise ("Slow GPU job with healthy Kubernetes")
The original exercise is well-designed — it's the correct capstone, forcing the "host mechanism, not Kubernetes object state" instinct this whole volume builds. One addition:

➕ **The generalizable checklist version, worth having as your own mental template for any "X looks healthy but Y is slow" question in the actual interview:**
```
1. Confirm the K8s object state really is healthy (Running, no OOMKilled, no throttling in cpu.stat)
   — this rules out the Volume-1-Ch1/2/5 mechanisms explicitly, don't skip it
2. Follow the data path the workload actually uses (Ch3's AI data-path chain: disk → page cache
   → pinned memory → PCIe → GPU HBM) and instrument each hop
3. Check the resource plane Kubernetes doesn't account for at all: GPU memory/utilization via
   nvidia-smi/DCGM (Ch2's CUDA-OOM-vs-cgroup-OOM distinction), NUMA locality (Deep Dive 2)
4. Only after 1-3 are exonerated, suspect the workload's own code/framework behavior
```
This ordering — K8s object state → data path → GPU-specific plane → application code — is the generalized version of the specific exercise, and it's the shape almost every "why is my GPU workload underperforming" interview question takes.
