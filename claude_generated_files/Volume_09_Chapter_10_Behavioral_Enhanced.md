# Chapter 10 — Behavioral and stakeholder stories
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Structure examples around ownership, conflict, customer ambiguity, incident leadership and measurable outcome.

Use STAR, but make the technical decision visible. Situation should be brief. Task states your responsibility. Action is the bulk: how you reasoned, influenced, handled trade-offs and changed the system. Result includes measurable impact and what you learned. Senior stories should show decisions under ambiguity, not only task execution.

| Theme | Story ingredients |
|---|---|
| Incident | scope, evidence, mitigation, coordination, prevention, MTTR/reliability result |
| Cost optimization | baseline, constraints, safe changes, performance guardrail, quantified savings |
| Architecture disagreement | requirements, alternatives, trade-off evidence, stakeholder alignment |
| Customer ambiguity | discovery, reframing problem, PoC/decision, adoption outcome |
| Failure/lesson | wrong assumption, signal missed, correction, system/process change |

---

## Original — Question set H: Behavioral stories for a senior SA

Prepare evidence-rich stories around: a production incident where you reduced uncertainty; a design where you rejected a fashionable technology; a disagreement with an application/customer team; a cost optimization that preserved reliability; an automation that replaced manual toil; a migration with risk control; and a situation where you explained a complex system to a non-specialist stakeholder. Use situation/context briefly, spend most time on decisions, trade-offs and measurable outcome.

---

## ➕ Additions

➕ **STAR-for-seniors as a time-budget diagram (the ratio interviewers are actually grading):**
```
 0-------10%-----------------------------------70%----------90%---100%
 |  S    |  T    |            A (the bulk)              |    R      |
 | brief | your  |  reasoning, trade-offs, influence,    | measurable|
 |       | resp. |  what you changed in the system        | + lesson  |
 └───────┴───────┴─────────────────────────────────────────┴──────────┘
```
➕ **Memory hook:** *"Situation and Task are the appetizer, Action is the meal, Result is the receipt."* If your Situation/Task takes more than ~15% of your answer time, you're under-delivering on Action — the part that actually demonstrates seniority.

➕ **Interview-ready line for opening ANY behavioral story concisely:**
> "Quick context: [one sentence on situation], my role was [one sentence on task] — the interesting part is what I actually decided, so let me get to that."
This explicitly signals to the interviewer that you know where the value is, and it's a permission-giving sentence that lets you skip ahead without feeling like you're withholding context.

➕ **Annotated sample STAR transcript — an incident story, narrated with WHY each part works (using the "Incident" row's ingredients: scope, evidence, mitigation, coordination, prevention, MTTR/reliability result):**

> "**Situation:** A multi-tenant inference platform had a P99 latency spike affecting three customers simultaneously. **Task:** I was the on-call SA/SRE and the first person to triage." *(← 2 sentences, done — no elaboration on how the pager went off)*
>
> "**Action:** First move was scoping — was this one model, one node, or fleet-wide? I checked whether the affected customers shared a GPU pool, and they did, which immediately narrowed the hypothesis to something shared — noisy-neighbor contention or a shared dependency, not three independent problems." *(← shows the C-M-H-E-R framework from Chapter 1 being applied live inside a behavioral answer — this is a deliberate cross-reference technique: use the technical framework INSIDE your STAR story to demonstrate both skills at once)*
>
> "I found via DCGM metrics that one tenant's batch job had spiked GPU memory usage on the shared MIG-less pool, which was forcing the scheduler into smaller effective batches for everyone co-located. I mitigated by cordoning that node and draining the offending workload to a dedicated pool — a reversible, low-blast-radius action — rather than restarting the whole platform, which would have hit customers who weren't even affected." *(← names the specific mitigation AND explicitly justifies why it was chosen over a more drastic alternative — this is the trade-off-visibility the chapter asks for)*
>
> "I coordinated with the account team to communicate proactively to the three affected customers before they escalated, which mattered as much as the technical fix for how the incident was perceived." *(← coordination ingredient, tied to a customer-facing SA's actual job, not generic "I informed stakeholders")*
>
> "**Result:** MTTR was 22 minutes from page to mitigation. The prevention follow-up was proposing MIG-based hard isolation for that pool specifically, which we implemented within two weeks — since then, zero cross-tenant latency incidents on that pool." *(← quantified, and explicitly closes the loop with a system change, not just "we fixed it")*

➕ **Extra worked story sketch (new) — filling a gap the original theme table doesn't explicitly cover: "an automation that replaced manual toil" (named in Question set H but with no worked example anywhere in the source):**
> **Situation/Task:** Weekly GPU node health checks (driver version drift, Xid history, ECC error trend) were done manually by whoever was on-call, taking ~3 hours and frequently skipped under load.
> **Action:** I wrote a scheduled job that pulled `nvidia-smi`/DCGM data fleet-wide, classified nodes using thresholds derived from Chapter 5's Xid-severity distinctions (hardware-likely vs software-recoverable), and posted a ranked drain-candidate list to the team channel automatically. The key decision was making it advisory (post a ranked list) rather than fully automated draining — I explicitly chose not to auto-drain nodes because a false positive draining a healthy node under load has a worse blast radius than a 10-minute delay for a human to confirm.
> **Result:** Manual check time went from ~3 hours/week to ~15 minutes of review, and mean time to detect a degrading GPU node dropped from "next scheduled manual check" (up to a week) to under an hour.
> **Interview-ready line:** "The judgment call worth highlighting isn't the automation itself, it's choosing advisory-not-autonomous action for anything with an asymmetric failure cost — that's usually the more senior decision than 'I automated it.'"

## Practice
➕ 4. Draft your own "automation that replaced manual toil" story using the sketch above as a template — specifically identify one decision in your story where you chose a *less* automated / *less* aggressive option deliberately, and be ready to explain why.
➕ 5. Take any one of your four prepared STAR stories from the original Practice section and time yourself — if Situation+Task exceeds 20% of your total answer time, rewrite the opening using the "Quick context..." interview-ready line above and re-time it.
