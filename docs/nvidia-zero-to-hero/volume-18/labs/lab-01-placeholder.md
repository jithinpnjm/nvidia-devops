---
title: "Lab 1 - Validate Secure Boot and Driver State"
slug: "lab-01-validate-secure-boot-driver-state"
sidebar_position: 1
description: "Practical exercise: verify Secure Boot is enabled, validate driver module signing, check GPU firmware version."
---

# Lab 1 — Validate Secure Boot and Driver State

**Objective:** Verify your AI infrastructure node has Secure Boot enabled and GPU drivers are properly signed.

**Estimated time:** 30 minutes

**Prerequisites:**
- Access to a Linux node with NVIDIA GPU
- `mokutil` installed
- `nvidia-smi` available

## Step 1: Check Secure Boot Status

```bash
$ mokutil --sb-state
SecureBoot enabled
```

If output shows `disabled`, note this as a finding for your security assessment.

## Step 2: Verify Kernel Module Signing Enforcement

```bash
$ cat /proc/cmdline | grep -o 'module\.sig_enforce=[^ ]*'
module.sig_enforce=1
```

Expected: `module.sig_enforce=1` (enforced) or `module.sig_enforce=y` (enabled).

If missing, signing is not enforced; document this gap.

## Step 3: Check NVIDIA Driver Module

```bash
$ cat /proc/modules | grep nvidia | head -1
nvidia 45678432 1 - Live Signed
```

Note: "Signed" indicates the module was verified at load time.

## Step 4: Verify GPU Firmware Version

```bash
$ nvidia-smi -i 0 -q | grep -A 5 "Vbios Version"
Vbios Version: 90.06.12.00.AB
```

Record the firmware version and compare against NVIDIA security advisories.

## Step 5: Check TPM and Boot Measurements (Optional, if TPM present)

```bash
$ tpm2_pcrread sha256 | grep -E 'PCR \[0|8|9|10\]'
  0 : 0x12345678...  (firmware measurements)
  8 : 0xabcdef00...  (kernel)
```

## Deliverable

Create a security audit report:

```
NODE_ID: <hostname>
DATE: <date>

SECURE BOOT:
  Status: [Enabled/Disabled]
  Bootloader signature verified: [Yes/No]

KERNEL MODULE SIGNING:
  Enforcement enabled: [Yes/No]
  Command: module.sig_enforce=1: [Present/Missing]

NVIDIA DRIVER:
  Version: <version>
  Signed: [Yes/No]

GPU FIRMWARE:
  Vbios Version: <version>
  Latest advisory version: <check NVIDIA advisories>

RECOMMENDATIONS:
  - [List any findings]
```

## Next Steps

If any items fail, remediate before deploying workloads. See Chapter 2 for remediation steps.
