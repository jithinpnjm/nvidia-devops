# Codex Master Handoff — Complete the NVIDIA Zero to Hero Bootcamp

You are the lead coordinator for `jithinpnjm/nvidia-devops`.

The owner confirms Volume 09 is complete.

Your job is to coordinate creation or publication-quality rework of all remaining volumes using parallel agents safely.

## Constraints
- Do not assume which volumes remain incomplete.
- Inspect the live repository, branches, PRs, and CI first.
- Do not recreate Volume 09.
- Do not overwrite publication-quality work without review.
- Do not merge into `main` without explicit approval.
- Do not launch writers before discovery and ownership planning are complete.
- Never assign overlapping files.

## Phase 1 — Discovery Only
Make no content edits.

1. Read `AGENTS.md` and all governance files.
2. Fetch latest `main`.
3. Inventory every bootcamp volume.
4. For each volume report:
   - exact directory;
   - introduction file;
   - chapter count;
   - lab count;
   - total lines;
   - median chapter lines;
   - branch and PR, if any;
   - merged status;
   - CI status;
   - likely quality state: missing, outline draft, partial quality pass, publication-ready, or requires human review.
5. Inspect representative chapters and labs from every uncertain volume.
6. Verify which volumes are already merged.
7. Create a repository-grounded production ledger.
8. Recommend the next volume.
9. Propose a phased plan for all remaining volumes.
10. Wait for owner approval before editing.

## Phase 2 — One Volume at a Time
After approval:

1. Create or update `book/volume-XX-<slug>`.
2. Keep the PR draft.
3. Confirm exact filenames and ownership.
4. Delegate through isolated worktrees or task branches.

Recommended agents:
- Agent A: introduction and Chapters 01–04
- Agent B: Chapters 05–08
- Agent C: Chapters 09–12 or remaining final range
- Agent D: all labs only
- Agent E: technical review
- Agent F: editorial and integration review

Adjust to the actual roadmap and filenames.

## Worker Rules
Each writer must:
1. Read governance and assigned files in full.
2. Read adjacent chapters.
3. Preserve routes.
4. Rewrite outline content into full book content.
5. Verify technical claims with primary sources.
6. Commit in small logical batches.
7. Return the handoff required by `AGENTS.md`.

## Coordinator Review
After every handoff:
1. Inspect the diff.
2. Reject generic or outline-quality prose.
3. Check chapter boundaries and duplication.
4. Verify claims.
5. Check diagrams and tables.
6. Check lab safety and reproducibility.
7. Check links.
8. Request corrections before integration.

## Final Validation Per Volume
Before marking ready:
1. Confirm expected changed-file scope.
2. Check front matter and sidebar positions.
3. Check local and cross-volume links.
4. Check Mermaid.
5. Run:
   ```bash
   npm ci
   npm run check
   ```
6. Inspect GitHub Actions.
7. Fix failures without suppressing validation.
8. Run technical, editorial, and integration reviews.
9. Update the production ledger.
10. Mark ready only when all gates pass.
11. Stop for owner approval before merge.

## Multi-Volume Strategy
Use waves:
- Wave 1: discover and classify all remaining volumes.
- Wave 2: complete one pilot volume.
- Wave 3: run up to three volumes concurrently after the pilot succeeds.
- Wave 4: review and integrate independently.
- Wave 5: merge sequentially only with explicit approval.

Do not run all remaining volumes in one uncontrolled task.

## Status Report Format
```md
# Bootcamp Production Status

## Repository Baseline
- main SHA:
- inspected at:
- open PRs:
- CI baseline:

## Volume Inventory
| Volume | Status | Chapters | Labs | Quality | Branch/PR | Main risks |
|---|---|---:|---:|---|---|---|

## Recommended Next Volume
- volume:
- reason:
- dependencies:

## Proposed Agent Ownership
| Agent | Exact files | Branch/worktree |
|---|---|---|

## Review Gates
- structural:
- technical:
- editorial:
- integration:
- CI:

## Questions Requiring Owner Approval
- ...
```

## Stop Conditions
Stop and ask when roadmap and filenames conflict, ownership is ambiguous, a destructive branch operation is required, a route migration is needed, CI fails outside the target volume, a claim cannot be verified, or a merge is required.
