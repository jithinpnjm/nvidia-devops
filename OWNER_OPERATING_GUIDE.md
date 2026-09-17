# Owner Operating Guide

## Start
1. Connect Codex to `jithinpnjm/nvidia-devops`.
2. Add `AGENTS.md` at the repository root, preferably through a setup PR.
3. Give Codex `CODEX_MASTER_HANDOFF.md`.
4. Run discovery first.
5. Approve edits only after the inventory is correct.

## Recommended Pattern
Use one coordinator thread. Let it delegate internal parallel agents or isolated worktrees.

Use one integration branch per volume and non-overlapping worker branches.

## Approval Points
Require approval:
1. after discovery;
2. before starting each volume;
3. before route or filename changes;
4. before marking ready;
5. before merge.

## After Discovery
Paste:
```text
Approve the inventory and start the recommended next volume.

Use the proposed non-overlapping agent ownership.
Keep the PR draft.
Do not merge.
Report after writing handoffs, technical review, editorial review,
integration review, and CI are complete.
```

## Before Merge
Paste:
```text
Show the final changed-file list, line counts, review findings, CI result,
branch status, and unresolved risks.

Do not merge yet.
```
