# Prompt for Codex — paste this as-is

I need you to fix a content-duplication regression across this Docusaurus study site (NVIDIA Senior Solutions Architect / DevOps interview prep, JR2018680). Read this whole prompt before touching anything — it explains the history, the exact problem, a linking system you must not break, and the file-by-file work required.

## Background you need

This site has 10 volumes (`docs/volume-01/` .. `docs/volume-10/`) plus `docs/intro/`. An earlier pass added a `## Foundations: start here if this is new to you` section to the TOP of each volume's opening chapter — concept-from-zero teaching (plain-language definitions before jargon, concrete analogies, worked "evidence vs. proof" examples, "Check your understanding" Q&A with immediate answers, a glossary, a readiness checklist) that flows directly into the chapter's existing advanced content on the same page. This was done specifically because a reviewer said having foundation content in a separate place from advanced content broke their reading flow — "I lose the flow" — so the fix was: one topic, one page, foundation first.

Separately, another pass (also AI-assisted) added a NEW standalone chapter to every volume, sitting right before Chapter 1 (e.g. `docs/volume-04/00-foundation-what-gpu-computing-is.md`), which independently teaches nearly the same foundational material. There was also a completed, good-quality pass converting every remaining ASCII box-drawing diagram in the whole site to real Mermaid diagrams (`​```mermaid` fenced blocks) — that work is done and correct; do not touch or revert any Mermaid diagram.

**The result: every volume now teaches its foundational concept TWICE in a row** — once in the new standalone chapter, then again at the top of Chapter 1. This reintroduces the exact "foundation separate from advanced, I lose the flow" problem, except now duplicated. Your job is to merge these into one deduplicated version per topic and delete the standalone files, while preserving everything genuinely valuable from both sources.

## A linking system you must update, not just leave broken

`src/components/learning/ChapterFoundationBridge.tsx` renders a small "prerequisite compass" banner on every non-foundation chapter page (wired in via `src/theme/DocItem/Layout/index.tsx`). Its `volumeFoundations` map (and a special-cased volume-10 IaC branch) contains hardcoded links to the standalone foundation pages you're about to delete, e.g.:

```ts
'volume-04': {to: '/curriculum/volume-04/foundation-what-gpu-computing-is', label: 'Study GPU computing from first principles'},
```

After you merge and delete a standalone file, you MUST update its corresponding entry in `volumeFoundations` (and the volume-10 IaC special case matching `/ansible|terraform|infrastructure.as.code|ci\/cd/i`) in `src/components/learning/ChapterFoundationBridge.tsx` to point at the merged chapter instead, using a heading anchor, e.g. `/curriculum/volume-04/chapter-1-gpu-execution-and-memory-mental-model#foundations-start-here-if-gpu-cuda-concepts-are-new-to-you` (Docusaurus auto-generates the anchor slug from the heading text — check the actual heading text you end up with in each merged file and match the anchor exactly, don't guess).

Also check `src/data/chapterStudyContexts.ts` — it has entries keyed by chapter title (e.g. `"Foundation — what Linux is and how to study a running system": {...}`) for each standalone foundation page you're deleting. Remove those now-orphaned entries. Do NOT touch the entries for the actual chapter titles (e.g. `"Chapter 1 - Processes, threads, CPU scheduling and load"`) — those already correctly list `"Foundations: start here if this is new to you"` as one of their `sections`, which is what makes `ChapterFoundationBridge`'s `alreadyCovered` check correctly suppress the compass banner on chapter-1 pages themselves. If your merge changes a chapter's Foundations heading text, update the matching `sections` entry in `chapterStudyContexts.ts` to match, or the suppression check will silently break and the compass will start showing on chapter-1 pages pointing at themselves.

## The exact merge work, volume by volume

For every pair below: read the standalone file FULLY and read the target chapter's existing content FULLY (including its current `## Foundations` section where one exists) before writing anything.

**Deduplication rule (the core skill this task requires):** where both sources explain the *same* concept, do not concatenate both explanations — pick whichever is clearer/more concrete and drop the redundant one. Where the standalone file has genuinely NEW material the existing section lacks (a worked incident, an evidence-gathering checklist/ladder, a "common misconceptions" list, official reference links, a concrete worked calculation, extra lab/exercise steps), fold that in as a new, clearly-titled subsection in a sensible position (problem → concept → example → misconceptions → evidence practice → wrap-up), not dumped unorganized at the end. Keep analogies, "Check your understanding" blocks, and glossaries from whichever source has them — merge two glossaries by union, never duplicate an identical term.

After merging into the chapter, delete the standalone file(s) with `rm`. Every runnable code snippet in your merged result must be correct — trace it by hand, this is a code-adjacent teaching site and wrong output in an example is a real defect.

### Volumes with true duplication (chapter already has a `## Foundations` section — merge and dedupe)

1. **Volume 1** — merge `docs/volume-01/00-foundation-before-linux-internals.md` into `docs/volume-01/01-chapter-1-processes-threads-cpu-scheduling-and-load.md`'s existing Foundations section.
2. **Volume 2** — merge `docs/volume-02/00-foundation-what-python-is.md` into `docs/volume-02/02-chapter-1-how-python-actually-executes-your-infrastructure-script.md`'s existing Foundations section. Also handle `docs/volume-02/00b-python-constructs-imports-and-project-layout.md` (covers decorators, dataclasses, imports/modules/packages): use judgment — basic import/module concepts likely belong in Chapter 1's Foundations; decorator-specific material may be more relevant to `docs/volume-02/11-chapter-10-generators-and-decorators-without-magic.md` (which already has its own Foundations section covering decorators — check for overlap and dedupe there too, don't just add a second decorator explanation); packaging-specific material may belong in `docs/volume-02/14-chapter-13-project-structure-cli-and-ci-cd.md` (also already has a Foundations section). Place each piece where it doesn't duplicate what's already there, then delete `00b`.
3. **Volume 3** — merge `docs/volume-03/00-foundation-what-kubernetes-is.md` into `docs/volume-03/01-chapter-1-api-server-etcd-and-the-object-model.md`'s existing Foundations section.
4. **Volume 4** — merge `docs/volume-04/00-foundation-what-gpu-computing-is.md` AND `docs/volume-04/00b-nvidia-ecosystem-map-for-beginners.md` into `docs/volume-04/01-chapter-1-gpu-execution-and-memory-mental-model.md`'s existing Foundations section. The ecosystem-map file (NIM, Dynamo, BCM/Base Command, DGX naming, etc.) is likely distinct enough content to become its own well-placed subsection rather than needing heavy deduplication — check for actual overlap with the existing driver/CUDA/toolkit explanation before deciding.
5. **Volume 5** — merge `docs/volume-05/00-foundation-what-ai-workloads-are.md` into `docs/volume-05/01-chapter-1-classify-the-ai-workload-before-designing-infrastructure.md`'s existing Foundations section.
6. **Volume 6** — merge `docs/volume-06/00-foundation-what-hpc-infrastructure-is.md` into `docs/volume-06/01-chapter-1-distributed-systems-performance-for-gpu-jobs.md`'s existing Foundations section.

### Volumes with no existing Foundations section (relocate the standalone content in fresh, no dedup needed — but still re-nest headings, adjust framing, and follow the pedagogy rules below)

7. **Volume 7** — move `docs/volume-07/00-foundation-what-observability-and-reliability-are.md` into a new `## Foundations: start here if this is new to you` section at the top of `docs/volume-07/01-chapter-1-metrics-logs-and-traces-as-different-evidence.md` (immediately after front matter, before the chapter's existing first line).
8. **Volume 8** — move `docs/volume-08/00-foundation-what-solutions-architecture-is.md` into a new Foundations section at the top of `docs/volume-08/01-chapter-1-discovery-that-changes-the-architecture.md`.
9. **Volume 9** — move `docs/volume-09/00-foundation-how-to-use-interview-practice.md` into a new Foundations section at the top of `docs/volume-09/01-chapter-1-the-answer-framework-expose-your-reasoning.md`.

### Volume 10 — special case, three standalone files with different roles

- `docs/volume-10/00-foundation-how-the-bare-metal-hpc-stack-fits-together.md` (broad, spans the whole volume) → move into a new Foundations section at the top of `docs/volume-10/01-bare-metal-and-bmc-lifecycle.md` (Chapter 1 has no existing Foundations section — this is a fresh relocation, not a dedup).
- `docs/volume-10/00b-infrastructure-as-code-and-configuration-management-from-zero.md` → move into a new Foundations section at the top of `docs/volume-10/04-ansible-for-infrastructure-automation.md` (also has no existing Foundations section).
- `docs/volume-10/00c-slurm-bcm-interview-lab.md` — this is a hands-on PRACTICE lab (worksheets, read-only lab exercises), not duplicate teaching content, so it does NOT have the same problem as the others. Recommended: leave it in place, but reconsider its `sidebar_position: 0.2` (currently sits before Chapter 1 as if it were foundational reading) — either leave it or move it later in the volume (e.g. after Chapter 6, the Slurm administration chapter, renumbering its `sidebar_position` accordingly) since it's a practice companion, not a prerequisite. Use judgment; this one file is optional to move, not required to delete.
- Note: `docs/volume-10/03-os-provisioning-and-linux-security-hardening.md` already has its OWN unrelated Foundations section (Linux/security fundamentals) from an earlier pass — that one is fine as-is, do not touch it, it's not part of this duplication problem (different topic scope than the volume-wide "00" file).

## After all merges: update the linking system

1. In `src/components/learning/ChapterFoundationBridge.tsx`, update every entry in `volumeFoundations` (all 10 volumes) plus the volume-10 IaC special-case branch to point at the correct merged chapter + heading anchor instead of the deleted standalone page. Verify each anchor against the actual rendered heading text (Docusaurus lowercases, strips punctuation, hyphenates spaces — e.g. `## Foundations: start here if this is new to you` becomes `#foundations-start-here-if-this-is-new-to-you`; do not assume, check the actual heading you wrote).
2. In `src/data/chapterStudyContexts.ts`, remove the now-orphaned entries for every deleted standalone foundation page (keyed by their old chapter titles, e.g. `"Foundation — what Linux is and how to study a running system"`). Do not touch entries for real chapter titles.
3. Double check no other file references the deleted slugs. Run: `grep -rn "foundation-what-linux-is\|foundation-what-python-is\|python-constructs-imports-and-project-layout\|foundation-what-kubernetes-is\|foundation-what-gpu-computing-is\|nvidia-ecosystem-map-for-beginners\|foundation-what-ai-workloads-are\|foundation-what-hpc-infrastructure-is\|foundation-observability-and-reliability\|foundation-solutions-architecture\|foundation-interview-practice\|foundation-bare-metal-hpc-operations\|foundation-iac-terraform-ansible" docs/ src/` and fix or justify every remaining hit.

## One more small thing while you're in there

`docs/volume-10/17-git-for-infrastructure-and-operations.md` has this line, which breaks the textbook's voice by referencing AI tooling directly: *"If Claude or another automation is editing in parallel, inspect `git status` and file ownership before staging."* Reword it to something generic like *"If another process or teammate may be committing in parallel, inspect `git status` and file ownership before staging."*

## Pedagogy rules — every merged/relocated Foundations section must follow these

1. Assume a smart, experienced senior software/DevOps engineer who is a genuine beginner in THIS SPECIFIC concept — never condescend, never assume unexplained jargon.
2. One new concept at a time; define every term in plain language before using it (or gloss it immediately in parentheses if unavoidable to use first).
3. Every abstract concept gets a concrete analogy — ordinary life, or something a senior generalist engineer already knows.
4. Structure: the problem this concept solves (plain terms) → name the concept → its basic shape → a small, real, correct example with actual output shown.
5. At least one "Check your understanding" block per major section: 2-3 questions with the answer given immediately after (never hidden — this is teaching material, not a quiz).
6. Explicitly apply "evidence vs. proof" wherever a command/tool output is shown: state what it DOES prove, what it does NOT prove, what more you'd need to confirm a hypothesis.
7. Keep a closing glossary and a "ready to continue" checklist per merged section.
8. Warm but not fluffy — no motivational filler, no restating the obvious.

## Required validation before you consider this done

```bash
npm run typecheck
npm run build
```

Both must pass clean. Additionally:
- `grep -rlE "</?(content|file|document|result|output|read|tool_use|antml:[a-z_]+)>" docs/ src/` must return nothing (checks for accidentally pasted tool-output artifacts — a real problem that has happened in earlier passes on this repo).
- Confirm every standalone file listed above under "Volumes with true duplication" and "no existing Foundations section" no longer exists (`find docs -iname "00*foundation*" -o -iname "00b*" -o -iname "00c*"` should return nothing, or only `00c-slurm-bcm-interview-lab.md` if you chose to keep it in place).
- Confirm the Docusaurus production build reports no broken links (it's configured with `onBrokenLinks: 'throw'`, so `npm run build` failing on a link is itself the signal — but also manually re-check the anchors you wrote in `ChapterFoundationBridge.tsx` since anchor mismatches inside valid pages won't fail the build, they'll just silently 404 on click).

## What to report back when done

For each volume: what was kept vs. dropped as redundant, where any ambiguous content (like Volume 2's `00b` or Volume 4's `00b`) actually ended up, confirmation of the `ChapterFoundationBridge.tsx` and `chapterStudyContexts.ts` updates, and confirmation that `npm run typecheck` and `npm run build` both pass clean.
