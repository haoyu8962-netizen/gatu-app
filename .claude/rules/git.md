## Commits

Format: `type(scope): subject` (max 72 chars, lowercase, no period)

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

No body unless requested.

## Branches & Pull Requests

Owner: `docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md`.

- Work branches open pull requests into `dev`, never `main`. GitHub's default base is `main`, so pass it explicitly: `gh pr create --base dev`.
- `main` only receives pull requests from `dev`, merged with a merge commit (not squash), because task records and ADRs cite commit hashes from the branch.
- Pull requests into `dev` are merged with a merge commit too, never squashed or rebased, for the same reason. Promotion coverage (ADR 0016 D8) also recognises only GitHub's `Merge pull request #N from …` commits, so a squash, a rebase or a direct push to `dev` makes the next promotion run in full.
- Urgent fix: branch from `main`, open the pull request into `main`, then merge `main` back into `dev` straight away.
- Every pull request runs `Static Checks`, `Terminal Tests` in two shards, the browser regressions in two shards (not started when only `*.test.ts(x)` files under `apps/terminal/src` change), and one production build with the mobile pairing switch off. The pairing-on build runs only for pull requests into `main`, for `v[0-9]*` or `cloudfront-[0-9]*` tags (never `archive/**`), and on a manual run of `Production Builds`; trigger that with `workflow_dispatch` on your branch when a change touches the pairing code or its bundle size. A `dev` → `main` promotion repeats only what `dev` has not already passed (ADR 0016 D8): the `Promotion coverage` job of `Terminal Tests`, the browser regressions, `Production Builds` and `Website and Brand` runs `scripts/promotion-coverage.mjs`, and when the last pull request merged into `dev` that changed the workflow's inputs (its diff on `dev` matches the workflow's `paths` filter, or the workflow ran for it) passed it on a merge that no later change to those inputs followed, the workflow's jobs are skipped and `Production Builds` builds only the pairing-on state; any doubt runs everything, and `Static Checks` always runs. Never skip promotion checks with a `branches` or `branches-ignore` filter: it would also skip an urgent fix that goes straight into `main`. `scripts/ci-workflows.test.mjs` pins this structure.
