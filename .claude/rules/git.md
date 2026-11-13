## Commits

Format: `type(scope): subject` (max 72 chars, lowercase, no period)

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

No body unless requested.

## Branches & Pull Requests

Owner: `docs/adr/0055-single-main-branch-and-release-tags.md` (it replaces the branch flow and the promotion tier of ADR 0016).

- There is one long-lived branch, `main`. Work branches start from `origin/main` and open pull requests into `main`; there is no `dev` branch and no promotion pull request.
- Pull requests are merged with a merge commit, never squashed or rebased, because task records and ADRs cite commit hashes from the branch.
- `main` is not what is live. A release is the commit carrying the newest `cloudfront-<date>-p<N>` tag (for example `cloudfront-2026-11-12-p41`); tag the commit a release was built from as part of the release.
- Urgent fix to what is live: branch from the release tag, release from that branch, tag it, then open a pull request that merges the branch into `main`.
- Every pull request runs `Static Checks`, `Terminal Tests` in two shards, the browser regressions in two shards (not started when only `*.test.ts(x)` files under `apps/terminal/src` change), and `Production Builds` with the mobile pairing switch off and on. `v[0-9]*` and `cloudfront-[0-9]*` tags (never `archive/**`) and a manual run build the same two states. No workflow reads the branch names of a pull request or filters on `branches`. `scripts/ci-workflows.test.mjs` pins this structure.
- The checks that need the chart library check out the private `gatu-chart-library` repository with the `CHART_LIBRARY_TOKEN` secret (ADR 0054); a pull request from a fork has no secrets and cannot run them.
