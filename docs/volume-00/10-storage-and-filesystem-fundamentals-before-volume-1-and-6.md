---
title: "10 - Storage and filesystem fundamentals: what you need before Volumes 1 and 6"
slug: "10-storage-and-filesystem-fundamentals-before-volume-1-and-6"
sidebar_position: 10
description: "Storage and filesystem fundamentals: what you need before Volumes 1 and 6 — Foundations Primer."
source_document: "Authored directly for the Foundations Primer — no DOCX source."
---

## What this chapter is, and what it isn't

This chapter will not make you a storage engineer, and it will not teach you how to tune a parallel filesystem — Volume 1's storage chapter and Volume 6's storage-for-AI chapter do that, assuming you already know what a filesystem, a mount, and a block device are. This chapter's only job is to make sure "the disk is full" and "the mount is missing" stop sounding like the same problem, and that when Volume 6 says a training job stalled because "shared storage couldn't keep up," you already know what "shared" is being contrasted against. If you finish this chapter able to explain why a path on disk might secretly depend on a remote server, you're ready for Volume 1 and Volume 6.

## The problem storage exists to solve

A running program keeps its working data in memory (RAM), but memory is erased the moment the machine loses power or the program exits. Anything that needs to survive past that moment — a saved file, a database, a multi-hour training checkpoint — has to live somewhere that persists. That "somewhere" is storage: physical media (a disk, an SSD, a network-attached system) plus the software that organizes data on it so programs can find it again by name instead of by raw physical location.

## What a block device actually is

A **block device** (a storage device that reads and writes data in fixed-size chunks called blocks, rather than one byte at a time) is the raw layer underneath almost everything else in this chapter. Think of it as a giant numbered set of storage bins — block 0, block 1, block 2, and so on — with no concept yet of "files" or "folders." A physical disk or SSD is a block device. So, importantly, is a virtual disk handed to a cloud VM, and so is a remote volume attached over a network — the program using it can't necessarily tell the difference from the block-device interface alone.

**Check your understanding**
- Q: Does a block device know what a "file" is? A: No — a block device is just addressable, fixed-size storage chunks. The concept of files and folders is added by a layer above it (the filesystem), not by the block device itself.

## What a filesystem actually is

A **filesystem** (the software layer that organizes raw blocks into named files and folders, and tracks which blocks belong to which file) is what turns a block device's anonymous numbered bins into something you can navigate with names — `/home/user/report.csv`, `/var/log/syslog`, and so on. Different filesystems (ext4, XFS, and many others) make different trade-offs about how they track this, but the job is the same: keep a map from "this file's name and path" to "these specific blocks on the device," and keep that map correct even after crashes, power loss, and years of files being created and deleted.

```
[ block device: raw numbered chunks ]
              |
              v
[ filesystem: organizes those chunks into named files/folders ]
              |
              v
[ your program opens "/data/report.csv" by name ]
```

**Check your understanding**
- Q: If a filesystem's internal map from names to blocks got corrupted, but the underlying block device itself was perfectly healthy, what would you expect to see? A: Files that seem to be missing, unreadable, or scrambled — even though the physical storage hardware has nothing wrong with it. This is exactly why "the disk is fine" (hardware) and "the filesystem is fine" (the organization on top of it) are two different claims.

## What a mount actually is

A **mount** (the act of attaching a filesystem to a specific point in your directory tree, so that navigating into that directory actually reaches that filesystem's data) is the answer to a question you may not have realized was a question: why does `/` show you one set of files, but `/mnt/backup` might actually be a completely different disk, and `/data/shared` might not be on this machine's disk at all? Every one of those directories could be its own separately mounted filesystem, invisibly stitched into one directory tree. Walking into a directory doesn't tell you, by itself, whether you just stayed on the local disk or silently crossed onto different physical storage — possibly storage on a completely different machine, reached over the network.

**Evidence, not proof, applied here:** running `cd /data/shared` and successfully listing files there does NOT prove that path is on local, fast storage. It only proves the mount is currently working and reachable. It does not tell you whether that path is a local SSD, a remote filesystem shared by many machines, or something in between — and those have very different performance and failure characteristics. You'd need to check what's actually mounted there (a command like `findmnt` or `mount` shows you) before you could make any claim about its speed or reliability.

**Check your understanding**
- Q: You successfully save a file to `/data/shared/output.txt`. Does that prove the file is safe if this machine catches fire? A: No — it only proves the write succeeded from this machine's point of view. Whether the data survives this machine's destruction depends entirely on whether `/data/shared` is actually local disk (in which case: no) or a remote/shared filesystem living on separate hardware (in which case: possibly yes) — a detail the successful write itself doesn't reveal.

## Local disk versus shared/network storage: the distinction that matters most

This is the single most important idea in this chapter, and it's the one Volume 6 spends real time on for AI workloads specifically.

**Local storage** (a disk physically attached to one machine) is fast to reach — no network hop — but it belongs to exactly that machine. If that machine is destroyed, reassigned, or simply restarted as a fresh instance, whatever was only on its local disk can be gone. It's also only reachable by programs running on that one machine.

**Shared or network storage** (storage reachable over a network from more than one machine, appearing at a mount point as if it were local) survives the loss of any one machine that uses it, and lets multiple machines see the same data — which matters enormously the moment you have more than one machine that needs to read the same dataset or write to the same location. The trade-off is that every read and write now depends on the network being up and fast enough, and on a remote server (or a cluster of them) being healthy.

```
Local disk:                  Shared/network storage:
[ Machine A ]--[disk]        [ Machine A ]--\
(only A can see this)                        \--[ network ]--[ shared storage ]
[ Machine B ]--[disk]                        /
(separate, unrelated data)   [ Machine B ]--/
                              (both A and B see the SAME data)
```

Why this matters for AI/HPC specifically, previewed here so Volume 6 doesn't feel like new vocabulary: a training job spread across many machines usually needs every machine to read the same dataset and, especially, needs checkpoints (periodic saves of a model's progress) to land somewhere that survives any single machine failing — which is exactly the shared-storage case, with exactly the network-dependency trade-off just described.

**Check your understanding**
- Q: A training job saves its checkpoint to local disk on the machine doing the training. What's the risk, in plain terms? A: If that specific machine is lost, reassigned, or restarted from scratch, the checkpoint can be lost with it — nothing else in the cluster had access to that local disk in the first place.
- Q: Why does shared storage's dependence on the network matter more as you add more machines? A: Because every one of those machines is now issuing reads/writes over the same network path to the same remote storage; more simultaneous demand on a shared, network-reachable resource means it can become a bottleneck in a way one machine's private local disk never could.

## "The disk is full" can mean several different things

This is a deliberately practical section, because the phrase hides real ambiguity that trips people up in exactly the evidence-vs-proof way this primer keeps warning about. When a program fails with something like "no space left on device," that single symptom can mean:

- The filesystem's actual data blocks are full (the everyday meaning).
- The filesystem's **inodes** are exhausted — an inode is a small metadata record a filesystem creates for every single file or folder to track its ownership, permissions, and block locations; it's possible to run out of these while plenty of raw byte-capacity remains, if a workload creates an enormous number of tiny files.
- The specific mount point you're writing to is actually read-only (perhaps deliberately, perhaps because of an earlier failure), which produces a similar-sounding write error.
- A quota (an administratively imposed limit smaller than the physical capacity) has been hit, even though the underlying device has room.
- The path you think you're writing to isn't actually mounted where you expect — you're writing to a small local directory instead of the large shared mount you intended, because the mount silently isn't there.

**What a single "disk full" error proves:** a write failed. **What it does not prove:** which of the five causes above is responsible — that requires separate, specific checks (capacity, inode count, mount read/write mode, quota, and confirming what's actually mounted where) before you can claim to know the real cause.

**Check your understanding**
- Q: Why might a directory with only a few megabytes of total file content still trigger a "no space left on device" error? A: If the workload created an enormous number of very small files, it can exhaust the filesystem's inode count (the metadata slots for tracking files) well before it exhausts raw byte capacity — the error looks identical to a true capacity problem but has a completely different cause and fix.

## Glossary

- **Block device** — a storage device that reads/writes in fixed-size chunks, with no built-in concept of files or folders.
- **Filesystem** — the software layer that organizes a block device's chunks into named files and folders.
- **Mount** — attaching a filesystem to a specific point in the directory tree, so navigating there reaches that filesystem's data.
- **Local storage** — a disk physically attached to, and only reachable by, one machine.
- **Shared/network storage** — storage reachable over a network from more than one machine, appearing as if local at its mount point.
- **Inode** — a filesystem's metadata record for one file or folder (ownership, permissions, block locations); a separate, exhaustible resource from raw byte capacity.
- **Quota** — an administratively imposed storage limit smaller than the device's physical capacity.

## You're ready for Volume 1 and Volume 6 when you can...

- Explain the difference between a block device and a filesystem, in your own words.
- Explain why successfully reading or writing a path does not, by itself, prove where that data actually lives.
- Explain the local-versus-shared storage trade-off, and why AI training jobs across multiple machines usually need the shared side of it despite the network dependency it creates.
- List at least three genuinely different causes of a "disk full" style error, and say what you'd check to tell them apart.

**Continue to:** [Volume 1, Chapter 3 — Files, file descriptors, filesystems and block I/O](/curriculum/volume-01/chapter-3-files-file-descriptors-filesystems-and-block-i-o) or [Volume 6, Chapter 6 — Storage for AI: datasets, checkpoints and model distribution](/curriculum/volume-06/chapter-6-storage-for-ai-datasets-checkpoints-and-model-distribution) *(quick-reference companion: [Systems foundation](/curriculum/intro/systems-foundation))*
