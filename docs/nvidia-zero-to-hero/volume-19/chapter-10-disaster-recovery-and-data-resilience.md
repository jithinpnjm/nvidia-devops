---
title: "Chapter 10 — Disaster Recovery and Data Resilience"
sidebar_position: 10
description: "Master AI backup strategies. Learn how to protect petabytes of training data and massive LLM checkpoints from ransomware and catastrophic failure."
---

# Chapter 10 — Disaster Recovery and Data Resilience

| Chapter metadata | Value |
|---|---|
| Volume | 19 — AI SRE and Operations |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Storage Architects |
| Core question | If a rogue script accidentally runs `rm -rf /` on your primary Lustre storage array, wiping 3 months of training data, how do you recover the company? |

## Introduction

In standard IT, Disaster Recovery (DR) is straightforward: you use a backup agent to take a snapshot of the database every night and send it to an offsite location.

In AI infrastructure, standard backup agents fail. 
You cannot run an overnight backup on a 10-Petabyte dataset. The math does not work. A 10Gbps connection takes roughly 92 days to transfer 10 Petabytes. If you try to back it up over the network, you will saturated the spine switches and slow down the active training jobs. 

A Senior Architect must design a resilient data architecture that assumes the primary storage array will eventually be destroyed, corrupted by bad code, or encrypted by ransomware.

## 1. The RPO and RTO of AI

*   **RPO (Recovery Point Objective):** How much data can the business afford to lose? For a training job, the RPO is defined by your checkpoint frequency. If you checkpoint every 4 hours, your RPO is 4 hours. You will lose exactly 4 hours of compute time if the cluster burns down.
*   **RTO (Recovery Time Objective):** How long does it take to get the cluster running again? 

If your primary parallel file system dies, and you have to restore 5 Petabytes from AWS S3 Glacier, your RTO might be 3 weeks. You must align these metrics with the CFO.

## 2. Immutable Storage and Ransomware

If an attacker gains access to your network, they will find your storage array and encrypt your 50 Terabyte checkpoint files. 

**The Defense: Object Lock (WORM)**
You must configure your Tier 3 backup storage (S3) with Object Lock (Write Once, Read Many). 
When the training pipeline pushes a checkpoint to S3, the S3 bucket physically prevents the file from being modified or deleted for a specified period (e.g., 30 days). Even if an attacker compromises the AWS root account, they cannot delete or encrypt the backups.

## 3. Storage Snapshots vs. Replication

To protect the massive datasets (which are too large to back up nightly), you must rely on native storage array features.

1.  **Storage Snapshots (Local Protection):** The Parallel File System (e.g., Weka/NetApp) takes a momentary, read-only snapshot of the file system pointers. It takes zero seconds and zero bytes of space. If a data scientist runs `rm -rf`, the SRE can instantly revert the file system to the snapshot from 5 minutes ago. 
2.  **Asynchronous Replication (Geographic Protection):** To protect against a data center fire, the storage array quietly mirrors only the *changed* data blocks to a secondary storage array in a different physical location over a dedicated dark fiber link. 

## Customer Scenario (Senior Level)

**The Situation:**
An AI lab is training a foundation model. The active dataset and all checkpoints are stored on a high-performance, 1-Petabyte NVMe file system. A junior engineer writes a data-cleaning script and accidentally executes it against the production training directory instead of the staging directory. The script corrupts the dataset and the latest model checkpoints. The training job crashes. The team asks the infrastructure lead to restore the backup. The infrastructure lead admits they do not run nightly backups because "the dataset is too big to fit over the network."

**The Senior Architect Response:**
"The infrastructure lead has failed to implement basic data resilience because they attempted to apply legacy backup paradigms to hyperscale storage.

It is mathematically true that you cannot perform a full traditional network backup of a 1-Petabyte array every night. However, this does not excuse a lack of data protection. 

The catastrophic loss of the dataset and the training progress could have been entirely prevented by utilizing **Storage-Level Snapshots**. 

High-performance storage arrays (like Weka or modern Lustre implementations) support instantaneous, copy-on-write snapshots. We must immediately configure the storage controller to automatically take a read-only snapshot of the entire namespace every hour. 

Because snapshots only store the delta (the changes in data), they consume negligible space and have zero impact on the massive sequential throughput of the GPUs. 

If this architecture had been in place, when the junior engineer's script corrupted the files, we would not need to restore 1 Petabyte of data over the network. We would simply issue a single API command to the storage controller to revert the namespace to the snapshot taken one hour ago. The corruption would be instantly erased, and the training job could be resumed with only 60 minutes of lost progress."

## Interview Preparation

**Conceptual:** Why is standard daily backup software (like Commvault or Veeam) often incapable of protecting a 10-Petabyte AI data lake? *(Hint: The sheer physics of data transfer. Executing a daily full or even differential backup of 10 Petabytes over standard data center networks takes so long that the backup window would exceed 24 hours. The backup software would also generate massive metadata scanning overhead, bottlenecking the storage array and starving the active AI training jobs).*

**Architecture:** Explain how Object Lock (WORM) on an S3 bucket protects a company from ransomware attacks. *(Hint: Ransomware works by encrypting files and demanding payment for the decryption key. Object Lock (Write Once, Read Many) is an immutable configuration on S3 storage. Once a file (like a critical model checkpoint) is written to the bucket, the cloud provider mathematically prohibits any user, application, or even the root administrator from deleting or modifying that file for a predefined retention period. It completely neutralizes the ransomware's ability to encrypt the backups).*
