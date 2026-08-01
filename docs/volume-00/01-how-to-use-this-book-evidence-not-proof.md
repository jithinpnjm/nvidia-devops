---
title: "1 - How to use this book: evidence, not proof"
slug: "1-how-to-use-this-book-evidence-not-proof"
sidebar_position: 1
description: "How to use this book: evidence, not proof — Foundations Primer."
source_document: "Authored directly for the Foundations Primer — no DOCX source."
---

## Why this site exists

This site is study material for a senior-level DevOps / AI-infrastructure / GPU interview — the kind where you're expected to reason about Kubernetes internals, Linux internals, networking, and NVIDIA/GPU-specific systems under pressure, out loud, in front of someone who will ask "how do you know that?" after almost everything you say.

Volumes 1 through 10 of this site are that deep material. They are written for a senior engineer and they move fast: they assume you already have a working mental model of Linux, networking, and basic system administration, and they spend their time on the harder, interview-specific layer on top of that.

This chapter, and the two after it, are different. They are **Volume 0: the Foundations Primer**. If you are a senior software or DevOps engineer but a genuine beginner in Linux internals, GPU/NVIDIA technology, AI/ML, or HPC specifically, Volumes 1-10 will use terms before you have a stable picture of what they mean, and that is disorienting even for someone very experienced in other areas. Volume 0 exists to build that stable picture first, so that when Volume 1 says "check the process's file descriptor table," you already know what a process is and what a file descriptor is, and you can focus on the actually-hard interview content instead of also silently trying to reverse-engineer vocabulary.

Volume 0 will not make you an expert. Its only job is to hand you the vocabulary and the basic shape of each idea so that Volumes 1-10 read as a deep dive instead of a wall of unfamiliar terms.

## The one habit that matters more than any command

Before any Linux, networking, or GPU content, there is a single habit this entire book depends on, and it's the thing experienced engineers most often skip under interview pressure: **a command's output is evidence toward a hypothesis, not proof of a root cause.**

That sentence is short enough to nod along to and move past. Don't — this is the actual skill being tested in most "debug this" interview questions, and it's easy to fail without realizing it.

### A worked example: "the website feels slow"

Imagine you're told: users are complaining the website feels slow. You want to find out why.

**Step 1 — you check one metric.** You run a command that shows CPU usage on the web server and see it pegged at 95%. It's tempting to stop right there and say "found it — CPU is maxed out, that's why it's slow."

**Why that one number is evidence, not proof.** High CPU usage tells you the CPU is busy. It does not tell you:
- *why* it's busy (serving real user traffic? a runaway background job? a misconfigured retry loop hammering an API?)
- whether the CPU being busy is actually what users are experiencing as slowness (maybe requests are fast on-CPU but stuck waiting on a slow database, and the CPU number you saw is unrelated background noise)
- whether 95% is even abnormal for this system (maybe it always runs at 90%+ and that's fine)

If you claimed "root cause: CPU" and stopped, you'd be pattern-matching a familiar-looking number to a familiar-sounding cause, without checking whether it actually explains the symptom.

**Step 2 — a second piece of evidence.** You look at what's actually consuming that CPU — say, a process list sorted by CPU use — and see one process using almost all of it, and that process is a batch report job, not the web server itself. Now you have two pieces of evidence that agree with each other: high CPU, and a specific non-web-serving process causing it. That's stronger, but still not proof — it's possible the batch job has always run at this time and is unrelated to the timing of the complaints.

**Step 3 — a third piece of evidence.** You check *when* the batch job started and *when* the slowness complaints started, and they line up in time. You also confirm that web requests during this window show longer response times specifically while the batch job is running, and return to normal after it finishes. Now you have three independent, mutually consistent pieces of evidence: a resource signal (CPU), an attribution signal (which process), and a timing/correlation signal (complaints track the job's runtime). That combination is what lets you say, with real confidence, "the batch job is starving the web server of CPU" — and even then, the rigorous phrasing is "this is consistent with X, and I haven't found evidence against it," not "this is definitely X."

Notice what changed between step 1 and step 3: not the confidence in your voice, but the number and independence of things you checked, and specifically whether you tried to find evidence *against* your leading theory, not just evidence that felt consistent with it.

### The failure mode this fixes

The specific mistake this habit prevents is: seeing a familiar-looking log line, error code, or number, and jumping straight to the cause it usually means for you, without checking whether the current evidence actually rules out the other things it could also mean. Every experienced engineer has a mental library of "when I see X, it's usually Y" — that library is genuinely useful for generating hypotheses fast, but it is a source of hypotheses, not a verdict. The output you're looking at almost always has more than one possible explanation; your job is to narrow that set with more evidence, not to stop at the first explanation that feels familiar.

You will see this theme called out explicitly and repeatedly through Volumes 1-10 as "evidence vs. proof" — this chapter is where that phrase gets its full explanation so later chapters can use it as shorthand.

### Check your understanding

**Q1: A colleague sees a database CPU spike and immediately says "found it, that's the slow query." What's wrong with stopping there, even if they turn out to be right?**
A: Being right by luck doesn't validate the method. A CPU spike is evidence that the database is busy; it doesn't by itself identify *which* query, whether that query is actually on the path users are experiencing as slow, or whether the timing lines up with when the slowness was reported. Without those additional checks, "found it" is a guess dressed up as a conclusion — and next time the guess may be wrong.

**Q2: What's the difference between a hypothesis and a root cause, in this book's vocabulary?**
A: A hypothesis is a candidate explanation you haven't yet ruled competitors out for. A root cause is a hypothesis that has survived deliberate attempts to disprove it, supported by multiple independent, consistent pieces of evidence — not just the first plausible story.

**Q3: Why is "I haven't found evidence against it" more rigorous phrasing than "this is definitely the cause"?**
A: Because it's honest about the limits of what you checked. It signals you actively looked for disconfirming evidence (and didn't find any), rather than simply stopping once you found something confirming — which is the exact bias this chapter is warning against.

## How to read every chapter in this book

Every chapter in Volume 0 (and, where it says so, in Volumes 1-10) follows the same shape, so you always know what to expect:

- **Terms are defined before they're used.** If a term must appear before its formal definition (sometimes unavoidable in flowing prose), it will immediately get a plain-language gloss in parentheses right there.
- **A plain-language model comes before any command.** You'll always get "here's the problem this solves, and here's the shape of the idea" before you see a command that touches it.
- **Commands are evidence you interpret, not answers you memorize.** When a chapter shows a command's output, it will also tell you explicitly what that output does and does not prove — the same habit you just practiced above, applied consistently.
- **Every chapter ends with a glossary and a readiness checklist.** The glossary lists every new term from that chapter in one sentence each. The checklist tells you, concretely, what you should be able to do before moving into the corresponding advanced volume — so you always know when you're ready to move on, instead of guessing.

## Glossary

- **Evidence** — a single observation (a command's output, a metric, a log line) that is consistent with one or more possible explanations, but does not by itself confirm any one of them.
- **Proof / root cause** — an explanation supported by multiple independent, mutually consistent pieces of evidence, including a deliberate attempt to find evidence against it.
- **Hypothesis** — a candidate explanation for an observed symptom, proposed before it has been tested against further evidence.
- **Pattern-matching (as a failure mode)** — jumping from a familiar-looking symptom straight to its most common cause, without checking whether the current evidence actually rules out other explanations.

## You're ready for Volume 1 when you can...

- Explain, in your own words, the difference between evidence and proof.
- Take any single command's output and state out loud what it does prove, what it does not prove, and what you'd check next.
- Recognize, in your own past debugging, at least one moment where you stopped at "familiar-looking" instead of "confirmed."
- Read a Volume 1 chapter and notice when it's presenting something as evidence versus treating it as settled.

**Continue to:** [Volume 1, Chapter 1 — Processes, threads, CPU scheduling and load](/curriculum/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load)
