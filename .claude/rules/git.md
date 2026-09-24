## Commits

Format: `type(scope): subject` (max 72 chars, lowercase, no period)

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

No body unless requested.

## Branches & Pull Requests

Owner: `docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md`.

- Work branches open pull requests into `dev`, never `main`. GitHub's default base is `main`, so pass it explicitly: `gh pr create --base dev`.
- `main` only receives pull requests from `dev`, merged with a merge commit (not squash), because task records and ADRs cite commit hashes from the branch.
- Urgent fix: branch from `main`, open the pull request into `main`, then merge `main` back into `dev` straight away.
- Every pull request runs `Static Checks`, `Terminal Tests`, the browser regressions in two shards, and one production build with the mobile pairing switch off. The pairing-on build runs only for pull requests into `main`, for `v[0-9]*` or `cloudfront-[0-9]*` tags (never `archive/**`), and on a manual run of `Production Builds`; trigger that with `workflow_dispatch` on your branch when a change touches the pairing code or its bundle size. `scripts/ci-workflows.test.mjs` pins this structure.
