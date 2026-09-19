---
title: "Chapter 9 — Power Supply Issues and Brownout Scenarios"
sidebar_position: 9
description: "Diagnose electrical instability. Learn how HW_POWER_BRAKE engages during PSU failures and how to read IPMI power telemetry."
---

# Chapter 9 — Power Supply Issues and Brownout Scenarios

| Chapter metadata | Value |
|---|---|
| Volume | 20 — Hardware Troubleshooting and XID Error Matrix |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | Data Center Architects, Hardware SREs |
| Core question | If a server needs 10,000 Watts to run an AI training job, what happens to the math when one of the power supplies suddenly dies? |

## Introduction

AI clusters consume power at a scale previously unseen in data centers. 
A standard rack of web servers might pull 10 kW. A single rack of HGX H100 servers can easily pull 40 kW to 100 kW. 

Managing the electrical delivery (Power Distribution Units - PDUs, and Power Supply Units - PSUs) is a critical architectural requirement. If the electrical delivery is unstable, the GPUs will not crash; they will engage aggressive power-throttling algorithms. 

A Senior Architect must know how to correlate mysterious performance drops with electrical telemetry.

## 1. N+N Power Redundancy

A standard HGX baseboard server often requires six massive 3,000W Power Supplies (PSUs).
They are usually configured in an **N+N Redundancy** mode (e.g., 3 active, 3 standby). 
If PSU 1 dies, PSU 4 instantly takes over. The server survives.

**The Danger Zone (Degraded Redundancy):**
If you lose two PSUs on the same side of the redundancy pool, the server no longer has enough physical wattage to run 8 GPUs at 700W each. 
If the server attempts to draw 10,000W, but only has 6,000W of functional PSU capacity, it will trip the circuit breaker and the server will hard crash.

## 2. HW_POWER_BRAKE (The Safety Net)

NVIDIA GPUs are integrated tightly with the server's BMC to prevent circuit breaker trips.

If the BMC detects a massive PSU failure and realizes the server is about to exceed its available electrical capacity, it issues an emergency hardware signal to the GPUs. 

The GPUs instantly engage **HW_POWER_BRAKE**. 
1. The clock speeds drop to the absolute minimum.
2. The power draw of each GPU plummets from 700W down to ~150W.
3. The server's total power consumption drops below the danger line, preventing a total blackout.

*The Symptom:* The training job stays alive, but it runs at 10% of its normal speed. 

## 3. Power Capping (`nvidia-smi -pl`)

Sometimes the power limit is intentional.
If a data center rack only has 30 kW of cooling capacity, but you install 40 kW of servers, you cannot run them at full speed.

An architect can enforce a **Power Limit**.
`nvidia-smi -pl 400` forces the GPU to never exceed 400 Watts. 
The GPU will boost its clock speeds until it hits exactly 400W, and then it will dynamically throttle itself to stay under the limit. This ensures the rack never trips the breaker, at the cost of reduced training throughput.

## Customer Scenario (Senior Level)

**The Situation:**
A data science team submits a ticket: Their training job on an 8-GPU node was running perfectly for 3 days. Suddenly, the throughput dropped by 80%. They check `nvidia-smi`; utilization is still at 100%, but the GPU clock speeds are incredibly low (e.g., 300 MHz). They check the GPU temperatures, expecting thermal throttling, but the GPUs are actually running *colder* than usual (45°C). They are completely confused. 

**The Senior Architect Response:**
"The GPUs are downclocking, but because the temperatures are unusually low, we can mathematically rule out Thermal Throttling. We are dealing with an **Electrical Throttling Event**.

We must query the **DCGM Exporter** and look at the `DCGM_FI_DEV_CLOCK_THROTTLE_REASONS` metric. We will likely see that the `HW_POWER_BRAKE` bit is active. 

This means the GPUs have been explicitly ordered by the server motherboard to slash their power consumption to prevent an electrical overload. 

Why did the motherboard send this order? We must check the **IPMI/BMC logs** for the host server. 
The BMC logs will almost certainly reveal that one or more Power Supply Units (PSUs) have suffered a hardware failure, or that a specific power feed (A/B feed) from the data center PDU has lost voltage. 

Because the server lost its N+N power redundancy and can no longer safely supply the 10 Kilowatts required to run 8 GPUs at full speed, the BMC triggered the emergency Power Brake. The GPUs slashed their clock speeds, which lowered their power draw, which perfectly explains why the temperatures dropped to 45°C. 

To fix this, we must cordon the node and dispatch a technician to replace the failed PSUs or restore the PDU feed. Once electrical redundancy is restored, the BMC will lift the brake, and the GPUs will return to maximum clock speeds."

## Interview Preparation

**Conceptual:** If a server's Power Supply Unit (PSU) fails, why does the GPU performance sometimes drop to a crawl instead of the server just shutting off? *(Hint: Modern servers communicate with the GPUs. If the BMC detects it no longer has enough wattage to run the server at full speed, it triggers a hardware safety mechanism (HW_POWER_BRAKE). The GPUs instantly downclock themselves to slash their power consumption, keeping the server alive but heavily degrading AI performance).*

**Architecture:** Why might an SRE intentionally use `nvidia-smi -pl` to lower the power limit of a GPU cluster? *(Hint: If a data center rack has a strict electrical or cooling limit (e.g., the PDU can only supply 30 kW), running the GPUs at maximum wattage might trip the circuit breaker. An SRE can artificially cap the maximum power draw of every GPU, ensuring the aggregate rack power never exceeds the safe limit, trading maximum performance for electrical stability).*
