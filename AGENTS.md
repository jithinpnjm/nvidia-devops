# AGENTS.md — NVIDIA Zero to Hero Bootcamp

## Mission
Build a production-grade, architecture-first NVIDIA AI Infrastructure bootcamp for experienced DevOps, SRE, Platform, Cloud, Infrastructure, and MLOps engineers.

This is not an interview dump, certification cram guide, vendor rewrite, or collection of short notes.

## Mandatory Reading Order
Before modifying content, read:
1. `00_PROJECT_CHARTER.md`
2. `01_CONTENT_SPECIFICATION.md`
3. `02_ROADMAP.md`
4. `03_CONTRIBUTING_AI.md`
5. `04_EDITORIAL_GUIDE.md`
6. `05_ARCHITECTURE_PRINCIPLES.md`
7. `06_LAB_STANDARD.md`
8. `07_DIAGRAM_STANDARD.md`
9. The target volume introduction
10. Assigned files in full
11. Adjacent chapters needed to prevent duplication

Locate these files if their paths differ.

## Current-State Rule
Do not trust old chats, ledgers, PR numbers, or stale branch descriptions as repository truth. Inspect the live repository and GitHub state first.

Owner-confirmed fact:
- Volume 09 is complete.

Verify all other volume states from the repository.

## Teaching Order
WHY → WHAT → HOW → WHEN → TRADE-OFFS → PRODUCTION → TROUBLESHOOTING

Do not begin with commands or product definitions.

## Chapter Standard
A publication-ready chapter normally includes:
- front matter;
- problem-focused introduction;
- realistic production story;
- measurable learning objectives;
- prerequisites, difficulty, and reading time;
- big-picture architecture diagram;
- first-principles explanation;
- internal working and data flow;
- component responsibilities;
- relevant protocols, algorithms, hardware, software, firmware, or scheduling;
- performance, scale, availability, security, reliability, observability, cost, maintainability, and operational complexity;
- production deployment patterns;
- substantial troubleshooting scenarios;
- customer architecture discussion;
- senior-level interview questions;
- summary and revision material;
- cross-references;
- authoritative further reading.

Reject outline-like, repetitive, generic, or template-driven prose.

## Lab Standard
Every lab must contain all 18 sections in `06_LAB_STANDARD.md`.

Every command needs:
- purpose;
- command;
- expected evidence;
- explanation;
- common-failure interpretation.

Illustrative output must be labeled. Failure injection must be safe, scoped, reversible, and paired with verified cleanup.

## Accuracy
Never invent specifications, support matrices, performance numbers, limits, command output, compatibility, product behavior, or benchmark results.

Use primary sources: official NVIDIA documentation, official upstream docs, standards, specifications, release notes, and papers.

## Editorial Style
Write like an NVIDIA Principal Solutions Architect teaching another experienced engineer.

Use American English, direct sentences, short paragraphs, diagrams, comparison tables, production stories, and explicit trade-offs.

Avoid marketing language, Wikipedia-style openings, bullet dumps, generic conclusions, and duplicated explanations.

## Git Rules
- One integration branch per volume.
- Parallel agents own non-overlapping files.
- Do not merge directly into `main`.
- Preserve filenames and routes unless migration is approved.
- Keep broken-link validation enabled.
- Run `npm ci` and `npm run check`.
- Inspect GitHub Actions failures directly.
- Never merge without explicit owner approval.

## Required Handoff
Every writing agent reports:
- exact paths changed;
- line counts;
- branch;
- commit SHA;
- cross-references added;
- claims verified;
- assumptions;
- unresolved questions;
- reviewer risks;
- hardware-only commands.

## Definition of Done
A volume is complete only when introduction, chapters, labs, metadata, terminology, links, Mermaid, technical review, editorial review, integration review, `npm run check`, and GitHub Actions all pass, and the PR is ready for review. No merge without owner approval.
