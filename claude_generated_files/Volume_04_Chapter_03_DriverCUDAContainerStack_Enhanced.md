# Chapter 3 — Driver, CUDA runtime and container stack
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Know which layer must be compatible and which parts are host versus container responsibility.

*(original diagram: media/image1.png — preserved)*

Figure 1. Debug bottom-up: hardware/driver before container runtime, operator, model server and application.

The kernel/user-space NVIDIA driver enables device access. CUDA provides a programming/runtime ecosystem and accelerated libraries. Application containers typically carry compatible user-space libraries while relying on the host driver. NVIDIA Container Toolkit configures container runtime integration so containers receive GPU devices and driver libraries.

```
nvidia-smi
cat /proc/driver/nvidia/version
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

Do not diagnose "CUDA mismatch" from one version string alone. Compatibility has direction and constraints: application/runtime libraries, container image, host driver, framework build and GPU architecture all participate. Use the compatibility matrix/documentation for the versions in question.

---

➕ **ASCII diagram — the "bottom-up" debugging figure from Figure 1, made explicit as a layered stack with the actual compatibility direction:**
```
┌─────────────────────────────────────────────────────────────┐
│ Application (PyTorch/TensorRT-LLM/etc.)                     │ ← built against a specific CUDA Toolkit version
├─────────────────────────────────────────────────────────────┤
│ Framework's bundled CUDA runtime libs (libcudart, cuDNN...)  │ ← ships INSIDE the container image
├─────────────────────────────────────────────────────────────┤
│ Container image base                                         │ ← e.g. nvidia/cuda:12.8.0-base
├─────────────────────────────────────────────────────────────┤
│ NVIDIA Container Toolkit (nvidia-ctk / CDI)                  │ ← injects devices + host driver libs into container
├─────────────────────────────────────────────────────────────┤
│ Container runtime (containerd/CRI-O + nvidia runtime hook)   │
├─────────────────────────────────────────────────────────────┤
│ Host NVIDIA kernel driver (nvidia.ko) + user-space driver libs│ ← MUST be new enough for the CUDA version above
├─────────────────────────────────────────────────────────────┤
│ GPU hardware / firmware                                      │
└─────────────────────────────────────────────────────────────┘
   Compatibility direction: driver version sets a MAXIMUM supported CUDA
   version (backward compatible), not the reverse — an old host driver
   cannot run a container built against a newer CUDA than it supports.
```
This is the mechanical reason "check one version string" fails: a passing `nvidia-smi` on the host only proves the driver loaded and can enumerate the GPU — it says nothing about whether *this specific container's* bundled CUDA runtime is within that driver's supported range.

➕ **Annotated real output proving each layer separately (the exact commands from the chapter, with what a pass/fail actually looks like):**
```
$ nvidia-smi
Driver Version: 550.90.07      CUDA Version: 12.4      ← "CUDA Version" here is the MAX CUDA the driver supports, not what's installed

$ cat /proc/driver/nvidia/version
NVRM version: NVIDIA UNIX x86_64 Kernel Module  550.90.07  Wed Feb 21 ...
GCC version:  gcc version 11.4.0 ...
                                                          ← proves the kernel module loaded; independent of any container

$ docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
docker: Error response from daemon: OCI runtime create failed: ...
unsatisfied condition: cuda>=12.8, please update your driver to a newer version
                                                          ← THIS is the failure the chapter warns about: driver (max
                                                            CUDA 12.4) cannot satisfy an image requiring CUDA>=12.8.
                                                            "nvidia-smi works on host" said nothing about this.
```
That last error message is the single most common real-world Xid-adjacent support ticket in GPU fleets: the host driver is fine, the GPU is fine, and the failure is purely a version-skew boundary between driver and container image — exactly what the chapter's closing paragraph is warning you not to shortcut.

➕ **Extra worked scenario — driver/CUDA skew across a fleet, the operational consequence at scale:**
> **Situation:** A 200-node GPU fleet was provisioned over 18 months. 60 nodes have driver 535.x (older), 140 have driver 550.x (newer). A new inference image built against CUDA 12.6 is rolled out fleet-wide via a single Deployment.
> 1. Pods scheduled onto the 140 newer-driver nodes start fine. Pods scheduled onto the 60 older-driver nodes fail at container start with the "please update your driver" error above, or — worse — start but fail *inside* a specific kernel call at runtime (partial compatibility) rather than failing cleanly at launch.
> 2. Kubernetes has no native concept of "driver version compatible with this image" — the scheduler only sees `nvidia.com/gpu: 1` as a fungible resource count, so it happily schedules the incompatible Pod onto an old-driver node and lets it crash-loop.
> 3. Fix at the platform layer: GPU Operator/GFD-driven **node labels** for driver version (e.g. `nvidia.com/cuda.driver-version`), combined with a `nodeSelector`/`nodeAffinity` on the Deployment restricting it to nodes whose label satisfies the image's minimum driver requirement — turning an invisible runtime failure into a scheduling constraint the cluster enforces.
> 4. Longer-term fix: standardize driver version fleet-wide via GPU Operator's managed driver (rather than host-installed drivers per node), so "which driver is on this node" stops being a per-node accident of provisioning history.
> **Interview-ready line:** "Kubernetes schedules on GPU *count*, not GPU *software compatibility* — closing that gap is exactly what GPU Operator node labels plus nodeAffinity are for, and it's the first thing I'd check in a fleet with mixed driver versions."

➕ **Shortcut — one-liner to fleet-scan for driver/CUDA-capability skew before it becomes a scheduling incident:**
```bash
for node in $(kubectl get nodes -l nvidia.com/gpu.present=true -o name); do
  n=${node#node/}
  echo "$n: $(kubectl get node $n -o jsonpath='{.metadata.labels.nvidia\.com/cuda\.driver-version\.full}')"
done | sort -t: -k2
```
Sorting by driver version surfaces outlier nodes (the stragglers from an incomplete rollout) in one glance — this is the exact triage step before rolling out any image with a raised CUDA minimum.

➕ **Practice (continuation — original chapter had no numbered Practice list; these are new):**
1. Explain, without saying "version mismatch," the specific direction of the compatibility constraint between host driver and container CUDA version (which one sets the ceiling for the other).
2. ➕ A container fails with a CUDA error only after running for several minutes under load, not at startup — argue why this is *more* consistent with a partial/edge-case compatibility gap (e.g. a newer kernel API path only hit under specific conditions) than with the clean "please update your driver" failure shown above, and what evidence you'd gather to confirm it (`dmesg -T | grep -i nvrm`, exact driver/CUDA/framework version triad).
