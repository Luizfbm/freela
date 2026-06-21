# Git Repository Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organize the local Git state without losing work: preserve the current passing changes, update local branches against `origin/main`, and clean obsolete worktrees/branches safely.

**Architecture:** Treat Git cleanup as a preservation-first migration. First record the current state and save dirty work into commits or rescue branches, then fast-forward/rebase branches, then remove only worktrees whose contents are already represented by a branch or commit.

**Tech Stack:** Git, Node native test runner (`node --test`), Markdown documentation.

---

## Current Audit From 2026-06-20

- Current workspace: `/Users/luiz_fbm/Documents/programacao/freela`
- Current branch: `codex/sqlite-data-consistency`
- Remote: `origin https://github.com/Luizfbm/freela.git`
- `origin/main`: `bc48bb0 Add Aghata Massoterapia 72h demo`
- Local `main`: `ed6b21f`, behind `origin/main` by 11 commits
- Current branch divergence from `origin/main`: 3 local commits ahead, 2 remote commits behind
- Stash list: empty
- Dirty main workspace: 32 modified files and 5 untracked files
- Validation already run: `node --test tests/*.test.mjs` passed with 90 tests
- Whitespace validation already run: `git diff --check` produced no output
- Committed branch merge check: `git merge-tree --write-tree HEAD origin/main` produced a tree id, so the committed part has no detected merge conflict
- Merged branch candidate: `codex/new-health-lead-demos` is already merged into `origin/main` and its worktree is clean
- Dirty detached worktrees:
  - `/Users/luiz_fbm/.codex/worktrees/220e/freela`
  - `/Users/luiz_fbm/.codex/worktrees/76b0/freela`

## File Structure

- Main workspace dirty changes to preserve:
  - `docs/freelancer/`: freelancer operational docs and prompts
  - `docs/freelancer/paperclip/`: Paperclip agent/routine schemas and docs
  - `docs/superpowers/specs/2026-06-19-whatsapp-local-automation-design.md`: spec update
  - `scripts/`: CRM, Paperclip sync, Chrome profile, and scout smoke scripts
  - `tests/`: Node test coverage for CRM and Paperclip automation contracts
- Git housekeeping targets:
  - local branch `main`
  - local branch `codex/sqlite-data-consistency`
  - merged branch `codex/new-health-lead-demos`
  - clean worktree `/Users/luiz_fbm/Documents/programacao/freela/.worktrees/codex-new-health-lead-demos`
  - detached worktrees under `/Users/luiz_fbm/.codex/worktrees/`

---

### Task 1: Reconfirm Baseline Before Mutating Git

**Files:**
- Read only: Git metadata and working tree status

- [ ] **Step 1: Confirm branch and dirty state**

Run:

```bash
git status --short --branch
```

Expected: branch is `codex/sqlite-data-consistency`; dirty files are the freelancer docs, Paperclip docs/configs, scripts, tests, and this plan file if it has not been committed separately.

- [ ] **Step 2: Confirm remote refs are current**

Run:

```bash
git fetch --prune
```

Expected: no error. If `origin/main` advances again, rerun Step 3 and Task 3 merge checks before rebasing.

- [ ] **Step 3: Re-run tests on the dirty state**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: 90 tests pass.

- [ ] **Step 4: Check diff formatting**

Run:

```bash
git diff --check
```

Expected: no output.

---

### Task 2: Preserve Current Main Workspace Work

**Files:**
- Modify Git history only on local branch `codex/sqlite-data-consistency`
- Stage: `docs/freelancer/`
- Stage: `docs/superpowers/specs/2026-06-19-whatsapp-local-automation-design.md`
- Stage: `scripts/`
- Stage: `tests/`

- [ ] **Step 1: Create a backup pointer before committing**

Run:

```bash
git branch backup/pre-git-cleanup-2026-06-20 HEAD
```

Expected: local branch `backup/pre-git-cleanup-2026-06-20` points at current `HEAD` before any cleanup commits.

- [ ] **Step 2: Stage the implementation changes, excluding the cleanup plan if desired**

Run:

```bash
git add docs/freelancer docs/superpowers/specs/2026-06-19-whatsapp-local-automation-design.md scripts tests
```

Expected: all current feature changes are staged. This does not stage `docs/superpowers/plans/2026-06-20-git-repository-organization.md`.

- [ ] **Step 3: Inspect staged scope**

Run:

```bash
git diff --cached --stat
```

Expected: staged files include the 32 modified files and 5 untracked implementation files from the audit, with most line changes in `scripts/freela-crm.mjs`, `tests/freela-crm-cli.test.mjs`, and `tests/paperclip-automation-contract.test.mjs`.

- [ ] **Step 4: Commit the passing local implementation snapshot**

Run:

```bash
git commit -m "feat: stabilize freelancer operations data flow"
```

Expected: one new commit is created on `codex/sqlite-data-consistency`. This is intentionally a preservation commit; it can be split later after the repository is clean.

- [ ] **Step 5: Commit this Git cleanup plan separately**

Run:

```bash
git add docs/superpowers/plans/2026-06-20-git-repository-organization.md
git commit -m "docs: plan git repository organization"
```

Expected: one docs-only commit records the cleanup plan.

- [ ] **Step 6: Verify clean tree and passing tests after commits**

Run:

```bash
git status --short --branch
node --test tests/*.test.mjs
```

Expected: worktree is clean on `codex/sqlite-data-consistency`; 90 tests pass.

---

### Task 3: Rebase Feature Branch Onto Current `origin/main`

**Files:**
- Modify Git commit graph for branch `codex/sqlite-data-consistency`

- [ ] **Step 1: Confirm committed merge is still clean**

Run:

```bash
git merge-tree --write-tree HEAD origin/main
```

Expected: command exits successfully and prints a tree id. If it reports conflicts, stop and inspect the conflicting file list before rebasing.

- [ ] **Step 2: Rebase the feature branch**

Run:

```bash
git rebase origin/main
```

Expected: branch `codex/sqlite-data-consistency` is replayed on top of `bc48bb0` or the current `origin/main` if it advanced during Task 1.

- [ ] **Step 3: Verify after rebase**

Run:

```bash
git status --short --branch
node --test tests/*.test.mjs
```

Expected: worktree is clean; tests pass.

- [ ] **Step 4: Inspect concise history**

Run:

```bash
git log --oneline --decorate --graph --max-count=20 --all
```

Expected: `origin/main` is below the local feature commits; the branch contains the existing design/plan/operations commits plus the new preservation and plan commits.

---

### Task 4: Fast-Forward Local `main`

**Files:**
- Modify local branch pointer `main`

- [ ] **Step 1: Switch to local `main`**

Run:

```bash
git switch main
```

Expected: checkout succeeds because the feature branch worktree is clean.

- [ ] **Step 2: Fast-forward only**

Run:

```bash
git merge --ff-only origin/main
```

Expected: local `main` moves to `origin/main`. No merge commit is created.

- [ ] **Step 3: Return to the feature branch**

Run:

```bash
git switch codex/sqlite-data-consistency
```

Expected: branch switches back cleanly.

---

### Task 5: Remove Merged Clean Worktree and Branch

**Files:**
- Remove Git worktree metadata and ignored local worktree folder
- Delete local branch `codex/new-health-lead-demos`

- [ ] **Step 1: Confirm the worktree is clean**

Run:

```bash
git -C /Users/luiz_fbm/Documents/programacao/freela/.worktrees/codex-new-health-lead-demos status --short --branch
```

Expected: output is only `## codex/new-health-lead-demos`.

- [ ] **Step 2: Confirm the branch is merged**

Run:

```bash
git branch --merged origin/main
```

Expected: output includes `codex/new-health-lead-demos`.

- [ ] **Step 3: Remove the worktree**

Run:

```bash
git worktree remove /Users/luiz_fbm/Documents/programacao/freela/.worktrees/codex-new-health-lead-demos
```

Expected: worktree folder is removed.

- [ ] **Step 4: Delete the merged branch**

Run:

```bash
git branch -d codex/new-health-lead-demos
```

Expected: Git deletes the branch without requiring `-D`.

---

### Task 6: Preserve Dirty Detached Codex Worktrees Before Removal

**Files:**
- Preserve local state from:
  - `/Users/luiz_fbm/.codex/worktrees/220e/freela`
  - `/Users/luiz_fbm/.codex/worktrees/76b0/freela`
- Create rescue branches:
  - `rescue/codex-worktree-220e-2026-06-20`
  - `rescue/codex-worktree-76b0-2026-06-20`

- [ ] **Step 1: Save the `220e` detached worktree into a rescue branch**

Run:

```bash
git -C /Users/luiz_fbm/.codex/worktrees/220e/freela switch -c rescue/codex-worktree-220e-2026-06-20
git -C /Users/luiz_fbm/.codex/worktrees/220e/freela add -A
git -C /Users/luiz_fbm/.codex/worktrees/220e/freela commit -m "chore: preserve detached Codex worktree 220e"
```

Expected: a rescue commit preserves the modified spec and untracked freelancer/scripts/tests files from that detached worktree.

- [ ] **Step 2: Save the `76b0` detached worktree into a rescue branch**

Run:

```bash
git -C /Users/luiz_fbm/.codex/worktrees/76b0/freela switch -c rescue/codex-worktree-76b0-2026-06-20
git -C /Users/luiz_fbm/.codex/worktrees/76b0/freela add -A
git -C /Users/luiz_fbm/.codex/worktrees/76b0/freela commit -m "chore: preserve detached Codex worktree 76b0"
```

Expected: a rescue commit preserves the untracked freelancer/scripts/tests files from that detached worktree, including older files such as `agent-essencial.json` and `prompt-thread-criacao-exemplos.md`.

- [ ] **Step 3: Confirm rescue branches exist**

Run:

```bash
git branch --list "rescue/codex-worktree-*"
```

Expected: output includes both rescue branches.

- [ ] **Step 4: Remove the now-clean rescued worktrees**

Run:

```bash
git worktree remove /Users/luiz_fbm/.codex/worktrees/220e/freela
git worktree remove /Users/luiz_fbm/.codex/worktrees/76b0/freela
```

Expected: both detached worktree folders are removed without `--force`.

- [ ] **Step 5: Prune stale worktree metadata**

Run:

```bash
git worktree prune
git worktree list --porcelain
```

Expected: remaining worktrees are only intentional active workspaces.

---

### Task 7: Final Verification and Optional Push

**Files:**
- Read Git status/history
- Optional remote update for `codex/sqlite-data-consistency`

- [ ] **Step 1: Verify final status**

Run:

```bash
git status --short --branch
git branch -vv
git worktree list --porcelain
```

Expected: current branch is clean; local `main` tracks `origin/main` without being behind; no obsolete clean worktree remains; rescue branches exist only if Task 6 was needed.

- [ ] **Step 2: Run final tests**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: 90 tests pass.

- [ ] **Step 3: Push the cleaned feature branch only when ready**

Run:

```bash
git push -u origin codex/sqlite-data-consistency
```

Expected: remote branch is created or updated. Do not force-push unless there is an explicit decision to rewrite already-published history.

---

## Non-Goals

- Do not run `git reset --hard`.
- Do not run `git clean -fd`.
- Do not delete dirty worktrees with `--force`.
- Do not delete rescue branches until their commits have been reviewed.
- Do not rewrite remote history without an explicit force-push decision.

## Self-Review

- Spec coverage: the plan covers dirty workspace preservation, rebase onto current `origin/main`, local `main` fast-forward, merged branch cleanup, dirty detached worktree preservation, pruning, tests, and optional push.
- Placeholder scan: no `TBD`, `TODO`, or undefined file path remains.
- Command consistency: branch names and paths match the audit output from 2026-06-20.
