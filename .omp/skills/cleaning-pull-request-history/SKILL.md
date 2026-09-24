---
name: cleaning-pull-request-history
description: Use when squashing, rewording, rebasing, or otherwise rewriting commits on an open pull request, especially when PR base metadata, local tracking refs, and branch ancestry disagree.
---

# Cleaning Pull Request History

## Core Principle

Construct and prove the rewrite locally. Mutate GitHub last. The feature patch is an invariant; history shape may change, code must not.

## Stop Conditions

Stop before rewriting when any of these is unresolved:

- Worktree is dirty.
- Remote refs have not been freshly fetched.
- The intended integration base is ambiguous.
- The fetched PR head moved after inspection.
- Author, committer, or co-author attribution is unknown.

A PR base change is separate from commit cleanup. If ancestry says `dev` but GitHub targets `main`, ask Lucas which integration target is intended before changing PR metadata or choosing the rewrite base.

## Workflow

1. **Inspect without mutation.** Fetch. Record PR number, head/base, remote head SHA, upstream, merge bases, commit graph, and worktree state. Never trust a stale tracking ref.
2. **Create a local backup ref** at the freshly fetched remote PR head. Record `OLD_HEAD`, `OLD_BASE`, and the exact feature range.
3. **Audit the original patch.** Capture its commit list, `--name-status`, `--numstat`, `--stat`, and stable patch ID.
4. **Build locally on the approved base.** Start from the current base tip, apply only the feature range, then create the requested history shape. Preserve human authorship and co-authors; use the intended human committer and signing key.
5. **Prove parity before any push.** Compare original and rewritten deltas:

```bash
git diff "$OLD_BASE..$BACKUP" | git patch-id --stable
git diff "$NEW_BASE..HEAD" | git patch-id --stable
git diff --name-status "$OLD_BASE..$BACKUP"
git diff --name-status "$NEW_BASE..HEAD"
git diff --numstat "$OLD_BASE..$BACKUP"
git diff --numstat "$NEW_BASE..HEAD"
git range-diff "$OLD_BASE..$BACKUP" "$NEW_BASE..HEAD"
```

Patch IDs and path/status/numstat sets MUST match for a conflict-free rewrite. Any mismatch requires line-level review and an explicit explanation before proceeding. Run the repository’s full required tests and build on the rewritten local branch.

6. **Remote mutation gate.** State the exact branch, old SHA, new SHA, PR-base change, and commands. Force-push or change PR metadata only when Lucas explicitly requested that specific mutation; history cleanup does not implicitly authorize changing the PR base.
7. **Push with an exact lease:**

```bash
git push --force-with-lease=refs/heads/$BRANCH:$OLD_HEAD origin HEAD:$BRANCH
```

Never use bare `--force`. Change the PR base only after separate approval.
8. **Verify GitHub against local state.** Confirm local `HEAD`, remote branch SHA, PR head SHA, base, commit count, changed-file/addition/deletion counts, GitHub signature status, and clean worktree.

## Red Flags

- Editing the PR base before local parity proof
- Using `main..HEAD` merely because GitHub says the base is `main`
- Resetting onto a new base and committing the resulting tree without replaying only the feature range
- Treating passing tests as proof that no feature lines were dropped
- Force-pushing before comparing the old and new patch
