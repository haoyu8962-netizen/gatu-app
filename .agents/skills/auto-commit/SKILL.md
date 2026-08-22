---
name: auto-commit
description: Automatically create a safe Git commit at the end of every task that modifies repository files. Use for coding, bug fixes, refactors, configuration, documentation, tests, assets, and any other file-changing work, unless the user explicitly says not to commit. 每次修改仓库文件的任务完成后自动安全提交。
---

# Auto Commit

Apply this workflow to every task that may modify files in a Git repository.

## At the beginning of the task

1. Determine whether the working directory is inside a Git repository:
   `git rev-parse --is-inside-work-tree`.
2. Capture the baseline with `git status --short` so pre-existing changes are not accidentally included.
3. Never discard, overwrite, reset, stash, or commit pre-existing user changes unless the user explicitly asks.

## Before committing

1. Finish the requested implementation completely.
2. Inspect `git status --short`, `git diff`, and, when relevant, `git diff --cached`.
3. Run the most relevant available tests, type checks, linters, or build checks for the files changed.
4. Fix failures introduced by the current task before committing.
5. If validation cannot run because of an environment limitation or a clearly pre-existing failure, the commit may proceed, but report the exact limitation in the final response.
6. Do not commit when:
   - the user explicitly says not to commit;
   - there are unresolved merge conflicts;
   - the changes contain credentials, secrets, private keys, `.env` files, tokens, or other sensitive material;
   - it is not possible to separate current-task changes from unrelated pre-existing changes safely;
   - the current task is incomplete or known to introduce a failing change.

## Staging rules

1. Stage only files or hunks created or changed for the current task.
2. Use explicit paths, for example: `git add path/to/file1 path/to/file2`.
3. Do not use `git add .`, `git add -A`, or other broad staging commands.
4. Leave unrelated modified, deleted, untracked, or previously staged files untouched.
5. Before committing, run:
   - `git diff --cached --check`
   - `git diff --cached --stat`
   - `git diff --cached`
6. If there is no staged diff, do not create an empty commit.

## Commit rules

1. Create one focused commit for the completed task unless separate commits are clearly required for reviewability.
2. Use a concise Conventional Commit message when practical:
   - `feat: ...`
   - `fix: ...`
   - `refactor: ...`
   - `test: ...`
   - `docs: ...`
   - `chore: ...`
3. Write the message from the actual staged diff, not merely from the user's original request.
4. Do not amend an existing commit unless the user explicitly asks.
5. Do not push, force-push, rebase, merge, open a pull request, or deploy unless the user explicitly asks.
6. If Git author identity is missing, do not invent or globally configure one. Report the issue and the exact configuration Git requires.

## Final response

After a successful commit, report:

- the short commit hash;
- the commit message;
- the files included;
- the validation commands run and their results;
- any unrelated working-tree changes left untouched.

If no commit was created, state the precise reason.
