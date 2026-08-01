---
title: "2 - Linux fundamentals: what you need before Volume 1"
slug: "2-linux-fundamentals-before-volume-1"
sidebar_position: 2
description: "Linux fundamentals: what you need before Volume 1 — Foundations Primer."
source_document: "Authored directly for the Foundations Primer — no DOCX source."
---

This chapter will not make you a Linux expert. Its only job is to give you the vocabulary and mental models that Volume 1 ("Foundations Beneath Kubernetes") assumes you already have, so you can read that volume's internals-level content without getting stuck decoding basic terms mid-paragraph. If a term below already feels obvious to you, skim it and move on — but read the sections that don't.

## What a kernel actually does

**The problem.** Every program that wants to do anything useful — read a file, send network data, use memory, talk to a GPU — ultimately needs to touch physical hardware. If every program had to know the exact electrical details of every disk, network card, and CPU model it might run on, we'd need a different version of every program for every hardware combination, and two programs touching the same hardware at once would corrupt each other's work.

**The concept.** The **kernel** is the piece of software that sits between programs and hardware and mediates that access: programs ask the kernel to do things (read this file, send this network packet, give me some memory), and the kernel is the only thing that actually talks to the hardware. This is directly analogous to a database engine sitting between your application code and the raw disk blocks — your application never seeks to a byte offset on disk itself; it asks the database, and the database enforces rules (locking, consistency, permissions) on the way to the hardware. The kernel is that same kind of mediator, but for an entire computer instead of just data storage.

**The shape of it.** "Linux" as a name really refers to this kernel. Everything else you associate with a Linux system — the shell, command-line tools, package managers — is software that *runs on top of* the kernel and asks it to do things on their behalf.

**Why it matters for Volume 1.** Volume 1 talks about things like scheduling, cgroups, and namespaces — all of these are kernel mechanisms for controlling *how* programs get access to hardware (CPU time, memory, isolation from each other). None of that will make sense unless "the kernel mediates hardware access" is already a settled idea in your head.

### Check your understanding

**Q1: If a kernel crashes, why does everything on the machine stop, not just one program?**
A: Because every program depends on the kernel to reach hardware at all — memory, disk, network. Without it, no program can do anything, the same way no application can do anything useful if the database engine it depends on goes down mid-operation.

**Q2: What's the software-engineering analogy used above, and where does it break down?**
A: A database engine mediating between application code and raw disk blocks. It breaks down in scope — a database mediates one resource (data on disk); the kernel mediates *all* hardware resources (CPU, memory, disk, network, devices) for every program on the machine, not just one.

## What a process actually is

**The problem.** A program sitting on disk (say, a compiled binary or a script) is just static data — instructions and data waiting to be read. But when you actually run it, something needs to track: which instruction is executing right now, what memory this specific run is using, and how this running instance is different from another run of the very same program started a second later.

**The concept.** A **process** is a running instance of a program: it has its own private memory, its own identity (a process ID, or PID), and its own execution state, separate from the program file on disk and separate from any other running instance of that same program. This is the same relationship as a class versus an object in object-oriented programming: the program on disk is like the class definition (static, one copy), and each process is like an object instantiated from it (its own state, its own identity, and you can have many of them running from the same class at once).

**The shape of it.** The kernel creates a process when a program is launched, gives it a PID, tracks its state (is it actively running on a CPU right now, waiting for something, or finished), and cleans up its resources when it exits.

**A first real example.** If you run the same command twice in two terminal windows, you get two processes, each with a different PID, each with its own memory — even though they started from the identical program file.

### Check your understanding

**Q1: If you run the same script three times at once, how many processes exist, and what's shared between them versus separate?**
A: Three processes. The program file on disk is shared (all three read the same instructions); each process's memory, PID, and execution state are separate.

**Q2: Why isn't "the program" and "the process" the same thing?**
A: The program is static data on disk — one copy, not running. A process is a live, running instance with its own identity and memory; there can be zero, one, or many processes for a single program at any moment.

## Files, file descriptors, and "everything is a file"

**The problem.** A running process needs some consistent way to read and write data — whether that data lives in a file on disk, is coming from your keyboard, is going to your screen, or is flowing over a network connection. If each of those needed a completely different set of operations, every program would need special-case code for every kind of data source.

**The concept.** Linux's answer is to make nearly everything — disk files, directories, keyboard input, terminal output, network connections, even hardware devices — accessible through the same small set of operations (open, read, write, close), organized as a single tree of **files**, starting at a root directory (`/`) and branching into subdirectories. This is a genuine design decision, not a marketing slogan: it means one uniform interface works for wildly different underlying things, the way a well-designed API might expose "read bytes" and "write bytes" as its only two verbs regardless of whether the backing store is a local disk, cloud storage, or an in-memory buffer.

When a process opens one of these files, the kernel hands it a small number called a **file descriptor** — think of it as a claim ticket or a table index: the process gives the kernel that number on future read/write calls, and the kernel looks up what it actually points to. It is very similar to a database connection handle in application code: your code doesn't manipulate the raw TCP socket to the database directly, it holds a handle (a number/reference) and passes that handle to future calls.

**The shape of it.** Every process starts with three file descriptors already open by convention: standard input (keyboard, typically descriptor 0), standard output (screen, descriptor 1), and standard error (also normally the screen, descriptor 2). Everything else a process opens — real files, network sockets — gets the next available descriptor number.

**Why it matters for Volume 1 and Volume 10.** Volume 1 discusses inspecting a process's open file descriptors as a diagnostic technique, and Volume 10's security material discusses file permissions — both assume you already know a file descriptor is "a process's handle to something it opened," not a mysterious internal detail.

### Check your understanding

**Q1: Why can the same small set of operations (open, read, write, close) work for both a disk file and a network connection?**
A: Because Linux deliberately represents both as "files" behind a uniform interface — the design choice is to hide the differences in the underlying thing behind one consistent set of verbs, similar to an API that exposes the same read/write calls regardless of backing store.

**Q2: What does a file descriptor actually hold — the data itself, or something else?**
A: Something else — it's a small number the process uses as a reference/claim-ticket. The kernel maps that number to the actual open file, socket, or device on the process's behalf.

## Permissions and ownership, at a basic level

**The problem.** On a machine used by more than one person, or running more than one service, you need a way to say "this user can read this file, but not that one," without one user's programs being able to freely read, change, or delete another's data.

**The concept.** Every file has an **owner** (a specific user) and an associated **group** (a set of users), and three categories of access are tracked separately for each: the owner, the group, and everyone else ("other"). For each of those three categories, three permissions can be granted independently: **read** (view contents), **write** (modify contents), and **execute** (run it as a program, or enter it if it's a directory). This is directly analogous to access-control lists you've likely configured on a cloud storage bucket or an API resource: a resource has an owner, and different principals get different allowed actions.

**The shape of it.** You'll commonly see this summarized as a compact string like `rwxr-xr--` — read it in three groups of three: owner permissions, group permissions, other permissions. `rwx` for owner means the owner can read, write, and execute; `r-x` for group means the group can read and execute but not write; `r--` for other means everyone else can only read.

**Why it matters for Volume 10.** Volume 10's security chapter builds directly on this — things like "why a container shouldn't run as root" or "why a world-writable file is a red flag" only make sense once owner/group/other and read/write/execute are already solid.

### Check your understanding

**Q1: A file shows permissions `rw-r--r--`. Can a user who is neither the owner nor in the file's group modify it?**
A: No. The "other" category (last three characters) is `r--` — read only, no write, no execute — for anyone who isn't the owner or in the group.

**Q2: Why are read, write, and execute tracked as three separate bits instead of one "access" flag?**
A: Because the three kinds of access are genuinely independent needs — you might want someone to read a config file without being able to change it, or run a script without being able to view or edit its contents. Separate flags let you grant exactly what's needed.

## What a shell actually is

**The problem.** The kernel doesn't have a conversational interface — it exposes low-level operations, not something you type commands into directly. Something needs to sit between a human typing text and the kernel carrying out requests.

**The concept.** A **shell** is an ordinary program — not part of the kernel — whose job is to read commands you type, figure out what they mean, and ask the kernel to do the corresponding work (like starting a new process, or opening a file). This is worth stating plainly because it's a common point of confusion: the shell is a program, not the operating system itself; you could replace it with a different shell program and the kernel underneath wouldn't change at all.

**The shape of it.** You type a command, the shell parses it, and typically the shell asks the kernel to start a new process to actually run that command (the earlier "process" concept in action).

**The absolute minimum command vocabulary.** These are shown here just so the words are familiar — Volume 1 is where you'll learn to actually treat their output as evidence to investigate with, per Chapter 1's evidence-vs-proof habit.

- `ls` — lists the contents of a directory.
- `cd` — changes which directory the shell currently considers "here."
- `cat` — prints a file's contents to the screen.
- `ps` — lists currently running processes.
- `top` — shows a live, continuously updating view of running processes and resource usage.

### Check your understanding

**Q1: If the shell is "just a program," what actually starts a new process when you type a command and press enter?**
A: The shell asks the kernel to start it — the shell itself doesn't have the power to create processes on its own; that's a kernel operation the shell requests on your behalf.

**Q2: Could you have two different shell programs installed and switch between them? Would the kernel change?**
A: Yes to switching, no to the kernel changing. The shell is a replaceable layer on top of the kernel; swapping shells changes how you type commands, not what the kernel underneath is doing.

## What a package manager does

**The problem.** Installing software by hand means finding the right files, putting them in the right places, and separately tracking every other piece of software it depends on to run — and doing all of that again, correctly, every time you update or remove it.

**The concept.** A **package manager** is a tool that installs, updates, and removes software for you, while automatically tracking what each piece of software depends on, so those dependencies get installed too (and aren't removed while something still needs them). Conceptually, this is the same problem a language-level dependency manager (like npm or pip) solves for a single project's libraries — a Linux package manager does the equivalent job for software installed on the whole machine.

**The shape of it.** You tell the package manager what you want installed; it consults a catalog of available software and their declared dependencies, resolves what actually needs to be fetched, and installs all of it in a consistent state.

We're intentionally not naming specific package manager commands here — that's operational detail Volume 1 will ground in real examples once the underlying model (dependency tracking, consistent installed state) is already familiar.

### Check your understanding

**Q1: Why is "installs software" an incomplete description of what a package manager does?**
A: Because the harder and more valuable part is dependency tracking — making sure everything that piece of software needs is also present, compatible, and not removed out from under it later.

**Q2: What's the closest thing you've already used that solves a similar problem, just at a different scope?**
A: A language-level dependency manager such as npm or pip — same core problem (track and install dependencies consistently), different scope (one project's libraries vs. the whole machine's installed software).

## Glossary

- **Kernel** — the software that mediates all access to hardware so other programs don't touch hardware directly.
- **Process** — a running instance of a program, with its own memory, identity (PID), and execution state.
- **PID** — the numeric identity the kernel assigns to a process.
- **File** — in Linux, a uniform abstraction covering disk files, directories, devices, and more, all accessed through the same basic operations.
- **File descriptor** — a small number a process uses as a reference to something it has opened (a file, socket, or device); the kernel maps it to the real thing.
- **Owner / group / other** — the three categories of access control tracked on every file: the specific owning user, an associated group of users, and everyone else.
- **Read / write / execute** — the three independently-grantable permissions on a file: view contents, modify contents, run as a program (or enter, for a directory).
- **Shell** — an ordinary program that reads typed commands and asks the kernel to carry out the corresponding work; not part of the kernel itself.
- **Package manager** — a tool that installs, updates, and removes software while tracking its dependencies automatically.

## You're ready for Volume 1 when you can...

- Explain what a kernel mediates, and why programs don't talk to hardware directly.
- Explain the difference between a program on disk and a running process, using the class/object analogy or your own equivalent.
- Explain what a file descriptor actually is (a reference/handle, not the data itself).
- Read a permission string like `rwxr-xr--` and state exactly what owner, group, and other can each do.
- Explain why the shell is a program and not the kernel.
- State, in one sentence, what problem a package manager solves beyond "installing files."

**Continue to:** [Volume 1, Chapter 1 — Processes, threads, CPU scheduling and load](/curriculum/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load)
