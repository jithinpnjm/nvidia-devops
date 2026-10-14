---
title: "Chapter 8 - Enroot and Pyxis: Unprivileged Containers for AI Supercomputing"
slug: "chapter-8-enroot-and-pyxis-containers-for-hpc"
sidebar_position: 8
description: "How NVIDIA Enroot and the Pyxis Slurm plugin run containers on shared GPU clusters: the image format and commands, the configuration directories and standard hooks that inject GPUs and InfiniBand, credentials for NGC, Pyxis srun flags, caching strategy, and troubleshooting. Grounded in the Enroot and Pyxis repositories."
source_document: "Rewritten against the NVIDIA Enroot documentation (README, installation, image format, configuration, standard hooks, usage, start and import commands) and the NVIDIA Pyxis README. Fetched from github.com/NVIDIA/enroot and github.com/NVIDIA/pyxis (master)."
---

# Chapter 8 — Enroot and Pyxis: Unprivileged Containers for AI Supercomputing

**Learning outcome:** Explain why Enroot and Pyxis exist, import and run images the way a cluster user does, configure the system-wide directories and hooks that expose GPUs and InfiniBand to containers, and diagnose the failures that matter on a shared Slurm cluster.

**Prerequisites:** Linux namespaces at a conceptual level, Slurm `srun`/`sbatch` ([Chapter 6](./06-slurm-administration-ha-accounting-and-upgrades.md)), and container images.

**Difficulty:** Intermediate. **Estimated reading time:** 60 minutes.

**A note on sources.** An earlier version of this chapter described Enroot as relying on `/etc/subuid` ranges and setuid `newuidmap` helpers, put hardware injection in `environ.d/*.conf` files, and printed a "complete production" `enroot.conf` and system-call traces. Enroot's own README says it is "fully unprivileged ... (no setuid binary...)", the injection is done by hook scripts, and the long configurations and traces could not be traced to documentation. This rewrite follows the Enroot and Pyxis repositories. The appendices of the earlier draft were removed for the same reason.

---

## 1. Why a different container runtime for HPC

Enroot's README states the design in four words that matter here: it is a tool to "turn traditional container/OS images into unprivileged sandboxes". It "can be thought of as an enhanced unprivileged `chroot(1)`" that "uses the same underlying technologies as containers but removes much of the isolation they inherently provide while preserving filesystem separation." The README says this approach is generally preferred in high-performance environments, "where portability and reproducibility is important, but extra isolation is not warranted."

Its key concepts, from the README:

- Standalone: no daemon.
- Fully unprivileged and multi-user capable: no setuid binary, cgroup inheritance, per-user configuration and container store.
- Little to no isolation: no performance overhead, which simplifies HPC deployments.
- Built-in GPU support through `libnvidia-container`.
- Fast Docker image import (the README claims a 3x to 5x speedup on large images).
- Composable: system-wide and user-specific configuration.

Why that fits a shared GPU cluster:

| Concern on a shared Slurm cluster | How Enroot addresses it |
|---|---|
| Users must not get host root through the container runtime | No daemon and no setuid binary; the container runs as the submitting user, optionally remapped to root inside |
| Jobs must stay under Slurm's resource control | There is no separate daemon owning the processes, so Slurm's cgroup accounting sees them |
| Network performance for NCCL | Little to no isolation: by default the container shares the host network namespace (see `--net` below), so NCCL uses the host's NICs directly |
| Registry load and startup time at scale | Images are single squashfs files that you can import once and share |

The earlier draft also argued from invented numbers (for example "204,800,000 metadata requests"). The argument does not need them. Unpacking a layered image creates one file per file in the image, and a single squashfs file can be opened by many nodes with one metadata operation each. Measure your own storage before quoting a figure.

---

## 2. The image format and the command set

An Enroot image is a standard squashfs file. Three files inside it influence runtime behavior (Enroot docs, Image format):

| File | Role |
|---|---|
| `/etc/rc` | The container's command script (entrypoint). May carry a comment `# enroot-provenance: <uri>` recording the import URI |
| `/etc/fstab` | Mount configuration. Targets are relative to the container root. Supports extra options such as `x-create=dir`, and substitutes `${ENVVAR}` from the host |
| `/etc/environment` | Container environment, with host variable substitution |

The commands:

```text
enroot batch | bundle | create | exec | export | import | list | remove | start | version
```

A complete cycle, adapted from the usage documentation:

```bash
$ enroot import docker://nvcr.io#nvidia/cuda:12.9.1-devel-ubuntu24.04      # registry -> .sqsh file
$ enroot create --name cuda nvidia+cuda+12.9.1-devel-ubuntu24.04.sqsh       # unpack to a container
$ enroot list
$ enroot start --root --rw cuda sh -c 'apt update && apt install -y git'    # modify it
$ enroot export --output cuda-vecadd.sqsh cuda                              # save as an image
$ enroot remove cuda
```

- `import` converts a registry image into a `.sqsh` file. Supported schemes: `docker://[USER@][REGISTRY#]IMAGE[:TAG]`, `dockerd://` (from a local Docker daemon), and `podman://`. The `#` separates the registry from the image name.
- `create` unpacks the image into a container directory under your Enroot data path.
- `start --root` remaps the current user to root *inside* the container, and `--rw` makes the root file system writable. By default the container root file system is read-only (`start` documentation).
- `export` turns a modified container back into a squashfs image, and `remove` deletes the container.

**Starting an image directly.** `enroot start` accepts an image as well as a container name. In that case, changes are kept in memory and are lost when the container ends. Native overlayfs needs `squashfuse` (`ENROOT_NATIVE_OVERLAYFS`, default yes); the fallback uses `squashfuse` plus `fuse-overlayfs`. Remember this distinction in the read-only-file-system scenario below.

### 2.1 Root remapping, namespaces, and what `--root` does not give you

`--root` (or `ENROOT_REMAP_ROOT=yes`, default `no`) maps the current user to root inside the container. This lets package managers work inside the container's file system. It does not grant host privileges, because the kernel still enforces access using your real UID. Pyxis's `--container-remap-root` help says it "does not grant elevated system permissions, despite appearances."

Enroot starts with *little* isolation. These settings add isolation when you want it:

| Setting | Flag | Effect |
|---|---|---|
| `ENROOT_UNSHARE_NET` | `--net` | New network namespace, loopback only |
| `ENROOT_UNSHARE_PID` | `--pid` | New PID namespace; no init is injected, the command becomes PID 1 |
| `ENROOT_UNSHARE_IPC` | `--ipc` | New IPC namespace and a restricted `/dev` |
| `ENROOT_UNSHARE_UTS` | `--uts` | New UTS namespace |

All default to `no`. Leaving `--net` off is what lets a multi-node NCCL job use the host's InfiniBand and Ethernet addresses.

---

## 3. Configuration: paths, directories, and hooks

### 3.1 Paths and the config file

Enroot reads `enroot.conf` from `ENROOT_SYSCONF_PATH` (default `/etc/enroot`) and any `enroot.conf.d/*.conf` next to it. Environment variables take precedence over the file (Enroot docs, Configuration). Standard paths:

| Setting | Default | Meaning |
|---|---|---|
| `ENROOT_LIBRARY_PATH` | `/usr/lib/enroot` | Library sources |
| `ENROOT_SYSCONF_PATH` | `/etc/enroot` | System-wide configuration |
| `ENROOT_RUNTIME_PATH` | `${XDG_RUNTIME_DIR}/enroot` | Runtime working directory |
| `ENROOT_CONFIG_PATH` | `${XDG_CONFIG_HOME}/enroot` | Per-user configuration |
| `ENROOT_CACHE_PATH` | `${XDG_CACHE_HOME}/enroot` | Per-user image and credential cache |
| `ENROOT_DATA_PATH` | `${XDG_DATA_HOME}/enroot` | Per-user container storage |
| `ENROOT_TEMP_PATH` | `${TMPDIR}` | Temporary files |

Design implication (judgment, not a documented rule): unpacked containers are written to `ENROOT_DATA_PATH`, which is per-user and, on a cluster, should be a node-local fast disk. Image *files* you share across the cluster belong on shared storage and are referenced by path (section 5).

The earlier draft's "production" `enroot.conf` listed variables such as `ENROOT_MOUNT_OPTIONS` and `ENROOT_TRANSFER_RETRIES` and used `%u` expansion. Those are not in the Enroot documentation fetched for this chapter. Start from the packaged `enroot.conf`, change one setting at a time, and read the installed file for the exact variable names in your version.

### 3.2 Container configuration directories

Under `ENROOT_SYSCONF_PATH` (system-wide) and `ENROOT_CONFIG_PATH` (per user) there are three directories, with required file extensions:

| Directory | Extension | Purpose |
|---|---|---|
| `environ.d` | `.env` | Environment variables exported inside containers (same format as `/etc/environment`) |
| `mounts.d` | `.fstab` | Mounts applied inside containers (same format as `/etc/fstab`) |
| `hooks.d` | `.sh` | Pre-start hook scripts: bash scripts that run with full capabilities before the container switches to its final root |

Hooks and configuration files see the host environment plus `ENROOT_PID`, `ENROOT_ROOTFS`, `ENROOT_MOUNTS`, and `ENROOT_ENVIRON`. The earlier draft put NVIDIA and Mellanox injection in `environ.d/50-nvidia.conf` and `mounts.d/mellanox.conf`. That is the wrong directory and the wrong extension for what those do.

### 3.3 Standard hooks: how GPUs and InfiniBand get in

Enroot ships hooks that do the hardware work (Enroot docs, Standard Hooks):

| Hook | Setting | Default | What it does |
|---|---|---|---|
| `10-cgroups.sh` | none | always on | Mounts the cgroup subsystems in a new cgroup namespace, if supported |
| `10-devices.sh` | `ENROOT_RESTRICT_DEV` | `no` | Restricts `/dev` inside the container to a minimal set of devices |
| `10-home.sh` | `ENROOT_MOUNT_HOME` | `no` | Mounts your home directory and sets `HOME` |
| `10-shadow.sh` | none | always on | Adds your user and group to the container's `/etc/passwd` and `/etc/group`, and creates home and mail directories |
| `98-nvidia.sh` | `NVIDIA_*` | | GPU support through `libnvidia-container`. Settings are the `nvidia-container-runtime` environment variables |
| `99-mellanox.sh` | `MELLANOX_*` | | InfiniBand HCA support by **injecting MOFED from the host** into the container. Devices are selected with `MELLANOX_VISIBLE_DEVICES`, similar to how `98-nvidia.sh` exposes GPUs |

So:

- **GPUs.** `NVIDIA_VISIBLE_DEVICES` selects which GPUs, and `NVIDIA_DRIVER_CAPABILITIES` which parts of the driver stack. Under Slurm with GPU binding, these usually come from the job environment, so verify what your site sets. `libnvidia-container-tools` must be installed on the node (Enroot's runtime dependencies list it as optional, which on a GPU node is not optional in practice).
- **InfiniBand.** The container gets host-matched MOFED user-space libraries and devices from `99-mellanox.sh`. If a container image carries its own, older OFED libraries, the hook's injection is what keeps the user-space libraries compatible with the host kernel modules. That is why a "NET/IB: No device found" failure often points at the hook, not at NCCL.

### 3.4 Registry credentials

`enroot import` reads credentials from `$ENROOT_CONFIG_PATH/.credentials` in netrc format (Enroot docs, import):

```text
# NVIDIA GPU Cloud (both endpoints are required)
machine nvcr.io login $oauthtoken password <token>
machine authn.nvidia.com login $oauthtoken password <token>

# Docker Hub
machine registry-1.docker.io login <login> password <password>
```

- For NGC, **both** `nvcr.io` and `authn.nvidia.com` entries are required. Missing the second is a common cause of authentication failures on NGC imports.
- `$oauthtoken` is the literal login name for an NGC API key.
- If a password starts with `$`, Enroot substitutes it. Protect the file (mode 600), and never commit it.

---

## 4. Pyxis: Enroot inside Slurm

Pyxis is a SPANK plugin for Slurm. It "allows unprivileged cluster users to run containerized tasks through the `srun` command" and supports multi-node MPI jobs through PMI2 or PMIx, which requires Slurm support (Pyxis README). Notable benefits from the README: layer caching and sharing across users, ability to install packages in the container, and no need for cluster-wide management of subordinate user and group IDs.

### 4.1 Installation notes that bite

- Pyxis requires Enroot (the README names version 3.1.0 as the requirement at time of writing; check the repository for the current requirement).
- **Since Slurm 21.08, Pyxis must be compiled against the release of Slurm deployed on the cluster.** Compiling against `spank.h` from a different Slurm release makes Slurm refuse to load the plugin. Rebuild Pyxis as part of every Slurm upgrade ([Chapter 10](./10-coordinated-cluster-wide-software-change-management.md)).
- Packages: `make install`, a deb, or an rpm. Then link the packaged configuration into Slurm's plugin configuration and restart `slurmd`:

```bash
$ sudo ln -s /usr/share/pyxis/pyxis.conf /etc/slurm/plugstack.conf.d/pyxis.conf
$ sudo systemctl restart slurmd
```

(The path under `/usr/share/pyxis` is for the deb and rpm packages; `make install` uses `/usr/local/share/pyxis`.)

### 4.2 The flags

Pyxis adds these arguments to `srun` (and, through `#SBATCH`, to `sbatch`):

| Flag | Meaning (from the Pyxis help text) |
|---|---|
| `--container-image=[USER@][REGISTRY#]IMAGE[:TAG]\|PATH` | The image: an Enroot URI, or a **path to a squashfs file on the remote host file system** |
| `--container-mounts=SRC:DST[:FLAGS][,SRC:DST...]` | Bind mounts; flags separated with `+`, for example `ro+rprivate` |
| `--container-workdir=PATH` | Working directory inside the container |
| `--container-name=NAME` | Name for saving and loading the container on the host. Unnamed containers are removed after the task completes; named containers are not, and an existing container of that name is reused, **skipping the import** |
| `--container-save=PATH` | Save the container state to a squashfs file |
| `--container-mount-home` / `--no-container-mount-home` | Bind-mount, or do not, the user's home directory (system Enroot settings may already mount it) |
| `--container-remap-root` / `--no-container-remap-root` | Remap to root inside the container (no elevated host permissions) |
| `--container-entrypoint` / `--no-container-entrypoint` | Run, or skip, the image's entrypoint |
| `--container-writable` / `--container-readonly` | Make the container file system writable or read-only |
| `--container-env=NAME[,NAME...]` | Host variables to override and set **before** the entrypoint runs. By default exported host variables are set after the entrypoint, with the image's existing values taking precedence |
| `--container-unshare=NS[,NS...]` | New namespaces: `net`, `ipc`, `uts` |

Two practical consequences:

1. **`--container-name` is a cache.** It makes repeated runs on the same node skip the import. It also means a stale container can survive across runs on that node, so remove it deliberately when the image changes.
2. **In `sbatch`, the `#` in an NGC image name starts a comment.** Escape it: `#SBATCH --container-image nvcr.io\#nvidia/pytorch:21.12-py3` (Pyxis README).

A multi-node launch looks like this:

```bash
srun --nodes=4 --ntasks-per-node=8 --gpus-per-node=8 \
     --mpi=pmix \
     --container-image=/shared/containers/pytorch.sqsh \
     --container-mounts=/shared/datasets:/data \
     --container-workdir=/workspace \
     python3 train.py
```

- `--container-image` points at a shared `.sqsh` path, so the nodes do not contact a registry.
- `--mpi=pmix` selects the PMIx plugin in Slurm. Check `srun --mpi=list` and your site's Slurm MPI configuration ([Chapter 15](./15-senior-deep-dive-3-mpi-and-nccl-joint-debugging.md) section 3).
- GPU and InfiniBand exposure comes from the Enroot hooks in section 3.3, driven by what Slurm sets in the job environment.

---

## 5. Image distribution at scale

Three ways to get an image to many nodes, with the trade-offs:

| Method | How | Trade-off |
|---|---|---|
| Registry URI on every node | `--container-image=nvcr.io#nvidia/pytorch:TAG` | Simple. Every node contacts the registry, so large jobs invite rate limits and slow starts. Pyxis caches layers, but not across a cold fleet |
| **Pre-import once to shared storage** | `enroot import` on one host, write the `.sqsh` to a shared file system, and reference its path | Registry is contacted once. The image is one large file for the storage system to serve. You own image lifecycle and naming |
| Named container per node | `--container-name=...` | Fast repeat runs, but each node holds its own copy and can go stale |

Recommendation (judgment): for any job larger than a few nodes, import once and reference a path. Name image files with the source tag and a date. Treat them as immutable and publish a new file for a new version.

How well a shared file system serves a large squashfs file to many readers depends on your storage. Test it with your own node count before you rely on it, instead of quoting a speedup.

---

## 6. Troubleshooting scenarios

### Scenario 1: "Read-only file system" when writing in the container

**Symptom.** A job fails with `OSError: [Errno 30] Read-only file system` on a path inside the container.

**Cause.** The container root is read-only by default (`enroot start` documentation). Two ways around it, with different consequences:

- **Bind-mount a writable location** for output: `--container-mounts=/shared/out:/out`. This is the right fix for checkpoints, logs, and anything large.
- **`--container-writable`** makes the container's root writable. A container created from an image is unpacked to `ENROOT_DATA_PATH`, so writes go to that disk, not to memory. Only when you start a squashfs image *directly* are changes kept in memory and lost at exit (`start` documentation). Know which path your job is on before you write large files.

### Scenario 2: GPUs not visible in the container

**Symptom.** `nvidia-smi` works on the host but reports no devices in the container.

**Steps.**
1. Confirm the job actually has GPUs and what environment it carries: `srun --gpus=8 env | grep -E 'NVIDIA|CUDA|SLURM_.*GPU'`.
2. Check that `98-nvidia.sh` exists under `hooks.d` and is not disabled, and that `NVIDIA_VISIBLE_DEVICES` is not overwritten before the hook runs.
3. Check that `libnvidia-container-tools` is installed on the node and works: `nvidia-container-cli list`.
4. Reproduce with Enroot alone, outside Slurm, to separate Enroot from Pyxis.

### Scenario 3: Registry 429 or authentication errors on import

**Symptom.** Many nodes fail or stall importing the same image; logs show HTTP 429 or an authentication error.

**Fix.** Stop the fan-out: cancel the job, import once to shared storage, and resubmit with a path (section 5). For authentication, verify `~/.config/enroot/.credentials` (or `$ENROOT_CONFIG_PATH/.credentials`) contains **both** NGC machine entries. The registry's own rate-limit policy is outside Enroot, so check it with the registry operator.

### Scenario 4: A user cannot import or convert images

**Symptom.** `enroot import` or `create` fails with permission errors on a cluster where administrators installed the plain package.

**Cause and fix.** The Enroot installation documentation provides `enroot` and `enroot+caps` (and hardened variants). The `+caps` package "grants extra capabilities to unprivileged users which allows them to import and convert container images." Confirm which flavor is installed. The standard flavor also states that open file descriptors are inherited and that some Spectre mitigations are disabled, while the hardened flavor is "slightly more secure but will suffer from a larger overhead." Pick deliberately for a multi-tenant cluster.

### Scenario 5: NCCL reports no InfiniBand device inside the container

**Symptom.** `NCCL INFO NET/IB : No device found` in the container, while it works on the host.

**Steps.**
1. Confirm `99-mellanox.sh` is present and enabled, and `MELLANOX_VISIBLE_DEVICES` is set as intended (the hook controls which HCAs are injected).
2. Check `/dev/infiniband` inside the container and `ibstat`.
3. Compare the MOFED version on the host with the libraries the container sees. The hook injects the host's.
4. Use the NCCL checks in [Chapter 15](./15-senior-deep-dive-3-mpi-and-nccl-joint-debugging.md): `NCCL_DEBUG=INFO` should show `Using network IB`.

---

## 7. Interview questions

**Q1. Why is Enroot "little to no isolation," and why is that a feature on a GPU cluster?**
> "Enroot's README describes it as an unprivileged chroot that keeps filesystem separation but removes much of container isolation. On a training cluster that means the job sees the host's network and devices directly, which is what NCCL over InfiniBand needs, with no extra network layer. The cost is weaker isolation between tenants than a full container runtime, which is why you run it as an unprivileged user and add namespaces (`--net`, `--pid`, `--ipc`, `--uts`) only when you need them."

**Q2. How do GPUs and InfiniBand get into an Enroot container?**
> "Through pre-start hook scripts in `hooks.d`. `98-nvidia.sh` uses libnvidia-container and the `NVIDIA_*` variables, and `99-mellanox.sh` injects host MOFED and selects HCAs with `MELLANOX_VISIBLE_DEVICES`. They run with full capabilities before the container switches to its final root. Configuration files in `environ.d` and `mounts.d` need `.env` and `.fstab` extensions and are static, which is a different mechanism."

**Q3. A job ran out of space writing a checkpoint inside the container. What happened?**
> "Probably a write into the container root file system. By default it is read-only, so the job needed either `--container-writable` or a bind mount. For checkpoints I'd always use `--container-mounts` to a shared file system. I'd also check whether the job started a squashfs image directly, because in that mode changes are held in memory."

**Q4. How do you stop 500 nodes from hammering a registry?**
> "Import once, write the `.sqsh` to shared storage, and point `--container-image` at the path. That makes the registry a one-time dependency. For authentication on NGC I'd check the credentials file has both the `nvcr.io` and `authn.nvidia.com` entries."

**Q5. What breaks when you upgrade Slurm?**
> "Pyxis. Since Slurm 21.08 it must be compiled against the Slurm release it runs under, otherwise Slurm refuses to load it. So the upgrade plan includes rebuilding and redeploying Pyxis on every node before declaring the upgrade done."

---

## Key takeaways

1. **Enroot is deliberately thin.** Unprivileged, daemonless, no setuid binary, little isolation. The README says so, and the rest follows.
2. **Hardware injection is hook scripts.** `98-nvidia.sh` for GPUs, `99-mellanox.sh` for InfiniBand. Config directories need `.env`, `.fstab`, and `.sh` extensions.
3. **Credentials for NGC need two entries.** `nvcr.io` and `authn.nvidia.com`.
4. **Pyxis is a SPANK plugin tied to your Slurm build.** Rebuild it with every Slurm release.
5. **Import once, run by path.** It removes the registry from the critical path at scale.
6. **Know where writes go.** Container root read-only by default; unpacked containers write to disk; directly started images write to memory.

---

## Sources

- NVIDIA Enroot repository and docs (README, installation, image format, configuration, standard hooks, usage, `start`, `import`): [github.com/NVIDIA/enroot](https://github.com/NVIDIA/enroot)
- NVIDIA Pyxis README: [github.com/NVIDIA/pyxis](https://github.com/NVIDIA/pyxis)
- NVIDIA Container Toolkit documentation: [docs.nvidia.com/datacenter/cloud-native/container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/index.html)
- SchedMD Slurm SPANK documentation: [slurm.schedmd.com/spank.html](https://slurm.schedmd.com/spank.html)

**Not verified in this rewrite.** The full variable list of the packaged `enroot.conf`, Pyxis plugin arguments in `pyxis.conf`, PMIx socket handling details, and behavior of a specific parallel file system serving large squashfs files. Check the installed files and your own measurements.
