---
title: "Lab 8 - Deploy Model in Confidential Compute Mode"
slug: "lab-08-deploy-ccm-attestation"
sidebar_position: 8
description: "Enable GPU Confidential Compute mode the correct way (not via legacy compute-mode flags), deploy a model, and verify attestation."
---

# Lab 8 — Deploy Model in Confidential Compute Mode

**Objective:** Correctly distinguish GPU Confidential Computing (CC) mode from the legacy `nvidia-smi -c` compute-mode flag, walk through the real CC enablement path, and verify device attestation before trusting a model deployment.

**Estimated time:** 90 minutes

**Prerequisites:**
- H100 (or newer) GPU with Confidential Computing support
- BIOS/firmware access on the host (CC is a firmware-level toggle — see Step 1)
- Driver version with `nvidia-smi conf-compute` support
- A CC-aware container runtime for the deployment step

This lab exists specifically to correct a common confusion (flagged in Chapter 9): `nvidia-smi -c` sets the legacy **Compute Mode** (`DEFAULT`/`EXCLUSIVE_THREAD`/`EXCLUSIVE_PROCESS`/`PROHIBITED`), which controls how many host processes can concurrently use the GPU. It has nothing to do with confidentiality, memory encryption, or attestation. Confusing the two is exactly the kind of error that would visibly fail in a hands-on interview.

## Step 0: Confirm You're Not Using the Wrong Flag

```bash
# WRONG — this is unrelated to Confidential Computing:
$ nvidia-smi -i 0 -c EXCLUSIVE_THREAD
# This only changes how many host processes may open a context on the GPU.
# It does not enable memory encryption, does not enable attestation, and
# "Compute Mode: Default" in a later query does NOT mean CC failed to
# enable — it means you checked the wrong subsystem entirely.

# RIGHT — check for CC support and current CC state via the conf-compute
# subcommand family:
$ nvidia-smi -i 0 -q | grep -i confidential
Confidential Compute Supported: Yes

$ nvidia-smi conf-compute -m
CC status: OFF
```

## Step 1: Enable CC Support at the Firmware Level

CC mode is a firmware/BIOS-level capability, not something a runtime driver flag alone turns on from a cold state. The exact toggle is host/BIOS-vendor specific — consult your server vendor's documentation. In general terms:

```bash
# 1. Reboot into system BIOS/firmware setup
# 2. Locate the Confidential Computing / TEE / SPDM-related toggle
#    (naming varies by vendor — look for "Confidential Computing",
#    "TEE-I/O", or similar under PCIe/security settings)
# 3. Enable it, save, and reboot back into the OS

# After reboot, re-check GPU-level support/state:
$ nvidia-smi conf-compute -m
CC status: OFF   # Firmware now supports it; driver-level enable is next
```

## Step 2: Enable CC Mode at the Driver Level

```bash
# Set CC mode ON (exact subcommand/flags are driver-version dependent —
# check `nvidia-smi conf-compute --help` against your deployed driver)
$ nvidia-smi conf-compute -sfp
Confidential compute feature set successfully

# A GPU reset is typically required for the mode change to take effect
$ nvidia-smi -i 0 --gpu-reset
GPU 00000000:01:00.0 reset successfully

# Re-verify
$ nvidia-smi conf-compute -m
CC status: ON
```

## Step 3: Confirm CC Mode Is Actually Active (Not Just Requested)

```bash
$ nvidia-smi -i 0 -q | grep -A3 "Confidential"
Confidential Compute Supported: Yes
Confidential Compute Mode: On
Confidential Compute GPUs Ready: Yes

# Cross-check: this output must be internally consistent. If you ever see
# "Confidential Compute Mode: On" alongside evidence that plaintext memory
# reads succeed from the host (Step 6), that's a sign the example — or the
# deployment — hasn't actually verified what it claims. Don't take a single
# status line as proof; the read-protection test in Step 6 is the real proof.
```

## Step 4: Deploy a Workload Inside CC Mode

```bash
# Requires a CC-aware container runtime + driver combination. This is
# illustrative of the concept; exact runtime flags are release-specific.
$ docker run --gpus all \
  --runtime=nvidia \
  pytorch:latest \
  python train.py

# Inside the container, model weights decrypted into GPU HBM are protected
# by the CC hardware boundary — the goal of Step 6 is to prove this, not
# just assert it.
```

## Step 5: Request and Verify Device Attestation

```bash
# Retrieve the GPU's attestation report (device-identity + firmware
# measurement, per NVIDIA's actual attestation architecture — see Chapter 9,
# section 9.4)
$ nvidia-attestation-cli --gpu 0 --nonce $(openssl rand -hex 16) > report.json

# Verify against NVIDIA's Remote Attestation Service (or a local verifier
# using NVIDIA's published Reference Integrity Manifest for the deployed
# firmware version)
$ nvidia-attestation-cli --verify report.json --rim nvidia-h100-rim.json
Attestation result: PASS
Device identity: verified
Firmware measurement: matches RIM
```

**Interpretation:** a PASS here means the GPU's firmware measurement matches NVIDIA's published known-good reference for that firmware version, and the device identity certificate chains back to NVIDIA. This is the real trust chain — distinct from, and not a rebrand of, Intel SGX/AMD SEV-SNP CPU-side attestation from earlier chapters.

## Step 6: Prove Memory Protection — Attempt a Host-Side Read (Should Fail/Return Ciphertext)

```bash
# From the HOST (outside the CC-protected context), attempt to inspect the
# GPU memory region used by the training process
$ nvidia-smi --query-compute-apps=pid,used_memory --format=csv
pid, used_memory [MiB]
14213, 21504

$ sudo gdb -p 14213 -batch -ex "dump memory /tmp/gpu_dump.bin <addr> <addr+4096>"
# Expected under working CC mode: either access is denied, or the dumped
# region is ciphertext (high entropy, not recognizable model-weight
# structure) — NOT plaintext floating-point weight values.
$ xxd /tmp/gpu_dump.bin | head -5
00000000: 8f3a 1c9e 44b1 . . .   # high-entropy bytes, not recognizable floats

# If this dump instead shows recognizable plaintext model weights, CC mode
# is NOT actually protecting memory — treat that as a failed verification,
# not a fixed one, and re-check Steps 1-3.
```

## Step 7: MIG + CC Interaction Check

```bash
# Confirm whether MIG and CC can coexist on this driver/hardware combination
# (they were mutually exclusive at H100's initial CC launch — verify current
# status for your deployed driver version rather than assuming either way)
$ nvidia-smi -i 0 -mig 1
# If this fails while CC mode is ON, that confirms the MIG/CC exclusivity
# constraint is still in effect on this driver version.
```

## Deliverable

Document your findings:

```
GPU: <model>
DRIVER VERSION: <version>

STEP 0 — WRONG FLAG CHECK:
  - Confirmed nvidia-smi -c is unrelated to CC: YES

CC ENABLEMENT:
  - Firmware/BIOS CC toggle enabled: YES/NO
  - nvidia-smi conf-compute -m reports ON: YES/NO
  - GPU reset performed after mode change: YES/NO

ATTESTATION:
  - Attestation report retrieved: YES/NO
  - Verified against RIM: PASS/FAIL
  - Device identity chain verified: YES/NO

MEMORY PROTECTION PROOF:
  - Host-side memory dump attempted: YES
  - Result: CIPHERTEXT / PLAINTEXT (should be ciphertext)

MIG + CC INTERACTION:
  - MIG creation while CC is ON: SUCCEEDED / FAILED
  - Conclusion for this driver version: <compatible / mutually exclusive>

INTERVIEW-READY STATEMENT:
"H100 Confidential Computing is enabled through a firmware-level toggle plus
the nvidia-smi conf-compute driver interface — not the legacy -c compute-mode
flag, which is a completely different feature (concurrent-process access
control). I verify it's actually working by attempting a host-side memory
read and confirming I get ciphertext, not plaintext weights, and by checking
the device attestation report against NVIDIA's published RIM rather than
trusting a single status line."
```

## Next Steps

Wire attestation verification (Step 5) into your deployment pipeline as an admission gate — refuse to route production traffic to a GPU node until its attestation report has passed, not just once at provisioning time but on a recurring schedule (firmware can be re-flashed after initial provisioning).
