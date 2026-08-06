---
title: "Senior Deep Dive 1 — BCM at fleet scale: node categories, image drift and health-check design"
slug: "senior-deep-dive-1-bcm-at-fleet-scale"
sidebar_position: 13
description: "Senior Deep Dive 1 — BCM at fleet scale: node categories, image drift and health-check design — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---

`docs/volume-10/02-nvidia-base-command-manager.md` covers BCM's architecture — head node, node categories, software images, and the provisioning lifecycle. This deep dive covers three things that only surface once a fleet has been running for months rather than days: category drift, health-check taxonomy, and head-node HA.

## Before this deep dive — convert the basics into operational questions

Be comfortable explaining **head node, compute node, software image, category, desired state, and live state** from Chapter 2. Then ask the questions scale introduces:

- If one node differs from its category, how will we detect it before a user's job does?
- Which health failure should warn, drain, quarantine, reimage, or page a human?
- Which BCM services and data must survive a head-node failure, and how is failover tested?
- Can an operator reproduce every emergency fix from version-controlled desired state?

Read this chapter with an evidence ladder in mind: fleet summary → category comparison → node-level observation → service/image logs → controlled remediation → post-remediation workload test. A dashboard showing green is the beginning of evidence, not the end.

## Category inheritance and drift

A node category in BCM is a template: software image, kernel modules, roles, and a set of category-level configuration overlays that every member node inherits. The model only holds if every node's live state is *derived* from the category, never edited directly. In practice this breaks the first time someone SSHes into a struggling node and hand-fixes it under pressure — a driver downgrade to unblock a job, a `/etc/security/limits.conf` tweak to raise a file-descriptor cap, a manually-added udev rule for a flaky NIC.

That node is now out of band with its category. BCM does not automatically notice this — `cmgui`/`cmsh` will still report the node as belonging to the category, because category membership is a label, not a live state comparison. Drift is only surfaced by an explicit check:

```
cmsh -c "device use node042; grabimage -w"
```

`grabimage` captures the node's current on-disk state and diffs it against the category's provisioned image. A clean node returns no diff. A drifted node returns a file-level delta — and the delta only tells you *what* changed, not *why*, which is why the operational discipline has to be: no interactive fixes on category members, ever; every fix goes into the category (or a dedicated node-installer finalize script) and gets pushed via `imageupdate`, so the fleet stays reproducible. When drift is found on a production node, the remediation is to either re-image the node from the category (destructive, safe) or capture the delta, decide whether it's a legitimate category-level change, and either fold it into the category image or explicitly revert it — never leave it as a silent one-off.

The scale problem: with 200+ nodes in a category, drift detection can't be a manual `grabimage` per node. It has to run as a scheduled health check (see below) that flags any node whose checksum of tracked config paths disagrees with the category baseline, before that node is trusted for the next job.

## Health-check taxonomy: three tiers, three remediation actions

BCM's healthchecker framework (`cmhealth`, wired into `cmsh -c "device; healthconf"`) treats every check as equivalent — pass/fail/unknown. Operationally they are not equivalent, and a mature deployment separates checks into three tiers because the *correct remediation* differs by tier:

| Tier | Example symptoms | Remediation | Why |
|---|---|---|---|
| Tier 1 — Hardware health | GPU ECC errors (Xid), NVLink link-down, PSU/fan fault, disk SMART pre-fail | ALERT + auto-DRAIN (never auto-reboot) | Hardware faults don't self-heal on reboot, and a reboot can silently mask an escalating ECC pattern you need to see |
| Tier 2 — Software health | driver/CUDA version mismatch vs category baseline, category drift (`grabimage` diff), stuck kernel module, filesystem mount missing | auto-DRAIN + auto-REIMAGE from category | Software state is reproducible from the image — a reboot alone won't fix a bad driver, but re-provisioning will |
| Tier 3 — Workload-readiness health | NCCL self-test failure, GPU-to-GPU bandwidth below threshold, Slurm prolog health-check script failure, PMIx bootstrap probe | auto-DRAIN only (mark unavailable to the scheduler) | Do NOT auto-reboot or auto-reimage — the node may be fine and the failure may be transient/topology-related, so it needs a human or a second confirming check before anything destructive happens |

The reason this separation matters: an auto-reboot policy applied uniformly across all checks is actively dangerous. Rebooting a node with an escalating GPU ECC error can silently accept a partially-failed HBM row and put it back into service; auto-reimaging in response to a transient NCCL self-test blip (e.g., a leaf switch briefly recalculating routes) throws away twenty minutes of provisioning time to fix nothing. Tier 1 gets you paged; Tier 2 gets you a self-healing image re-push; Tier 3 gets you a drained node and a decision point.

BCM expresses these policies through `healthconf`, its health-check configuration. A check can wait for repeated failures before acting (`failafter`), send an external notification (`notify`), request an image refresh (`imageupdate`), or make the node unavailable to Slurm (`drain`).

Each health tier deliberately receives a different action. Tier 1 hardware checks use `failafter` and `notify` with PagerDuty or webhook integration, but no automatic `poweroff` or `reboot`. Tier 2 reproducible-software failures invoke a controlled remediation script that refreshes the known-good image. Tier 3 workload-readiness failures only drain the node. It stays in Slurm's `DRAIN` state until a human validates it and runs `scontrol update state=RESUME`.

## Single head-node architecture: the SPOF problem

A default BCM deployment runs one head node performing provisioning (image serving, PXE/DHCP, node-installer orchestration), monitoring (CMDaemon metrics collection), and cluster management UI/API in one process tree. This is a single point of failure in three distinct ways that fail differently:

- **Provisioning outage**: if the head node is down when a node reboots or a new node is added, that node cannot PXE-boot or pull its image — it hangs at network boot. Already-running compute nodes are unaffected (slurmd/user jobs don't depend on the head node once booted), so the blast radius is "no new nodes, no re-images" rather than "cluster down."
- **Monitoring outage**: CMDaemon-based metrics collection stops, so BCM's own dashboards go dark, but this doesn't affect Slurm scheduling — Slurm has its own independent state. The operational risk here is invisibility, not job loss: incidents happen and no one sees them.
- **Management-plane outage**: `cmsh`/`cmgui`/API access is gone, so no configuration changes, no category pushes, no `cmsh` diagnostics — administrators are blind and hands-off until the head node is restored.

BCM's documented HA option is an active/passive head-node pair: two head nodes sharing a replicated/synchronized state store (the CMDaemon database and shared image/filesystem storage over NFS or a shared block device), with a floating/virtual IP and a failover mechanism that promotes the passive node when the active one stops responding to heartbeats. The failover unit is the whole head-node role — provisioning, monitoring, and management move together, because they all depend on the same underlying state (node categories, image repository, node installer state).

The practical constraint: HA head nodes only protect against head-node failure, not against a bad category push. If an admin pushes a broken image update, both head nodes will serve the same broken image after failover — HA doesn't guard against operator error, only hardware/process failure of the head node itself. That has to be caught by the coordinated-change-management discipline in `docs/volume-10/10-coordinated-cluster-wide-software-change-management.md`, not by head-node redundancy.

## Worked scenario

A 96-node H100 category (`gpu-h100-prod`) has been stable for three months. A user reports one node, `node057`, throwing intermittent CUDA `initialization error` while its 95 category-mates are fine. First check is category drift, not hardware:

```
cmsh -c "device use node057; grabimage -w"
# diff shows: /etc/modprobe.d/nvidia.conf modified, /usr/lib/... nvidia-persistenced binary older
```

The diff shows someone manually rolled back the driver on `node057` two weeks earlier to work around an unrelated issue, and never rolled it forward or captured it in the category. This is a Tier 2 (software health) finding, not a Tier 1 hardware fault — the fix is `cmsh -c "device use node057; imageupdate"` to re-sync to category baseline, not a GPU RMA. Root cause of the *drift* (why was a manual fix applied instead of a category change) goes into the retro; root cause of the *symptom* is closed by the reimage.

## Interview-ready line

"BCM's node category is only trustworthy if nothing ever touches a member node outside the category — the moment someone hand-fixes one node, `grabimage` is the only thing that tells you it drifted, and health checks need three separate tiers with three separate remediation actions, because auto-rebooting a hardware fault or auto-reimaging a transient network blip both cause more damage than the original failure."
