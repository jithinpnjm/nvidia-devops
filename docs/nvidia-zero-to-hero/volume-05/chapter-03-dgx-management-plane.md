---
title: "Chapter 3 — The DGX Management Plane and Redfish APIs"
sidebar_position: 3
description: "Master the Out-of-Band (OOB) management of AI infrastructure. Learn about BMCs, IPMI, NVsm, and declarative Redfish API automation."
---

# Chapter 3 — The DGX Management Plane and Redfish APIs

| Chapter metadata | Value |
|---|---|
| Volume | 05 — DGX Systems & Infrastructure |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | If an OS crashes and takes the network down, how do you remotely reboot a $400,000 server? |

## Introduction

In standard cloud computing (AWS/Azure), you never think about physical server management. If a virtual machine freezes, you click "Reboot" in the web console, and the hypervisor forcefully resets the VM.

When you manage an on-premise DGX AI Factory, there is no hypervisor. You are managing the bare metal. If the Linux Operating System experiences a Kernel Panic, the standard network interfaces drop offline. You cannot SSH into the box. 

If your data center is located in Iceland, and you are working in New York, you need a way to force-restart the hardware, read thermal sensors, and update BIOS firmware without physically touching the machine.

This is the job of the **Out-Of-Band (OOB) Management Plane**, powered by the BMC and the Redfish API.

## 1. The Baseboard Management Controller (BMC)

Every enterprise server, including the DGX, contains a tiny, independent computer physically soldered onto the motherboard called the **Baseboard Management Controller (BMC)**.

*   **Always On:** As long as the server is plugged into the wall, the BMC is running. Even if the main Intel CPUs are powered off, the BMC is alive.
*   **Dedicated Network:** The BMC has its own dedicated ethernet port on the back of the server. This port is wired to an isolated "Management Network" switch, entirely separated from the high-speed InfiniBand traffic.
*   **Capabilities:** The BMC has hardware-level access to the motherboard. It can read physical temperature sensors, monitor fan speeds, read power supply voltages, and trigger the physical power-reset pins on the main CPUs.

*(Note: In the industry, the BMC is often referred to by vendor-specific names like Dell iDRAC or HP iLO, but the underlying concept is identical).*

## 2. From IPMI to the Redfish API

Historically, system administrators talked to the BMC using a protocol called **IPMI (Intelligent Platform Management Interface)**. IPMI is ancient, insecure, and incredibly difficult to automate using modern DevOps tools.

To modernize bare-metal management, the industry created the **Redfish API**.
Redfish is a modern, secure, RESTful API standard (using JSON and HTTPS) designed to replace IPMI. 

### Automating the AI Factory with Redfish
Because Redfish is just a REST API, SRE teams can use Python, `curl`, or Ansible to fully automate physical infrastructure.

Instead of manually logging into a web interface to check a GPU's temperature, a script can run:
```bash
curl -u admin:password -k https://<BMC_IP>/redfish/v1/Chassis/1/Thermal
```
This returns a clean JSON payload containing the exact temperatures of the CPUs, GPUs, and NVSwitches. 

In a cluster of 1,000 DGX nodes, automation via Redfish allows a single engineer to push a BIOS firmware update to every single motherboard simultaneously.

## 3. NVsm: NVIDIA System Management

NVIDIA provides a specialized software stack to monitor the DGX from *inside* the Linux operating system (In-Band management). This is the **NVIDIA System Management (NVsm)** tool.

While the BMC looks at the hardware from the *outside*, `nvsm` looks at the hardware from the *inside*.
*   If a DIMM (RAM stick) starts failing, `nvsm` will detect the ECC memory errors.
*   If the system crashes, you can run `nvsm dump health`, which packages all system logs, configuration files, and hardware states into a single `.tar` file that you instantly hand to NVIDIA Enterprise Support.

## Architectural Diagram: OOB vs In-Band Management

```mermaid
flowchart TD
    subgraph "The DGX Server"
        BMC["BMC (ASPEED Chip)<br>Always On"]
        CPU["Intel CPUs + Linux OS<br>Runs NVsm & Kubelet"]
        GPU["H100 GPUs"]
        
        BMC -.->|Hardware Monitoring| CPU
        BMC -.->|Hardware Monitoring| GPU
    end
    
    subgraph "The Networks"
        OOB["Out-Of-Band (OOB) Switch<br>1GbE Management"]
        InBand["In-Band Switch<br>10/100GbE API Traffic"]
    end
    
    Admin["SRE Team"] -->|Redfish API (HTTPS)| OOB
    OOB --> BMC
    
    Admin -->|SSH / kubectl| InBand
    InBand --> CPU
```

## Customer Scenario (Senior Level)

**The Situation:**
A junior systems administrator is tasked with updating the VBIOS (Video BIOS firmware) on 100 DGX H100 servers to fix a known bug. They plan to write a Bash script that uses SSH to log into each server, download the firmware, and run the `nvfwupd` command line tool to flash the GPUs. 

**The Senior Architect Response:**
"Using an SSH loop (In-Band management) to flash physical hardware firmware at scale is incredibly risky and violates our immutable infrastructure principles.

If the Linux OS crashes during the firmware flash, or if the 100GbE network blips, the SSH session will sever. The firmware update will be corrupted mid-write, permanently "bricking" the $30,000 GPUs and requiring an RMA replacement from NVIDIA.

Instead, we must manage infrastructure state through the **Out-Of-Band (OOB) Management Plane**. 
We will use Ansible to interact directly with the **Redfish API** exposed by the BMC on each server. The BMC operates entirely independently of the host Linux OS. We will push the firmware payload directly to the BMC via HTTPS, and instruct the BMC to flash the hardware securely. If the host Linux OS crashes during this process, the BMC will remain online and unaffected, guaranteeing the firmware flash completes successfully and safely across all 100 nodes."

## Interview Preparation

**Conceptual:** What is the difference between In-Band Management (SSH) and Out-Of-Band Management (BMC/Redfish)? *(Hint: In-Band relies on the Host OS and standard network interfaces being healthy. Out-Of-Band talks to an independent, physically isolated chip on the motherboard that works even if the server is powered off or crashed).*

**Architecture:** Why is the Redfish API vastly superior to IPMI for modern SRE teams? *(Hint: Redfish uses standard RESTful principles, HTTPS encryption, and returns structured JSON payloads, making it natively compatible with Python, Ansible, and modern CI/CD pipelines).*
