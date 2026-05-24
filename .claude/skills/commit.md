---
name: commit
description: Use when the user asks to commit changes, run /commit, create a git commit, or generate and apply a conventional commit message for the current session's changes.
argument-hint: "[optional message]"
---

# Commit

Create a clean commit for the user's requested changes.

## Rules

1. Inspect changes first:
   - Run `git status --short`.
   - Run `git diff --name-only` and `git diff --name-only --cached`.
   - Review the relevant diff before staging or committing.

2. Stage only files changed for the current user request:
   - Do not run `git add -A` or `git add .`.
   - If unrelated changes are present, leave them unstaged.
   - If unsure whether a file belongs to this session, ask the user before staging it.

3. Use a one-line conventional commit message:
   - Format: `<type>: <subject>` or `<type>(<scope>): <subject>`.
   - Types: `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `build`, `ci`, `docs`, `chore`, `revert`, `i18n`.
   - Keep it under 72 characters.
   - Lowercase subject, imperative mood, no period.
   - No body unless the user explicitly requests one.

4. If the user provides a commit message:
   - Use it as-is if it is already one line and has a conventional prefix.
   - Add a conventional prefix if missing.
   - Do not add co-author trailers.

5. Commit safely:
   - Show the proposed message before committing unless the user explicitly gave the exact message and asked you to commit.
   - Use `git commit -m "<message>"`.
   - After committing, run `git status --short` and `git log -1 --oneline`.
   - Report the commit hash and message.

## Never

- Never stage unrelated user changes.
- Never use destructive git commands.
- Never add `Co-Authored-By`, `Co-authored-by`, AI, Claude, Codex, or other agent attribution.
