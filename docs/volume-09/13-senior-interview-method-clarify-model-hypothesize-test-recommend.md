---
title: "Senior Interview Method — Clarify, model, hypothesize, test, recommend"
slug: "senior-interview-method-clarify-model-hypothesize-test-recommend"
sidebar_position: 13
description: "Senior Interview Method — Clarify, model, hypothesize, test, recommend — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
For troubleshooting questions, do not enumerate random commands. Clarify scope and recent changes; draw the relevant data path; rank hypotheses; name the evidence that separates them; choose a safe mitigation; validate the original symptom; then discuss prevention. For architecture questions, replace hypotheses with requirements and options, but keep the evidence-led structure.

![](pathname:///img/generated/volume-09-03.png)

_Figure B. When a GPU workload is slow, descend the stack systematically until evidence explains the symptom._

## ➕ Additions

➕ **Diagram: the full Clarify-Model-Hypothesize-Test-Recommend chain (the seven moves in this method's name, expanded):**
```mermaid
flowchart TD
    Q[Question lands]
    C[CLARIFY scope + recent changes]
    M["MODEL - draw/state the relevant data path out loud"]
    H["HYPOTHESIZE - rank 2-3 candidate causes (troubleshooting) or requirements + options (architecture)"]
    E["name the EVIDENCE that distinguishes the top candidates"]
    Mit["choose a safe MITIGATION (never 'just restart it' unexplained)"]
    T["TEST / VALIDATE - confirm the original symptom actually resolved"]
    P["discuss PREVENTION - what stops this recurring"]

    Q --> C --> M --> H --> E --> Mit --> T --> P
```
The name "Clarify, model, hypothesize, test, recommend" compresses two of these seven moves each into "test" (mitigate + validate) and "recommend" (evidence-led choice + prevention) — say all seven out loud in an interview even though the method's name only lists five words.
