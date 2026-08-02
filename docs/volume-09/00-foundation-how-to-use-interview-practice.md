---
title: "Foundation — how to use interview practice without memorizing answers"
slug: "foundation-interview-practice"
sidebar_position: 0
description: "A beginner-safe orientation to technical interviews, question banks and evidence-led answers."
source_document: "Authored directly as the Volume 9 foundation chapter."
---

# Foundation — how to use interview practice without memorizing answers

## What this volume is trying to teach

Interview practice should reveal whether you can transfer knowledge into reasoning and communication. It should not be your first exposure to Linux, Python, Kubernetes, GPU, AI or HPC concepts. Question banks compress context by design; use them after the matching core material.

## The first mental model

A strong technical answer usually has this shape:

1. clarify scope, objective and constraints;
2. state a simple normal-path model;
3. identify important boundaries or options;
4. choose evidence or comparison criteria;
5. recommend a safe action or design;
6. validate the original outcome;
7. mention risk, rollback and prevention when relevant.

This is not a script to recite. It is a thinking discipline that keeps answers connected to the question.

## Different questions test different skills

| Question type | What it tests |
|---|---|
| Foundation | Can you explain the mechanism accurately and plainly? |
| Coding | Can you turn requirements into readable, testable behavior? |
| Troubleshooting | Can you reduce uncertainty with ordered evidence? |
| Architecture | Can you discover requirements and compare trade-offs? |
| Customer scenario | Can you adapt depth, influence and communicate risk? |
| Behavioral | Can you show ownership and measurable impact from real experience? |

## What to do when a topic is new

Do not memorize the provided answer points. Mark the unknown nouns, return to the foundation/core chapter, draw the normal path, run or study one observation, and then answer in your own words. If you cannot explain why a command separates two hypotheses, the command is not yet part of your reasoning.

## A practical study loop

Choose one question. Answer aloud for two minutes. Review for undefined jargon, missing normal path, random command lists and unsupported conclusions. Study the exposed gap. Answer again without reading notes. Then add one follow-up involving scale, failure or customer trade-offs.

## Example: turn a weak troubleshooting answer into reasoning

Question: "A GPU workload is slow. What do you check?"

Weak answer:

> I check `nvidia-smi`, Kubernetes logs and restart the Pod.

Why it is weak: no scope, no workload outcome, random layers, and a mutation before evidence.

Stronger structure:

1. Clarify whether this is training or inference and define "slow" as step time, tokens/s, TTFT or another metric.
2. Scope to model/version, nodes, replicas, time and recent changes.
3. Draw the path: request/data → CPU/framework → GPU → communication/storage → output.
4. Compare application outcome and per-stage timing with a known-good baseline.
5. Use GPU/host/network/storage evidence only for affected scope.
6. Rank hypotheses and name the observation separating each pair.
7. Choose a reversible mitigation, preserve evidence and validate the original metric.

The stronger answer does not need every command. It shows you know what each command would prove.

## Example: architecture answer

Question: "Design an LLM inference platform."

Start with discovery:

- model sizes/precisions and number of models;
- prompt/output distributions;
- concurrency and arrival pattern;
- TTFT, inter-token, total latency and availability objectives;
- data sensitivity, tenancy and residency;
- current platform skills and deployment environment;
- cost/growth and failure-recovery needs.

Then draw request, model artifact, control, trust and observability paths. Compare feasible engines/platform patterns using benchmarks and operating trade-offs. End with a recommended first design and a PoC that tests capacity, latency, failure and operability.

## Coding practice should expose the thought process

For a Python log-aggregation task:

1. restate input/output and malformed-input behavior;
2. show a small example manually;
3. choose dictionary/Counter because lookup/aggregation is the operation;
4. implement pure parsing and aggregation first;
5. test empty, malformed and duplicate cases;
6. discuss streaming, memory and I/O only after correctness;
7. add CLI/logging/exit behavior if asked for productionization.

Do not jump to classes or concurrency to appear senior.

## Self-scoring rubric

Score each answer 0–2:

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Clarity | jargon/list | partial structure | plain mechanism and explicit conclusion |
| Scope | none | some assumptions | objective, constraints and affected boundary clear |
| Technical model | incorrect/absent | incomplete | normal path and ownership accurate |
| Evidence | random commands | some relevant checks | observations discriminate hypotheses |
| Safety | destructive first | mitigation mentioned | blast radius, rollback and validation explicit |
| Senior judgment | product answer | trade-off named | options tied to requirements and uncertainty |

A low score routes you back to a specific learning action. It is not solved by rehearsing the same words faster.

## Four-pass mock-interview progression

1. **Open book:** explain using diagrams and notes.
2. **Closed book:** reproduce the normal path and core answer.
3. **Adversarial follow-up:** handle scale, failure, security or conflicting requirements.
4. **Timed simulation:** concise answer with a clear recommendation and invitation to deepen.

Record yourself. Remove acronyms you cannot define, claims without evidence and background that does not affect the decision.

## Readiness check

Begin mock interviews only after you can explain the underlying topics to a curious engineer, not only to an interviewer. Being able to say "I have not used that exact product, but here is how I would model and validate it" is stronger than inventing certainty.
