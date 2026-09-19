---
title: Chapter 02 — GPU Cloud Provisioning for Training Workloads
description: Provisioning a single GPU node for MLOps — drivers, Docker, nvidia-container-toolkit, persistent storage, and firewall — from a real Nebius L40S box.
sidebar_position: 3
tags: [gpu, provisioning, docker, nvidia-container-toolkit, nebius]
---

# Chapter 02: GPU Cloud Provisioning for Training Workloads

| Chapter metadata | Value |
|---|---|
| Volume | 25 — MLOps Engineering |
| Difficulty | Intermediate |
| Estimated reading time | 40 minutes |
| Primary audience | MLOps Engineers, Platform Engineers new to GPU cloud provisioning |
| Core question | What has to be true about a GPU box before any training code can run on it, and how do you *prove* each piece is true rather than assume it? |

## WHY

A GPU sitting in a cloud VM is useless to a training job until several independent layers agree with each other: the kernel driver must recognize the hardware, the container runtime must be able to hand GPU access into a container (most real training runs happen inside containers, not directly on the host), and there must be somewhere durable to put the multi-gigabyte artifacts (datasets, checkpoints, tracking-server data) that outlive any single container. Skipping verification of any one layer means a training job can fail — or worse, silently run on CPU — for a reason that looks like a code bug but is actually an infrastructure gap.

## WHAT

For this project, "provisioned" meant four independent, verifiable properties on one Nebius L40S VM:

1. **GPU driver + CUDA compatibility** — `nvidia-smi` runs and shows the GPU.
2. **Container GPU passthrough** — a container, not just the host, can see the GPU (`nvidia-container-toolkit`).
3. **Persistent storage** — a disk that survives a container restart (or a full `docker compose down`), for the tracking server's database and the data-versioning remote.
4. **Network exposure control** — only what needs to be reachable is reachable (SSH in, nothing else public).

## HOW

### Step 1 — Verify the driver and GPU are visible at all

```bash
ssh -i ~/.ssh/nvidia-lab jithin@<vm-ip> "nvidia-smi"
```

Real output from this project's actual VM:

```text
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 580.173.02             Driver Version: 580.173.02     CUDA Version: 13.0     |
+-----------------------------------------+------------------------+----------------------+
|   0  NVIDIA L40S                    On  |   00000000:8D:00.0 Off |                    0 |
| N/A   32C    P8             34W /  350W |       0MiB /  46068MiB |      0%      Default |
+-----------------------------------------+------------------------+----------------------+
```

Notice this VM's cloud image shipped with the driver **already installed** — a real, useful shortcut some GPU cloud providers offer via a "GPU-ready" base image. Verifying this first, before running any driver-install steps, avoided unnecessary work. This is a general principle: **check the actual state before running provisioning steps that assume a blank state.**

### Step 2 — Verify Docker can hand GPU access to a container

Docker itself does not know how to talk to a GPU by default. `nvidia-container-toolkit` is the component that teaches Docker's runtime how to inject the right device nodes and driver libraries into a container.

```bash
dpkg -l | grep -i nvidia-container
# ii  nvidia-container-toolkit    1.20.0-1    amd64  NVIDIA Container Toolkit
```

This VM also had it preinstalled. The actual proof that it *works* — not just that the package exists — is running a throwaway container and asking it to see the GPU:

```bash
sudo docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

If this prints the same GPU table as the host-level `nvidia-smi`, the whole chain (driver → toolkit → container runtime → container) is proven end to end. If the package is installed but this command fails, the toolkit is present but not correctly wired into the Docker daemon — see TROUBLESHOOTING below.

### Step 3 — Provision persistent storage

A cloud VM's root disk is often ephemeral in spirit even when not literally ephemeral in practice — treating it as disposable and putting durable state on a separate, explicitly-attached volume is the safer default. This project's VM had a second raw block device, unformatted:

```bash
lsblk -d -o NAME,SIZE,TYPE,MODEL
# vda   100G disk       <- OS disk
# vdc    93G disk       <- attached, unformatted persistent volume
sudo blkid /dev/vdc
# (no output — confirms no existing filesystem, i.e. safe to format)
```

Formatting and mounting it, with the mount registered in `/etc/fstab` so it survives a reboot:

```bash
sudo mkfs.ext4 -F /dev/vdc
sudo mkdir -p /data/mlops
sudo mount /dev/vdc /data/mlops
UUID=$(sudo blkid -s UUID -o value /dev/vdc)
echo "UUID=$UUID /data/mlops ext4 defaults 0 2" | sudo tee -a /etc/fstab
sudo mkdir -p /data/mlops/{postgres,mlflow-artifacts,dvc-store}
sudo chown -R jithin:jithin /data/mlops
```

The three subdirectories created here map directly onto Chapters 3 and 4: `postgres/` becomes MLflow's backend store, `mlflow-artifacts/` its artifact store, `dvc-store/` the DVC remote.

### Step 4 — Firewall: verify you don't lock yourself out

```bash
sudo ufw allow OpenSSH
sudo ufw --force enable
sudo ufw status verbose
```

**The one step that actually matters here isn't the config — it's verifying it in a *new* connection**, not the one you used to configure it:

```bash
# From a fresh terminal / fresh SSH invocation, not the one that ran ufw enable:
ssh -i ~/.ssh/nvidia-lab -o ConnectTimeout=10 jithin@<vm-ip> "echo still reachable"
```

If your existing SSH session stays open after enabling a firewall, that tells you nothing — the OS doesn't tear down established connections when a new rule is added. Only a fresh connection attempt proves the rule set is actually correct.

## WHEN

Run this full verification sequence any time you provision a new GPU node from scratch, and *especially* re-verify steps 1-2 whenever you switch to a new cloud image or GPU generation — driver/toolkit compatibility between a specific CUDA version and a specific GPU architecture (Ada/L40S vs. Hopper/H100, for instance) is exactly the kind of assumption that's cheap to verify and expensive to discover is wrong mid-training-run.

## TRADEOFFS

| Approach | Setup time | Risk |
|---|---|---|
| Trust the cloud image is "GPU-ready" without checking | Fastest | A silent CPU fallback in your training code (e.g. a framework that quietly runs on CPU when CUDA init fails) can burn hours before anyone notices throughput is wrong |
| Verify each layer (driver → toolkit → container → storage → firewall) before writing training code | Slower by maybe 15-20 minutes | Every subsequent failure is *known* not to be an infra problem, which massively narrows debugging later |

## PRODUCTION

In a single-node MLOps setup like this project's, "production" provisioning is this same checklist, just run once and then left alone — the node is long-lived infrastructure, not a disposable training pod. In a multi-node or Kubernetes-scheduled environment (Volume 10), the same four checks (driver, toolkit, storage, network policy) become things the **NVIDIA GPU Operator** and **Container Storage Interface (CSI)** drivers verify automatically for every node that joins the cluster, rather than a manual SSH session — but the underlying properties being verified are identical.

## TROUBLESHOOTING

### Scenario 1: `nvidia-container-toolkit` is installed but the GPU test container fails

**Symptom:**
```text
docker: Error response from daemon: could not select device driver "" with capabilities: [[gpu]].
```

**Diagnosis:** The toolkit package being installed does not automatically mean Docker's daemon has been told to use the NVIDIA runtime.

**Evidence vs. Proof:** The error message is evidence the daemon doesn't know about a GPU-capable runtime. It is not proof the toolkit itself is broken — it's very often just a missing daemon configuration step.

**Resolution:**
```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
# retry the verification container
sudo docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

### Scenario 2: Enabling the firewall drops your session or blocks future access

**Symptom:** After `ufw enable`, a fresh SSH attempt hangs or is refused.

**Diagnosis:** The allow rule for SSH either wasn't added before enabling, or was added for the wrong port (a non-default SSH port is common on hardened images).

**Evidence vs. Proof:** A hung connection is evidence of a network-level block. It is not proof of *which* rule caused it without checking `ufw status` from a still-open session (never enable a firewall change from your only session without a fallback).

**Resolution:** Always keep the current session open while testing a *second*, fresh connection after any firewall change — never enable-and-disconnect in one step. If locked out, most cloud providers offer a serial/console access path independent of SSH to fix the rule.

## Interview Preparation

**Conceptual:** "Why is verifying `--gpus all` inside a container a meaningfully different check from `nvidia-smi` on the host?"

**Model Answer:** "`nvidia-smi` on the host only proves the driver is loaded and the kernel can talk to the hardware. It says nothing about whether Docker's runtime is configured to pass that access into a container's isolated namespace — which is a completely separate integration point, `nvidia-container-toolkit`, that has its own failure modes independent of the driver being fine. Since almost all real training workloads run inside containers, the host-level check is a necessary but not sufficient proof; the in-container check is the one that actually matches how the GPU will be used."

**Architecture:** "You're setting up a new GPU node and want to minimize the risk of a mid-training storage failure. What would you verify before starting a multi-hour training job?"

**Model Answer:** "First, that any durable state — checkpoints, tracking-server data, dataset caches — lives on an explicitly attached, separately-mounted volume rather than the OS disk, since OS disks are more likely to be treated as replaceable by the platform. Second, that the mount is registered in `/etc/fstab` with a UUID reference, not a device-path reference, since device paths like `/dev/vdc` aren't guaranteed stable across a reboot on some virtualization stacks. Third, I'd check available space against the expected size of checkpoints/artifacts for the run I'm about to start, since running out of disk mid-training is a much worse failure mode than catching it up front."

**Troubleshooting:** "A training job that ran fine yesterday now reports the GPU is not visible, with no code changes. What's your first diagnostic step?"

**Model Answer:** "I'd re-run the same layered verification from this chapter, in order, rather than guessing: host-level `nvidia-smi` first, to rule out a driver-level issue like a failed update or a host reboot that didn't reload the module; then the `--gpus all` container test, to isolate whether it's a host or a Docker-runtime issue; then check `docker ps` for whether another container is holding an exclusive lock on the device. Going in this order means each step either confirms or rules out an entire layer, rather than jumping straight to the training code, which almost certainly hasn't changed if nothing was deployed."

## Related Chapters

- **Previous:** [Chapter 1 — Why MLOps](./chapter-01-why-mlops-the-cost-of-ungoverned-ml.md)
- **Next:** [Chapter 3 — Data Versioning with DVC](./chapter-03-data-versioning-with-dvc.md) — the persistent storage this chapter provisions becomes DVC's remote
- **Related:** [Chapter 4 — Experiment Tracking with MLflow](./chapter-04-experiment-tracking-with-mlflow.md) — the same persistent volume hosts MLflow's backend and artifact stores
