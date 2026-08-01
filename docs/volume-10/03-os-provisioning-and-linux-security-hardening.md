---
title: "Chapter 3 - OS provisioning and Linux security hardening (RHEL/Ubuntu)"
slug: "chapter-3-os-provisioning-and-linux-security-hardening"
sidebar_position: 3
description: "Chapter 3 - OS provisioning and Linux security hardening (RHEL/Ubuntu) — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---
**Learning outcome:** Understand automated OS provisioning (kickstart/cloud-init), the SELinux/AppArmor enforcement model and triage flow, a CIS-style hardening baseline, and why patch strategy on a GPU cluster is constrained by driver/kernel coupling in ways a stateless web-tier fleet is not.

## Automated OS provisioning

Once a node is provisionable (Chapter 1) and, if using a cluster manager, assigned to a category with a target image (Chapter 2), the actual OS install/config is driven by a declarative answer file rather than an interactive installer:

- **Kickstart** (RHEL/CentOS/Rocky) — a `.ks` file specifying partitioning, package selection (`%packages`), and a `%post` script block, served over HTTP/TFTP alongside the PXE boot artifacts. The installer (Anaconda) reads it non-interactively.
- **cloud-init** (Ubuntu and most cloud/VM images, increasingly used for bare metal too via tools like MAAS) — a `user-data`/`meta-data` YAML pair consumed at first boot, handling users, SSH keys, package installs, and arbitrary `runcmd` shell commands.
- **Preseed** — Debian/Ubuntu's older non-interactive installer mechanism, largely superseded by cloud-init/curtin in newer Ubuntu Server installs but still seen in older fleets.

The pattern across all three: separate "what does this class of node look like" (partitioning, base packages, users, SSH hardening, hostname pattern) from "what job does it do" (GPU driver stack, Slurm client, container runtime) — the former belongs in the base kickstart/cloud-init config, the latter is layered on via config management (Ansible) or is baked into the golden image the cluster manager distributes.

```
%packages section (kickstart) or packages: list (cloud-init)
   → base OS + kernel + minimal service set only
%post / runcmd
   → SSH hardening, firewall defaults, auditd enablement,
     enrollment into config management (Ansible pull or agent registration)
   → NOT driver/CUDA install here if a golden-image pipeline (BCM-style) owns that —
     duplicating driver install logic in both the base provisioner and the image
     pipeline is a drift source, pick one owner
```

## SELinux vs AppArmor

Both are Linux Security Modules (LSM) implementing mandatory access control (MAC) — restricting what a process can do beyond standard Unix permissions, even as root. They differ in model:

| | SELinux (RHEL/CentOS/Rocky default) | AppArmor (Ubuntu/Debian default) |
|---|---|---|
| Labeling | Every file/process/port gets a security *context* (`user:role:type:level`) | Profiles bound to *file paths*, no persistent file labels |
| Policy granularity | Type Enforcement — very fine-grained, steep learning curve | Path-based profiles — coarser, easier to read/write |
| Modes | `Enforcing`, `Permissive`, `Disabled` | `enforce`, `complain` (log-only), profile can be `unconfined` |
| Check status | `sestatus`, `getenforce` | `aa-status` |
| Set mode | `setenforce 0\|1` (runtime), `/etc/selinux/config` (persistent) | `aa-enforce <profile>`, `aa-complain <profile>` |
| Denial logs | `/var/log/audit/audit.log`, queried via `ausearch -m avc` | `dmesg`/`journalctl`, `DENIED` lines tagged `apparmor="DENIED"` |
| Triage tool | `audit2allow` — generates a policy module from denial logs | `aa-genprof`/`aa-logprof` — interactively builds/updates a profile from logs |

Annotated `sestatus` output:

```
$ sestatus
SELinux status:                enabled
SELinuxfs mount:                /sys/fs/selinux
SELinux root directory:         /etc/selinux
Loaded policy name:              targeted
Current mode:                    enforcing
Mode from config file:           enforcing
Policy MLS status:               enabled
Policy deny_unknown status:      allowed
Max kernel policy version:       33
```
`Loaded policy name: targeted` is the detail worth knowing cold — "targeted" policy only confines a defined set of daemons (network-facing services, mostly), leaving most of the system unconfined; this is the RHEL default and is why SELinux denials in practice cluster around specific services (httpd, sshd, custom daemons touching non-standard paths) rather than everything on the box.

### SELinux triage flow (real, not aspirational)

```
1. Symptom: service fails with "Permission denied" despite correct Unix perms
2. ausearch -m avc -ts recent          → find the denial record(s)
3. audit2why < denial                  → human-readable explanation of why SELinux blocked it
4. Decide: is this a legitimate access the policy should allow, or a real misconfiguration?
     - legitimate → audit2allow -a -M mymodule; semodule -i mymodule.pp
     - misconfig  → fix the actual file context/port label instead (restorecon, semanage port -a)
5. Never leave step 4 unresolved by just running setenforce 0 permanently —
   that's disabling the control, not fixing the finding
```

### AppArmor triage flow

```
1. Symptom: process fails or is silently restricted
2. aa-status                            → confirm the profile is loaded and in enforce mode
3. dmesg | grep DENIED  (or journalctl) → find the specific denied operation/path
4. aa-genprof <binary>  or  aa-logprof  → interactively walk denials, choose allow/deny per line
5. Reload: apparmor_parser -r /etc/apparmor.d/<profile>
6. Re-test; iterate until clean under real workload, not just a smoke test
```

The instinct to `setenforce 0` or set a profile to `complain` "just to get the service running" is the single most common way a hardened baseline quietly becomes an unhardened one — it should be a temporary diagnostic step, and every use of it should have a tracked follow-up to build the correct policy module, not a permanent fix.

## CIS-benchmark-style hardening baseline

A hardening pass (whether run via a CIS benchmark tool, OpenSCAP, or a bespoke Ansible role) typically touches the same recurring surface area regardless of exact benchmark version:

- **SSH config** (`/etc/ssh/sshd_config`) — disable root login (`PermitRootLogin no`), disable password auth in favor of keys (`PasswordAuthentication no`), restrict ciphers/MACs to modern-only, `MaxAuthTries`, `LoginGraceTime`.
- **Firewall / nftables** — default-deny inbound, explicit allow rules per required service/port, egress control where the threat model calls for it. Modern RHEL/Ubuntu baselines use `nftables` as the backend even where `firewalld`/`ufw` is the admin-facing tool.
- **Unused service disablement** — anything listening that isn't needed (`systemctl list-unit-files --state=enabled`, then disable what the node's role doesn't require) shrinks attack surface and, on HPC nodes specifically, removes noisy neighbors competing for CPU/memory the job scheduler thinks is free.
- **Kernel sysctl hardening** — `net.ipv4.conf.all.rp_filter`, disabling IP forwarding on non-router nodes, `kernel.dmesg_restrict`, `kernel.kptr_restrict`, ASLR (`kernel.randomize_va_space=2`), disabling core dumps of setuid programs.
- **auditd** — rule sets watching identity/privilege files (`/etc/passwd`, `/etc/shadow`, `/etc/sudoers`), privileged command execution, and (per compliance regime) file access to sensitive data paths. `auditctl -l` shows the currently loaded rule set.

Annotated `auditctl -l` fragment:
```
$ auditctl -l
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k identity
-a always,exit -F arch=b64 -S execve -F euid=0 -k root_exec       ← every root-executed syscall logged
```
`-k identity` and `-k root_exec` are audit *keys* — labels that let `ausearch -k identity` pull exactly the relevant subset out of a large audit log instead of grepping raw text, which matters once a node has been running long enough to accumulate a genuinely large `audit.log`.

## Patch/update strategy on a GPU cluster

The reason you cannot treat GPU compute nodes like a stateless web-tier fleet (`apt/yum upgrade` on a schedule, reboot, move on) is a hard coupling most other Linux fleets don't have:

```
        Kernel version
             │
             │  must be within the driver's supported kernel ABI range
             ▼
        NVIDIA driver version  ── DKMS module build target ──┐
             │                                                 │
             │  must be within CUDA toolkit's supported        │
             │  driver-version floor (CUDA X requires          │
             │  driver >= Y)                                   │
             ▼                                                  ▼
        CUDA toolkit version                          any kernel bump that
             │                                          changes kernel-module
             │  application/framework pinned            ABI without a matching
             │  CUDA version (PyTorch/TF build)          driver rebuild breaks
             ▼                                            GPU visibility fleet-wide
        Training/inference workload
```

A routine `dnf update`/`apt upgrade` that pulls a newer kernel is, from this diagram, a gate — not a no-op — because the NVIDIA driver kernel module is typically built via DKMS against the running kernel headers. Bump the kernel without a coordinated driver rebuild/reinstall, and every node that reboots into the new kernel loses `nvidia.ko`, and `nvidia-smi` fails cluster-wide on next reboot, even though nothing about CUDA or the application layer changed.

Operational implications:

- **Patch windows, not continuous patching** — GPU nodes get updated in scheduled maintenance windows coordinated with the scheduler (drain from Slurm/Kubernetes first), not by an unattended-upgrades cron job that can reboot a node mid-job or, worse, mid-fleet inconsistently.
- **Staged rollout** — same canary-then-batch pattern as Chapter 2's image rollout: patch a small subset, confirm `nvidia-smi`/`dcgmi diag`/a real multi-GPU job still works post-reboot, then batch the rest.
- **Kernel pinning** — many HPC/GPU shops pin the kernel version (hold it at a validated version) independent of the rest of the package set, only moving it forward in lockstep with a validated driver/DKMS rebuild, rather than letting the package manager float it.
- **Security patching without a kernel bump** — most CVE fixes for userspace packages (openssl, glibc, systemd components) don't touch the kernel-module ABI and can go through faster/lighter-weight patch cycles; the kernel-coupled subset is the one that needs the slow, staged path.

## The hardening-vs-HPC-operations tension

SELinux enforcing mode on a GPU node can generate denials against device-node access patterns (`/dev/nvidia*`, `/dev/nvidia-uvm`, GPUDirect RDMA paths touching NIC device nodes) that the stock "targeted" policy never anticipated, because these device classes didn't exist when the base policy was authored. NVIDIA and some distros ship or recommend supplemental SELinux policy modules for exactly this reason — installing the right policy module (mapping the correct type/context to the GPU device nodes) is the correct fix, not disabling enforcement.

In practice this is why some HPC shops run SELinux in `permissive` mode (or AppArmor profiles in `complain` mode) on GPU compute nodes specifically, with compensating controls instead: network segmentation on the cluster's management/boot VLANs, strict SSH/auth hardening, auditd watching privileged actions, and tight physical/BMC access control. This is a real, defensible trade-off in a closed HPC network with no direct internet-facing services on the compute nodes — but it is a trade-off, not a free pass, and should be a documented risk-acceptance decision (with the compensating controls named), not an unexamined default inherited from "enforcing broke a job once so we turned it off."

## Worked scenario — a routine kernel patch broke the GPU driver DKMS build fleet-wide

**Situation:** A maintenance window applies the latest RHEL kernel errata across the `gpu-a100` fleet along with routine userspace package updates. After reboot, `nvidia-smi` fails on every node in the batch with "No devices were found" / driver/library version mismatch, even though nothing about the NVIDIA driver package version changed in this patch set.

1. **Confirm the actual failure mode**: `dmesg | grep -i nvidia` on an affected node — typically shows the DKMS-built `nvidia.ko` either failed to build against the new kernel headers, or built against the old kernel and is now mismatched against the running (new) kernel, which is exactly what "Failed to initialize NVML: Driver/library version mismatch" means.
2. **Check DKMS status**: `dkms status` — shows whether the nvidia module built successfully for the new kernel version or is still only registered against the previous one.
3. **Root cause**: the patch pipeline updated the kernel package but did not trigger (or wait for) a DKMS rebuild against the new kernel headers before the node rebooted — a sequencing gap between "kernel package updated" and "GPU driver kernel module rebuilt for that kernel," not a driver bug.
4. **Immediate fix**: `dkms autoinstall` (or a targeted `dkms install nvidia/<version> -k <new-kernel>`) rebuilds the module against the currently running kernel; reboot not always required if the module can be loaded live, but a clean reboot-and-verify is the safer confirmation step.
5. **Prevention**: the patch pipeline must treat "kernel package update" and "DKMS rebuild + verify module load" as one atomic maintenance step per node — never reboot a node into a new kernel without a passing DKMS build gate for that exact kernel version, and the staged/canary rollout (patch one node, confirm `nvidia-smi` clean, then batch) would have caught this before it hit the whole fleet.

**Interview-ready line:** "A kernel patch on a GPU node isn't userspace-only risk — the driver's kernel module is typically DKMS-built against the running kernel, so any patch pipeline that bumps the kernel has to treat a successful DKMS rebuild as a hard gate before reboot, or you get a fleet-wide 'no devices found' the next morning."

**Mnemonic:** **"K-D-C"** — **K**ernel bump requires a **D**KMS rebuild gate before it requires a **C**UDA/app compatibility check; skip the middle step and the outer two don't matter.

## Practice

1. Explain the difference between SELinux's labeling model and AppArmor's path-based model to someone deciding which to adopt for a new GPU-node image, and name one practical consequence of that difference for GPU device-node access.
2. Walk through the `audit2allow` triage flow for a service denial and explain why `setenforce 0` is not an acceptable terminal step even when it "fixes" the symptom.
3. Why can't a GPU cluster safely run unattended kernel/package upgrades the way a stateless web-tier fleet might? Name the specific dependency chain that makes this unsafe.
4. A hardening review finds SELinux running in permissive mode on all GPU compute nodes. What questions would you ask before flagging this as a finding, and what would make it a defensible risk-acceptance rather than a gap?
5. Given `dkms status` showing the nvidia module registered only against the previous kernel version after a patch window, write the one-sentence root cause and the one specific pipeline fix that prevents recurrence.
