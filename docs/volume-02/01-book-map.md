---
title: "Book map"
slug: "book-map"
sidebar_position: 1
description: "Book map — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
**VOLUME 2**

**Python for Production Infrastructure**

From scripting syntax to reliable infrastructure tooling


<!-- source-table:1 -->

> Fourth Edition - Rebuilt as a teaching text, not an annotated checklist


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> How to use this volume Read a chapter as a study block. Run the code. Change it. Break it. When you can explain why the broken version fails, move to the scenario and exercises. The tutor should quiz you only after you have studied the block.


<!-- source-table:3 -->

| Part | What you learn | What you build |
| --- | --- | --- |
| I. Python mental model | references, mutability, execution, functions | small inventory and log tools |
| II. Infrastructure I/O | files, regex, JSON/YAML, environment, subprocess | config reader and diagnostics runner |
| III. Reliability | exceptions, logging, APIs, retries | resilient API client |
| IV. Design | OOP, generators, decorators, typing, concurrency | maintainable automation library |
| V. Quality & delivery | pytest, mocking, packaging, CLI, CI/CD | production-style diagnostic CLI |

➕ **Visual map — the volume grows one operational boundary at a time:**
```
Python model → local data → external I/O → failure handling → concurrent work → tested delivery
     Ch1–3        Ch4       Ch7–8            Ch5–6              Ch11           Ch12–14
```
**Memory hook:** *"Make it correct, make it resilient, then make it operable."* Every later chapter adds a boundary around the code from the earlier one.
