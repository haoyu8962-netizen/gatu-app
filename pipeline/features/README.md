# Features Pipeline

One file per proposed feature. Each file is the full brief: what, why, design notes, dependencies — everything needed to implement.

## Convention

- **One feature = one file.** Filename is a slug, e.g. `mobile-position-share-card.md`.
- **Status lives in frontmatter** at the top:
  - `status: proposed` — captured, not yet planned
  - `status: planned` — committed to build, design done
  - `status: in-progress` — actively implementing
  - `status: shipped` — live in production (add commit/PR + date)
  - `status: dropped` — not pursuing (keep file with reason)
- **New features:** create a new file. No central index needed beyond `ls`.
- **Done = update status to `shipped`** and add the PR / commit reference inside the file. Do not delete or move.
- **Design + implementation notes live inside the file.** Link to PRDs in `./plans/` when generated.

## Listing the backlog

```bash
# proposed only
grep -l "status: proposed" pipeline/features/*.md

# everything with status
grep -H "^status:" pipeline/features/*.md
```

## File template

```markdown
---
status: proposed
priority: p1            # p0 = ship next, p1 = soon, p2 = whenever, p3 = nice-to-have
area: trade-panel       # tradebox / positions / chart / mobile / wallet / settings / ...
created: YYYY-MM-DD
---

# Feature title

## Problem

What's broken / missing today?

## Proposed solution

What we'll build.

## Design notes

UX patterns, component reuse, edge cases.

## Dependencies

API endpoints, hl-react hooks, design tokens needed.

## Out of scope

What this explicitly is not.

## Acceptance

How we know it's done.

## Notes / scratch
```

Last refreshed: 2026-05-03
