# Batch 03 — Bare-Metal & Cluster Management (Volume F-10) — Findings

(Summary to be added at top once all chapters are reviewed.)

## Volume F-10 (docs/volume-10)

### 01-bare-metal-and-bmc-lifecycle.md
- [SEVERITY: medium] Worked IPMI sensor-list example is internally inconsistent: `CPU2 Temp` shows a reading of `108.000`°C but a status of `ncr` (non-critical) against thresholds `unc=92, ucr=95, unr=98`. A reading of 108 is past all six thresholds including `unr` (upper non-recoverable, 98), so the correct status would be `unr`, not `ncr`. The prose commentary ("already past non-critical and closing on ucr") compounds the error by describing 108 as merely *approaching* ucr/95 when it has actually blown through both ucr and unr.
  - Evidence: lines 262, 268 — `CPU2 Temp | 108.000 | degrees C | ncr | ... | 92.000 | 95.000 | 98.000`.
  - Why it matters for JR2018680: this is the chapter's flagship "read a sensor table like an operator" example — an interviewer who knows IPMI threshold semantics (lnr/lcr/lnc/unc/ucr/unr) would catch the mismatch, and a candidate who memorized this example would misstate the severity ordering.
  - Suggested fix: change the reading to something consistent with `ncr` (e.g. 93.5, between unc=92 and ucr=95) or change the status label to `unr` and correct the prose accordingly.
- [SEVERITY: low] PSU sensor commentary is good (correctly flags discrete-sensor bitmap vs. numeric misread) — no issue, noted as a strength for calibration.
- Overall: this chapter is a genuine strength of the volume — real `ipmitool`/`redfishtool`/`curl` Redfish calls, a real PXE DHCP→TFTP→kernel state machine with named failure classes, a worked RMA/PXE-failure scenario with a mnemonic, and honest firmware-baseline reasoning tied to Xid/ECC symptoms. This is the depth bar the rest of the volume should be held to.

### 02-nvidia-base-command-manager.md
- [SEVERITY: low] No factual errors found. Chapter is appropriately hedged about `cmsh` syntax being version-specific ("treat as illustrative... not a syntax reference") rather than presenting invented commands as verified fact — good practice given BCM CLI isn't independently checkable here.
- [SEVERITY: low] Could be strengthened with a real (verified-against-docs) minimal `cmsh` category/image show sequence rather than only illustrative pseudo-output, since BCM CLI fluency is one of the harder-to-fake interview signals — but the current hedge is honest rather than wrong, so this is a depth suggestion, not an accuracy problem.
- No inaccuracies in the head-node/CMDaemon/category/image model description; canary+batched-rollout workflow and BCM-vs-Ansible-vs-Terraform boundary are correct and interview-relevant.

### 00c-slurm-bcm-interview-lab.md
- [SEVERITY: medium] Interview-readiness gap: this is the volume's dedicated Slurm/BCM interview lab, but it never shows a concrete `sbatch`/`srun` GPU allocation (e.g. `--gres=gpu:4`, `--gpus-per-task`, job arrays with `--array=`, exclusive vs. shared via `--exclusive`/`--gres-flags`). Lab 5 greps `gres.conf`/`cgroup.conf` (good) but stops short of the request-side syntax an NVIDIA interviewer is likely to ask for directly (task brief explicitly calls out "real Slurm sbatch/gres syntax" as an expected differentiator).
  - Evidence: Labs 1-6 cover `squeue`, `scontrol show job`, `sinfo`, `sacctmgr`, and GRES config file greps, but no `sbatch --gres=gpu:N` or `--array=` example appears anywhere in the file.
  - Why it matters for JR2018680: GPU gres allocation and job-array syntax is one of the most concrete, easy-to-verify things an interviewer can ask a bare-metal/HPC candidate to write on a whiteboard; this lab otherwise trains the diagnostic reasoning well but skips the request-side syntax entirely.
  - Suggested fix: add a short Lab covering `sbatch --gres=gpu:2 --ntasks-per-node=2`, a `--array=1-4` example, and `--exclusive` vs. shared-node partition request, with the resulting `scontrol show job` GRES/TRES fields annotated.
- Otherwise strong: the reason-code table (`Resources`/`Priority`/`Assoc`/`ReqNodeNotAvail`/`Dependency`/`InvalidAccount`), the "drain is not a repair" framing, and the worked "H100 cluster underperforming" scenario are all realistic, evidence-first, and match the depth bar.

### 03-os-provisioning-and-linux-security-hardening.md
- [SEVERITY: low] No factual errors found. SELinux/AppArmor triage flows, DKMS/kernel-ABI coupling narrative, and the worked "kernel patch broke DKMS fleet-wide" scenario are accurate and match real Linux/NVIDIA driver operational behavior (targeted policy scope, `audit2allow`/`ausearch -m avc`, `dkms status`/`dkms autoinstall`, NVML "Driver/library version mismatch" message).
- Strength: the driver/CUDA/kernel coupling diagram and the DKMS worked scenario are exactly the kind of concrete, evidence-based troubleshooting narrative an NVIDIA interviewer would want to hear — good depth-bar match.

### 04-ansible-for-infrastructure-automation.md
- [SEVERITY: low] No factual errors found. Push-model-vs-agent framing (Ansible vs BCM/Puppet), `serial:`/`max_fail_percentage:` semantics, handler dedup-per-play behavior, and the dict-ordering idempotency worked scenario are all accurate.
- Note: chapter is general IaC/config-management content (applies to any fleet) rather than bare-metal-specific, but ties every example back to a GPU-fleet scenario (DCGM exporter, driver version pinning, NCCL role boundaries), so it stays relevant to this volume's brief.

### 05-terraform-for-infrastructure-as-code.md
- [SEVERITY: low] No factual errors found. State/plan/apply three-way-diff model, `-/+` replace semantics, S3+DynamoDB locking, `lifecycle { create_before_destroy, ignore_changes }`, and the Terraform/Ansible/BCM ownership boundary are all correct and well-argued.
- [SEVERITY: low] Chapter correctly scopes itself as "orthogonal to the physical compute node" for on-prem bare metal, consistent with Chapter 2's framing — no cross-chapter contradiction.
