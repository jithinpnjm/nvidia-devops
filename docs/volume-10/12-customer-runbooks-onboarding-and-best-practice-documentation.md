---
title: "Chapter 12 - Customer runbooks, onboarding and best-practice documentation"
slug: "chapter-12-customer-runbooks-onboarding-and-best-practice-documentation"
sidebar_position: 12
description: "Runbook and onboarding-guide design for customer handoff, with three worked runbooks built from vendor documentation: NCCL initialization failures, Xid 79, and BCM provisioning failures."
source_document: "Extended with runbooks verified against the NCCL User Guide (networking troubleshooting, logging, diagnostics), the NVIDIA Xid Errors catalog, and the BCM 11 Administrator Manual."
---

**Learning outcome:** Produce a runbook that a customer's on-call engineer can execute correctly at 3am under pressure without you in the room, and an onboarding guide that gives a new customer team enough context to make good decisions on day one — and know why these are two different documents, not one document written twice.

## Start here — choose the document by the reader's task

Documentation is part of the operating system of a team. Choose its form from the decision the reader must make:

| Document | Reader's question | Required shape |
|---|---|---|
| Concept/explanation | "How does this system work?" | Mental model, boundaries, examples |
| Tutorial | "Can you teach me once, safely?" | Guided end-to-end learning exercise |
| How-to/SOP | "How do I perform this known task?" | Preconditions, ordered procedure, validation |
| Runbook | "How do I respond to this symptom now?" | Triage, decision branches, mitigation, escalation |
| Reference | "What exactly does this field/command mean?" | Precise, searchable facts |
| Design record | "Why did we choose this architecture?" | Context, options, decision, consequences |

An operational step needs five things: **action, purpose, expected result, branch on unexpected result, and risk**. "Run `scontrol show node node042`" is incomplete. Say which fields matter, what healthy looks like, whether it is read-only, and where each result sends the responder next.

Test documentation like code. Give it to an engineer who did not write it in a safe environment; begin with only the documented symptom and access; record ambiguity, missing prerequisites, unsafe copy/paste, and dead ends; then verify ownership, review date, supported versions, contacts, and links.

For a new learner, onboarding should progress from architecture and vocabulary to read-only observation, a sandbox task, a controlled change, troubleshooting, and on-call shadowing. Access alone is not readiness. Define observable completion criteria such as: "can submit and explain a Slurm job, locate its logs/accounting, and diagnose three safe failure exercises."

## Two documents, two audiences, two timeframes

```
                     RUNBOOK                         ONBOARDING / BEST-PRACTICES GUIDE
  When read:         incident-time, minutes matter    steady-state, before anything is wrong
  Who reads it:      on-call engineer, adrenaline up   new team member, has time to think
  Scope:              one narrow symptom               the whole system's shape and rationale
  Style:              imperative, prescriptive           explanatory, educational
  Success looks like: correct action taken fast          correct mental model formed
  Failure mode if
  conflated:          prose explanation slows down       a command list with no "why" leaves
                      the exact moment speed matters      the reader unable to adapt when the
                                                           real situation doesn't match the script
```

Conflating the two produces a document that serves neither purpose: pad a runbook with architectural rationale and the on-call engineer has to read past three paragraphs of "why this matters" to find the command they need while a page is going off; strip an onboarding guide down to bare command lists and the new team has no way to reason about a situation the guide didn't explicitly anticipate. The failure mode in each direction is different, which is the actual reason to keep them as separate documents rather than one document with an "if you're in a hurry, skip to section 4" note.

## Runbook template: symptom → verification → decision tree → mitigation → escalation → follow-up

```
1. SYMPTOM           — exact alert text or exact user-visible complaint, verbatim,
                        so pattern-matching against this runbook is unambiguous
2. VERIFICATION       — one or two commands, with the EXACT expected output for
                        both the "this runbook applies" case and the "this is
                        actually something else" case
3. DECISION TREE      — branches on the verification output, not on judgment calls;
                        every branch either ends in a mitigation step or in an
                        explicit "STOP — escalate" instruction
4. MITIGATION          — the exact command(s) to run, in order, with what to expect
                        after each one
5. ESCALATION         — a named contact/channel, and the EXACT condition that
                        triggers escalation instead of another mitigation attempt
                        (not "if it doesn't work" — a specific, checkable condition)
6. POST-INCIDENT       — what to capture before closing the ticket (logs already
   FOLLOW-UP            gathered, timestamps, whether this is a recurrence)
```

The discipline in steps 2 and 3 is the one most runbooks get wrong: verification has to specify what "this doesn't apply" looks like, not just what "this applies" looks like, or the on-call engineer has no way to know when they've mispattern-matched their symptom against the wrong runbook. The decision tree has to be branches on command output, not on-call judgment — if the runbook's next step is "assess whether the situation looks stable," that's not a decision tree, that's the runbook delegating its own job back to the reader.

### Annotated example: "Slurm node stuck in DRAIN state"

```text
SYMPTOM
  `sinfo` shows a node in state `drain` or `drng` for longer than expected,
  and it is not associated with a maintenance window on the change calendar.

VERIFICATION
  $ scontrol show node gpu-node-041 | grep -E 'State|Reason'
  State=DRAINED
  Reason=Kill task failed [root@2026-07-30T02:14:11]

  If 'Reason' is blank or references an active, calendared maintenance
  window, this runbook does NOT apply; use the maintenance-window runbook.
  If 'Reason' names a kill-task failure, low memory, or a health-check
  script failure, continue below.

DECISION TREE
  Is a job still shown RUNNING on this node by
  `squeue -w gpu-node-041`?

  YES
    Do NOT force-resume the node. Use `nvidia-smi` on the node
    (through SSH or `pdsh`) to confirm whether the GPU is healthy.

    If nvidia-smi hangs or times out:
      STOP, ESCALATE. Do not attempt further mitigation while the GPU
      driver is unresponsive; escalation owns physical/BMC recovery.

    If nvidia-smi returns normally and the GPUs show no ECC/Xid errors:
      Treat the drain reason as a stale kill-task failure and proceed
      to MITIGATION step A.

  NO (no job running)
    Proceed to MITIGATION step B.

MITIGATION
  A. Job appears healthy despite a stale drain reason:
     $ scontrol update nodename=gpu-node-041 state=resume

     Expect: `sinfo` shows the node in `idle` or `alloc` within ~30s.
     If it re-enters `drain` within 5 minutes with the SAME reason:
       STOP, ESCALATE.

  B. No job is running and the node is genuinely idle:
     Expect: the node returns to `idle`. Monitor `sinfo` for 10 minutes.
     If a new job lands and completes normally, close as resolved.

ESCALATION
  Trigger: nvidia-smi is unresponsive, OR the node re-drains with an
  identical reason within 5 minutes of a resume attempt.

  Contact: platform on-call (#gpu-fleet-oncall), through PagerDuty service
  'gpu-cluster-hw'. Do not attempt a second resume before paging.

POST-INCIDENT FOLLOW-UP
  Attach the `scontrol show node` output from the time of the drain,
  `sinfo` history, and whether the node drained for the same reason in
  the last 30 days. A recurring drain on one node is a hardware-suspect
  signal, not a fluke.
```

Every command in this example has an expected output written next to it, and the escalation trigger is a checkable condition ("re-drains within 5 minutes with the same reason string"), not a feeling. That is the entire difference between a usable runbook and a prose paragraph that happens to contain commands.

## Onboarding / best-practices guide template: overview → access → workflows → troubleshooting → contacts

```
1. ARCHITECTURE OVERVIEW    — what the cluster is, the layers involved (tie to
                               Chapters 1-11 of this volume: BCM, Ansible/
                               Terraform-managed config, Slurm, MPI, Enroot,
                               the coordinated-change process), and WHY it was
                               built this way, not just what exists
2. ACCESS / PERMISSIONS      — how to get an account, what roles exist, what
                               each role can and cannot do, and why the
                               boundaries are where they are
3. COMMON WORKFLOWS          — submitting a job, requesting a reservation,
                               building a container, checking allocation/
                               quota — the things a new user does weekly
4. TROUBLESHOOTING ENTRY     — NOT the runbooks themselves — pointers to
   POINTS                     which runbook to consult for which symptom
                               class, and how to tell which situation you're
                               actually in
5. WHO TO CONTACT FOR WHAT   — a table, not a single "contact support" line:
                               hardware issues vs. scheduler issues vs.
                               software/library issues vs. account/access
                               issues often have different owners
```

The onboarding guide's job is to make the *rest* of this volume's operational knowledge findable and load-bearing for a team that wasn't in the room when the cluster was designed. Section 4 deliberately does not duplicate runbook content — it routes to it, because a runbook that gets copy-pasted into an onboarding doc immediately goes stale in one location while being updated in the other.

```text
RUNBOOK                                    ONBOARDING GUIDE
'node stuck in DRAIN' — exact steps        'here's how the cluster works, and
for THIS symptom                           here's WHERE to look when something
                                            goes wrong'
              ◀── referenced by, not copied ──►

incident-time                              day-one / steady-state
narrow, prescriptive                       broad, educational
```

## Three runbooks built from vendor documentation

The DRAIN example above shows the shape. The next three show what it looks like when every check comes from a vendor document instead of from memory. Each cites its source. Where the vendor document stops and the runbook adds a decision, the text says so, because that line is where a reviewer should push back.

### Runbook A: Multi-node job hangs or fails during NCCL initialization

This answers Practice item 5. It follows the order of NVIDIA's NCCL networking troubleshooting guide: confirm which transport NCCL chose, then test the NICs, then the fabric.

```text
SYMPTOM
  A multi-node job stops making progress during startup, or fails with an
  NCCL WARN before the first training step.

VERIFICATION 1: which transport did NCCL pick?
  Re-run a 2-node nccl-tests job with NCCL_DEBUG=INFO.
  Applies if the log shows:   NCCL INFO Using network IB
                              (or the RoCE equivalent for your fabric)
  Does not match if it shows: NCCL WARN Failed to initialize any NET plugin
                              or a socket transport on an IB/RoCE cluster.
  Source: NCCL "Logging" page; NCCL_IB_DISABLE falls back to IP sockets.

VERIFICATION 2: built-in diagnostics (NCCL 2.31 and later only)
  $ NCCL_RUN_DIAGNOSTICS=1 <application>
  Read lines prefixed "NCCL DIAG". [OK] = check passed. [INFO] = review,
  for example "p2p: only 52/56 GPU-to-GPU peer accesses passed verification".
  Diagnostics are informational. They do not abort initialization.
  If NCCL is older than 2.31, skip this step.

DECISION TREE (each branch is a command result, not a judgment)
  A. Some UP interfaces cannot reach other nodes
     -> set NCCL_SOCKET_IFNAME to the intended interface and retest.
        (NCCL auto-detects interfaces and can hang on an UP interface
        that cannot communicate.)

  B. ibstatus / ibstat on every node used
     Port state must be Active, physical state LinkUp, link layer as
     expected (InfiniBand vs Ethernet), and Rate must match the fabric.
     Any port Down/Init/Armed or a downshifted rate
        -> STOP, go to ESCALATION (fabric/hardware owner).

  C. sminfo (InfiniBand only)
     Fails or shows no SM
        -> STOP, go to ESCALATION (fabric owner). Note: on a fabric using
           the SMP firewall, sminfo fails by design, so confirm with the
           fabric owner before declaring an SM outage.

  D. Log contains "Call to ibv_create_qp failed" or "ibv_reg_mr failed"
        -> pinned-memory limit. Check:  ulimit -l  (inside a job launch)
           NVIDIA's fix: memlock unlimited (soft and hard) in
           /etc/security/limits.conf, and for Slurm make sure jobs launch
           with the updated limits.

  E. RoCE only: "ibv_modify_qp failed with error Invalid argument"
        -> GID index. NCCL 2.21 and later select it dynamically; do not set
           NCCL_IB_GID_INDEX. On older NCCL, use show_gids and set it.

  F. Fabric looks healthy, still slow or intermittent
     Server:  ib_write_bw -d mlx5_0 -a
     Client:  ib_write_bw -d mlx5_0 <server> -a
     Repeat with --use_cuda=<gpu_id> to compare host-memory vs GPU-memory
     paths (check ib_write_bw --help for the options your perftest build
     supports). Also: ib_write_lat for tail latency, rdma statistic for
     growing rnr_nak_retry_err / packet_seq_err / local_ack_timeout_err,
     perfquery -x <lid> for SymbolErrorCounter / LinkDownedCounter.
     Host path OK but GPU path poor -> GPUDirect RDMA problem
        -> see Chapter 10 section 1.2 (nvidia-peermem build order).
     Errors climbing on one rail only -> run ibdiagnet and ESCALATE with
        the report.

MITIGATION
  Apply only the one branch that matched. After each change, repeat
  VERIFICATION 1 on two nodes before restarting the full job.

ESCALATION (checkable conditions)
  - Any port not Active/LinkUp, or rate lower than the fabric's rate
  - sminfo shows no SM
  - Error counters (SymbolErrorCounter, LinkDownedCounter) increase between
    two reads taken a few minutes apart
  - ibdiagnet reports missing links, bad ports, or routing inconsistency
  Attach: NCCL_DEBUG=INFO log, ibstat output, perfquery readings with
  timestamps, ibdiagnet report.
```

Why this works as a runbook: each branch is selected by a printed result. No step asks the responder to "assess" anything. The one design decision the runbook adds is the stop rule in branches B and C. NVIDIA's guide does not tell you to stop there, but a responder without fabric access cannot fix those anyway.

### Runbook B: A node logs Xid 79 ("GPU has fallen off the bus")

NVIDIA's Xid catalog describes the event and gives causes, not a repair procedure. The runbook below is therefore an operating policy built on those facts, and it says which parts are policy.

```text
SYMPTOM
  Kernel log contains:  NVRM: Xid (PCI:0000:5a:00): 79, GPU has fallen
  off the bus.  The node may also have been drained automatically.

VERIFICATION
  Find every Xid, with the PCI address:
  $ journalctl -k | grep "NVRM: Xid"      (or grep the syslog file)

  The line format is documented: PCI bus/device/function, Xid number, then
  Xid-specific data. Record the PCI address of the GPU named in the 79.

  Per the Xid catalog, this event is logged when the driver tries to reach
  the GPU over PCI Express and finds it inaccessible. It is "often caused by
  hardware failures on the PCI Express link", and can also be caused by
  failing GPU hardware or other driver issues.

DECISION TREE
  Is the node still drained or removed from scheduling?
    NO  -> drain it now (Slurm: scontrol update nodename=<node> state=drain
           reason="Xid 79"; BCM: the Drain action). Do not return it to
           service from this runbook.
    YES -> continue.

  Collect evidence BEFORE any reboot (policy: a reboot can clear the
  evidence the catalog tells you to look at):
    - nvidia-bug-report.sh   (run as root; produces nvidia-bug-report.log.gz)
    - system event logs and kernel PCI event logs, as the catalog advises
    - the BMC system event log (hardware faults often appear there)

MITIGATION
  None self-service. This runbook does not reboot the node to "see if it
  comes back". Hand the evidence package to the hardware owner.

ESCALATION
  Always. Trigger: any Xid 79. The responder's job is containment and
  evidence, not repair.

FOLLOW-UP (policy)
  Record the GPU's PCI address and serial. A second Xid 79 on the same
  device after hardware service is a recurrence and goes to the vendor
  with both evidence packages.
```

What is documented here: the Xid format, the meaning of 79, its likely causes, the log-review advice, and `nvidia-bug-report.sh` as the standard collection tool. What is policy: draining first, no reboot before collection, and always escalating. Say so when you hand this to a customer, so they can adjust the policy to their hardware-support contract.

### Runbook C: A BCM node will not finish provisioning

BCM reports where the node is in the install pipeline through node states. Those states tell you which half of the problem you have (BCM 11 Admin Manual, §5.5, pp. 291–294).

```text
SYMPTOM
  A node sits in an INSTALLER_* state, or cycles through install and reboot.

VERIFICATION
  $ cmsh -c "device; status node001"
  Read the state, then match it:

  INSTALLER_FAILED
    The node-installer found an unrecoverable problem, for example it
    cannot find the local drive or a network interface will not start. It
    is also set when handover to the local init takes too long to reach
    UP, or when a reboot takes too long.
    -> open the node's console; the installer message names the cause.

  INSTALLER_UNREACHABLE
    The head node can no longer ping the node during install. The node may
    have crashed inside the installer.
    -> check power and console via the BMC.

  INSTALLER_REBOOTING
    Normal and short: the installer reboots to load the right kernel. If it
    lasts too long BCM sets INSTALLER_FAILED.

  INSTALLER_CALLINGINIT -> UP never reached
    The installer handed control to the node's init, but the node did not
    reach UP in time. Per the manual, either the handover failed or init
    could not start CMDaemon on the node.
    -> check the node console for init and CMDaemon start-up errors.

PROVISIONING CAPACITY CHECK (applies to slow installs, not failures)
  $ cmsh -c "softwareimage; provisioningstatus"
  Shows pending requests, slots in use per provisioner, and which images
  are up to date. Documented behaviors that explain a stalled node:
    - requests are deferred when no provisioner has a free slot
    - a failed transfer is retried 5 times
    - a provisioner that loses connectivity keeps its allocated requests
      for 180 seconds before they fail
    - a provisioner being updated does not serve nodes until it finishes
  Pending requests but zero active -> check provisioner health and drain state.

MITIGATION
  Match the single state above. Do not power-cycle in a loop: INSTALLER_FAILED
  repeating with the same cause means the cause is not transient.

ESCALATION
  Trigger: INSTALLER_FAILED twice in a row with the same installer message,
  or INSTALLER_UNREACHABLE with the BMC also unreachable.
  Attach: console capture, status output, provisioningstatus output.
```

Two cautions from the same manual belong in the onboarding guide, not in the runbook: a node set to `CLOSED` stays closed across reboots until someone runs `open`, and `close` does not stop the workload manager, so jobs can keep running (§5.5.4).

## Closing the loop with the rest of Volume 10

Every chapter in this volume produces operational knowledge that is worthless to a customer's ops team unless it survives the handoff in one of these two forms: BCM node provisioning and lifecycle become runbook entries for "node fails to image" and onboarding-guide sections on "how nodes get added to the cluster"; Ansible/Terraform-managed configuration becomes onboarding-guide sections on "how to propose a config change" and runbook entries for "a config apply failed partway through"; Slurm administration becomes the DRAIN-state runbook above and an onboarding section on partition/QOS structure; MPI and Enroot/Pyxis become troubleshooting-entry-point references for "my multi-node job hangs" or "my container won't launch"; and Chapter 10's coordinated change management becomes the change-calendar process a new team needs to know exists before they file a ticket assuming they can apply a config change themselves at any time. A Solutions Architect handing off a cluster is graded on whether this documentation lets the customer's team operate without a call back to the SA — that is the actual acceptance criterion, and it is testable: hand the documentation to someone who wasn't in the deployment and see if they resolve a seeded, realistic incident using only what's written down.

## Worked scenario: the runbook that was actually a prose essay

A customer's platform team wrote a document titled "Runbook: GPU node health issues" that opened with three paragraphs explaining MIG, ECC error semantics, and how the DCGM health check subsystem works, followed by a narrative description of "what to do" written in flowing prose rather than steps. A routine, previously-seen issue — a single MIG-partition ECC event degrading a subset of pods, the same class of event as this volume's earlier MIG worked examples — occurred at 2am. The on-call engineer read the document, understood the background, but could not quickly extract the actual sequence of commands to run under time pressure, and escalated a routine, already-documented issue as a full incident, paging two additional engineers who were not needed.

The postmortem's finding was not "the on-call engineer should have read more carefully" — it was that the document was written as an onboarding-guide explanation wearing a runbook's title. The fix split it into two real documents: a short runbook (symptom → `dcgmi diag`/`nvidia-smi -q -d ECC` verification → decision tree by error severity → mitigation → escalation trigger) that a person under pressure could execute in under two minutes, and a separate best-practices page carrying the MIG/ECC background explanation for people onboarding with time to actually read it. Nothing about the underlying technical content changed — only which document format it was forced into.

## Mnemonic

**"Runbooks are scripts, guides are maps."** A script under pressure needs to be followed line by line with no interpretation required. A map, read calmly, needs to show the whole territory and why the roads go where they go. Writing a map when a script is needed loses time; writing a script when a map is needed loses understanding.

## Interview-ready line

"A runbook and an onboarding guide fail for opposite reasons if you write one when you meant the other — a runbook padded with rationale costs you time exactly when you can least afford it, and an onboarding guide stripped to bare commands leaves the new team unable to reason about anything the document didn't explicitly anticipate. I write runbooks as decision trees with checkable escalation triggers, and I test them the same way I'd test code: hand it to someone who wasn't in the room and see if they resolve a seeded incident without calling me."

## Practice

1. Take the "Slurm node stuck in DRAIN state" runbook above and identify every point where a less disciplined version of this runbook might have written "use your judgment" instead of a checkable condition — then state what checkable condition you'd substitute.
2. A customer asks for "one document that covers everything about the cluster." Explain, using the two-document table in this chapter, why you would push back on that request rather than just writing a very long single document.
3. Design the "who to contact for what" table for a cluster with separate hardware/firmware, scheduler/Slurm, software/library (CUDA/NCCL/MPI), and account/access ownership — and explain what goes wrong operationally if this table doesn't exist and everything routes to one general "support" channel.
4. Explain why a runbook should reference troubleshooting entry points in an onboarding guide rather than the onboarding guide duplicating runbook content inline, using the staleness argument from this chapter.
5. Write the verification step (command plus both possible outputs) for a runbook titled "GPU job hangs at NCCL init across nodes," given what you know from this volume about NIC firmware and NCCL transport negotiation — and state the specific condition that should trigger escalation rather than further self-service troubleshooting.
