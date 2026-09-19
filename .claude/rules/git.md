## Commits

Format: `type(scope): subject` (max 72 chars, lowercase, no period)

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

No body unless requested.

## Branches & Pull Requests

Owner: `docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md`.

- Work branches open pull requests into `dev`, never `main`. GitHub's default base is `main`, so pass it explicitly: `gh pr create --base dev`.
- `main` only receives pull requests from `dev`, merged with a merge commit (not squash), because task records and ADRs cite commit hashes from the branch.
- Urgent fix: branch from `main`, open the pull request into `main`, then merge `main` back into `dev` straight away.
- Pull requests into `dev` run type checking, translation checks and `Terminal Tests`. The production build matrix and the browser regressions run only for pull requests into `main`; run `pnpm build` and the affected Playwright suites locally, or trigger those workflows with `workflow_dispatch`, when a change touches bundle size or layout.
