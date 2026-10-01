# @gatu/hyperliquid-api-skill

**This is not a runtime dependency.** It's an [Agent Skill](https://www.anthropic.com/news/agent-skills) — installable tooling for AI coding agents (Claude Code, Codex, etc.) that guides them toward correct Hyperliquid API usage.

Runtime Hyperliquid integration lives in [`@gatu/hl-react`](../hl-react/README.md).

## What's inside

```
packages/hyperliquid-api/
├── SKILL.md              entry point — decision rules for picking an API surface
├── references/           detailed reference docs, loaded on demand by the agent
│   ├── api-selection.md
│   ├── method-index.md
│   ├── info-returns.md
│   ├── exchange-returns.md
│   ├── subscriptions.md
│   └── signing.md
├── evals/                evaluation scenarios for the skill
├── research.md           background research
└── scripts/
    └── install-skill.mjs   CLI installer for Agent-Skills-compatible clients
```

## Why it exists

Hyperliquid has four API surfaces — `Info` (read), `Exchange` (write/signed), `Subscription` (stream), `Explorer` (block and transaction lookups on the RPC host) — each with their own request/response shapes and transport preferences. AI agents generating trading code were guessing. This skill gives them deterministic rules and on-demand reference material so they pick the right surface the first time.

## Install

```bash
npx gatu-install-hyperliquid-api-skill
```

This is the `bin` declared in `package.json` — it drops the skill files into wherever the agent client loads skills from. Read `SKILL.md` for the decision rules the agent follows.

## Not for human reading

If you're a developer working on gatu, you almost never need this package. Look at `packages/hl-react` instead.
