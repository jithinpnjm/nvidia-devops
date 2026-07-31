# Chapter 5 — Namespaces, cgroups and container mechanics
*(original text preserved in full; ➕ marks additions)*

**Learning outcome:** Explain what a container actually is at the Linux level and how Kubernetes requests/limits map to resource control.

## 5.1 Namespaces
| Namespace | Isolation view |
|---|---|
| pid | process IDs and process tree |
| net | interfaces, routes, sockets, firewall namespace |
| mnt | mount table/filesystem view |
| uts | hostname/domain |
| ipc | IPC resources |
| user | user/group ID mappings |
```bash
lsns
readlink /proc/<PID>/ns/net
nsenter -t <PID> -n ip addr
nsenter -t <PID> -n ip route
```

➕ **The pause-container mechanism, precisely (why `nsenter` even works this way):**
```
Pod "web" (2 containers)
┌─────────────────────────────────────────────┐
│ pause container: holds open NET+IPC namespace │ ← created first, never restarts
│   app container 1: own PID/MNT, shares NET/IPC │
│   app container 2: own PID/MNT, shares NET/IPC │
└─────────────────────────────────────────────┘
```
`nsenter -t <pause_PID> -n ip addr` and `nsenter -t <app_container_PID> -n ip addr` return the *same* output — proving the shared netns live, not just in theory. Killing the pause container process (rare, but happens on some node-level cleanup bugs) drops pod networking even with app containers still technically alive — a real, if unusual, incident signature worth recognizing.

➕ **`user` namespace — the one most K8s clusters *don't* use by default, and why that matters for the security answer in Chapter 2's capabilities discussion:** without a user namespace, UID 0 inside the container **is** UID 0 on the host kernel (same UID space) — capabilities/seccomp/MAC are what actually constrain it, not the namespace itself. Rootless container runtimes (or K8s user-namespace support, GA more recently) remap container UID 0 to an unprivileged host UID — genuinely stronger isolation, at the cost of complexity (volume ownership, some syscall compatibility). Worth naming as "the isolation upgrade most clusters haven't adopted yet" if asked about container security maturity.

## 5.2 cgroups
cgroups organize processes for resource accounting/control. In cgroup v2, controllers expose files for CPU, memory, I/O and other resources. Container runtimes place container processes into cgroups; Kubernetes requests influence scheduling while limits may become enforcement configuration.
```bash
cat /proc/<PID>/cgroup
cat /sys/fs/cgroup/cpu.stat
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.events
```

➕ **requests vs limits — the exact mechanism split, worth stating precisely:**
| | Where it's used | Kernel enforcement? |
|---|---|---|
| `requests` | scheduler bin-packing input only | none — purely a placement hint |
| `limits.cpu` | written to `cpu.max` (quota/period) | yes — CFS bandwidth throttling (slows down, doesn't kill) |
| `limits.memory` | written to `memory.max` | yes — kernel OOM killer (kills the process) |

Same "limits" word, two completely different enforcement mechanisms and two completely different failure symptoms — this table is worth having memorized verbatim.

## 5.3 What an image is — and is not
A container image is a filesystem/content package plus metadata. Isolation comes from how the runtime launches the process: namespaces, cgroups, mounts, capabilities, seccomp, LSM policy and device access. This distinction is essential when debugging "container" problems that are actually host-kernel or cgroup problems.

➕ **The runtime chain and where GPU access is actually injected:**
```
kubelet → CRI (gRPC) → containerd/CRI-O → runc (OCI runtime: does the literal clone() call)
                                             │
                                    NVIDIA Container Toolkit hooks in here as an OCI
                                    prestart hook — injects /dev/nvidia* + driver libs
                                    into the container's mount namespace at creation time
```
"How does a container see the GPU" has a precise answer: a prestart hook, not magic, not a special container type. Worth being able to say this exact chain without hesitation — it's a very likely interview question given the role.

➕ **OverlayFS — why container writes vanish and where they actually live:**
```
merged (what the process sees) = upperdir (container's own writes) + lowerdir (image layers, read-only)
```
Writes not going to a mounted volume live in `upperdir` and disappear when the container is removed. Heavy write-churn to `upperdir` (an app logging to a local file instead of stdout, or large temp files) causes real overlay-layer I/O overhead that's easy to misattribute to "the disk is slow."

## Worked scenario
**Situation:** A Pod shows CPU latency but the node dashboard has idle CPU.

1. Inspect the Pod CPU limit and container cgroup cpu.stat for throttling.
2. Compare requested/limited CPU with application thread behavior.
3. Check node run queue and per-CPU utilization to distinguish local quota from host saturation.
4. Only then decide whether to change limits, requests or application concurrency.

**Conclusion:** A container can be locally constrained inside an apparently idle node.

*(This is the same throttling mechanism as Chapter 1's worked scenario — cross-reference rather than re-deriving; the "container-shaped" framing here vs. the "host-shaped" framing there is the point: same evidence, different entry angle.)*

---
# Chapter 6 — systemd, boot, services, signals and logs
*(original text preserved in full; ➕ marks additions)*

**Learning outcome:** Diagnose why a Linux service failed to start, restarted, stopped accepting traffic or was killed.

## 6.1 Unit state and dependency model
systemd manages units such as services, sockets, mounts and timers with dependency and ordering relationships. status is a summary; show exposes properties; journalctl gives event history. Always move from unit state to the actual process and external dependencies.
```bash
systemctl status myservice --no-pager
systemctl show myservice -p ActiveState -p SubState -p ExecMainStatus -p NRestarts
journalctl -u myservice --since '-30 min'
systemctl list-dependencies myservice
```

➕ **Boot chain, one line each, for the "explain how Linux boots" baseline:**
```
firmware/UEFI → bootloader (GRUB) → kernel + initramfs → PID 1 (systemd) → targets → units in dependency order
```
GPU-relevant: `nvidia-persistenced` is a systemd-managed unit on bare-metal nodes — it's how the driver state persists across container restarts on the host without reloading. `systemctl status nvidia-persistenced` is a legitimate first check on "GPU not visible after node reboot."

## 6.2 Signals and shutdown
SIGTERM requests graceful termination; SIGKILL cannot be handled. Kubernetes termination ultimately becomes process signals inside the container. Applications that ignore SIGTERM or take longer than their grace period may be killed before cleanup completes.
```bash
kill -TERM <PID>
kill -KILL <PID> # last resort; no cleanup handler can run
```

➕ **The exact K8s termination sequence, timed:**
```
kubectl delete pod
  │
  ▼ t=0s     kubelet sends SIGTERM to container's PID 1
  │          preStop hook runs concurrently (if defined)
  ▼ t=0-30s  terminationGracePeriodSeconds window (default 30s) — app should flush/checkpoint here
  ▼ t=30s    if still alive: SIGKILL — immediate, no cleanup possible
```
```python
import signal, sys
def handle_sigterm(signum, frame):
    save_checkpoint()   # must finish before the grace period expires
    sys.exit(0)
signal.signal(signal.SIGTERM, handle_sigterm)
```
**Direct GPU/AI tie-in:** a long-running training job that doesn't trap SIGTERM gets hard-killed mid-write on any node drain, preemption, or spot-instance reclaim — losing the checkpoint entirely rather than saving a clean one. This is a natural, concrete place to bring up spot/preemptible GPU capacity cost tradeoffs in an SA interview: "cheaper capacity is only actually cheaper if the workload handles SIGTERM correctly."

➕ **PID 1 zombie-reaping tie-in (cross-ref Chapter 1's zombie discussion):** if your container's PID 1 is your application directly (not `tini`/`dumb-init`), it inherits full PID-1 responsibilities — including reaping zombie children — which most application code was never written to do. This is why minimal images increasingly default to an init wrapper as PID 1.

## Worked scenario
**Situation:** A service repeatedly restarts every 30 seconds.

1. Read systemctl show/status and journal history to determine whether systemd is restarting after non-zero exit, watchdog failure or dependency issue.
2. Inspect the process exit code and application logs around each restart.
3. Check listeners, credentials, files, DNS and upstream dependencies the process needs during startup.
4. Confirm resource/OOM/kernel events are not killing it externally.
5. Fix the cause before increasing restart limits.

**Conclusion:** Restart policy is recovery behavior; it is not root cause.

➕ **Second worked scenario — CrashLoopBackOff, the Kubernetes mirror of the exact same pattern:**
> **Situation:** A pod is in `CrashLoopBackOff`, restarting with increasing backoff delay.
> 1. `kubectl describe pod` → check `Last State: Terminated, Reason, Exit Code` first — exit code 137 = SIGKILL (likely OOM, check `Reason: OOMKilled` specifically), exit code 1 or other = application-level failure, check logs.
> 2. `kubectl logs <pod> --previous` — the *previous* container's logs, not the current (already-restarting) one — the actual crash evidence is in the previous instance.
> 3. Same tree as the systemd scenario above: distinguish "crashed because of what it needs" (config, secrets, DNS to a dependency) from "crashed because it was killed" (OOM, node pressure eviction) from "crashed because of its own bug" (unhandled exception, exit code from app logic).
> **Conclusion:** `CrashLoopBackOff` is systemd's restart-policy pattern, one layer up — same diagnostic tree, different tool (`kubectl describe`/`logs --previous` instead of `journalctl`).

## Targeted references
[Udemy - Complete Linux Troubleshooting Course](https://www.udemy.com/course/linux-troubleshooting-course) - Target: Running Out of Memory, System is Running Slow, filesystem, access, logs/processes and networking sections.
[Linux kernel documentation](https://docs.kernel.org/) - Authoritative kernel behavior.
[Coursera - The Bits and Bytes of Computer Networking](https://www.coursera.org/learn/computer-networking) - Target TCP/IP, routing, DNS and troubleshooting modules.

➕ **Cross-chapter drill (do this before the Senior Deep Dives):** without looking anything up, explain end-to-end: a pod is `CrashLoopBackOff`, exit code 137. Walk from "what does 137 mean" through cgroup OOM (Ch2) vs node OOM (Ch2) vs an external SIGKILL (Ch6), naming the exact commands that disambiguate each, in under 90 seconds.
