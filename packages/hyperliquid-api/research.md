# Hyperliquid Skill Research Log

## Goal

Create an installable package that can ship a Hyperliquid-focused skill for clients like Codex, Claude Code, and other Agent Skills-compatible tools. The skill should help an agent choose the correct Hyperliquid API surface, understand what each call returns, and avoid unsafe assumptions around signing, actions, rate limits, and error handling.

## Current package direction

- Package target: `@hypeterminal/hyperliquid-api-skill`
- Distribution intent: package-first artifact that can later bundle a cross-client skill directory instead of only repo-local `.agents/skills/...` content
- Working principle: keep `SKILL.md` compact and operational, move large API and return-shape detail into `references/`
- Validation principle: the skill must be backed by evals and source-anchored reference material, not generic LLM knowledge

## Token optimization requirements

- Treat token budget as a design constraint, not cleanup work at the end.
- Keep `SKILL.md` limited to:
  - trigger intent
  - API-surface selection rules
  - a small number of high-value gotchas
  - instructions for when to load each reference file
- Do not inline endpoint catalogs or full schemas in `SKILL.md`.
- Prefer one focused reference per concern:
  - selection
  - info returns
  - exchange returns
  - subscriptions
  - signing
  - rate limits
  - errors
- Prefer decision rules over exhaustive prose.
- Prefer 2-4 canonical examples over many repetitive ones.
- Put long method inventories, schema details, and future generated tables in files the skill reads only on demand.
- Add evals to catch token-bloat regressions:
  - does the skill answer with the correct API surface without loading unnecessary references?
  - does it load the right reference only when needed?

### Current payload shape

- `SKILL.md` remains the only always-loaded instruction file.
- references are split across 8 focused files.
- trigger tests are separated from output evals.
- installer logic is shipped separately so the skill payload stays clean.

This keeps the activation surface small while still improving method coverage and package usability.

## Tooling for complex skill creation

### What helps

- `skill-creator` guidance
  - useful for structure, progressive disclosure, eval design, and trigger-description quality
  - not enough on its own for domain accuracy
- Agent Skills reference tooling (`skills-ref` in the cloned `agentskills` repo)
  - useful for validating skill structure and generating prompt/catalog metadata
  - good for packaging hygiene, not for API correctness
- source repos and docs
  - official Hyperliquid docs and SDKs are the source of truth for protocol behavior
  - typed community SDKs are the best source for request/response and error-shape precision
- eval fixtures
  - needed to prove the skill picks the right surface and explains return types correctly

### What does not exist as a shortcut

There does not appear to be a single "complex skill creator" tool that can safely generate a production-grade API skill for Hyperliquid end to end. The reliable path is:

1. use `skill-creator` guidance for shape and process
2. use `skills-ref`-style validation for spec compliance
3. use official and typed SDK sources for domain truth
4. add evals for activation and answer quality

## Working checklist

- [x] Define the actual goal.
  Notes: This is an installable skill package, not just a local skill folder.
- [x] Identify the relevant skill format and packaging constraints.
  Notes: Agent Skills is folder-based, cross-client, and uses progressive disclosure. A package can ship the skill payload plus references and install/copy it into `.agents/skills/` or another client-managed location.
- [x] Clone the upstream repos locally for deeper inspection.
  Notes: Cloned into `/tmp/hyper-skill-research/`:
  - `agentskills`
  - `hyperliquid-python-sdk`
  - `hyperliquid-ts` (`nktkas/hyperliquid`)
- [x] Establish what a "complex skill" should look like.
  Notes: The right shape is not one huge instruction file. It is a compact `SKILL.md`, tightly scoped defaults, explicit gotchas, and on-demand references.
- [x] Establish what makes an API skill accurate.
  Notes: Accuracy comes from separating API selection rules, request/response schemas, signing rules, and failure handling into explicit references and validation loops.
- [x] Identify the main Hyperliquid API surfaces.
  Notes: There are three top-level usage modes that matter for the skill:
  - `Info`: read-only queries
  - `Exchange`: signed actions and state-changing requests
  - `Subscription`: WebSocket real-time streams
- [x] Identify why official and third-party sources are both needed.
  Notes: The official Python SDK is authoritative for canonical action examples and workflow shape. The `nktkas` TypeScript SDK is better for typed request/response shapes, transport selection, and explicit error categories.
- [x] Define the first package contents.
  Notes: The package now lives at `packages/hyperliquid-api/` as a single-skill package root with the skill payload directly at the package root.
- [x] Draft the first `SKILL.md`.
  Notes: First pass created at `SKILL.md`.
- [x] Draft `references/` files for endpoint selection, return shapes, signing, and errors.
  Notes: First pass created for selection, method indexing, info returns, exchange returns, subscriptions, signing, rate limits, and error handling.
- [x] Add eval fixtures for trigger quality and output quality.
  Notes: `evals/evals.json` covers output quality and `evals/trigger-queries.json` covers activation quality and over-triggering.
- [x] Decide the installation UX for our app.
  Notes: First pass uses a package-bundled installer script that copies the skill into a target `.agents/skills/` root. Direct app registration can be added later if needed.

## Skill-creation findings

### 1. What a skill is

From the Agent Skills spec and docs, a skill is a directory containing:

- `SKILL.md` with YAML frontmatter and operational instructions
- optional `scripts/`
- optional `references/`
- optional `assets/`

Important constraints:

- `name` and `description` are the activation surface
- `SKILL.md` should stay compact
- large detail should move to `references/`
- skills are meant to be discoverable across clients through conventions like `.agents/skills/`

### 2. What a complex skill should not be

A complex API skill should not be:

- a giant wall of endpoint documentation inside `SKILL.md`
- a generic "use the API carefully" instruction set
- a single-source synthesis that ignores return types and failure modes

That approach will overfill context, trigger poorly, and hallucinate endpoint behavior.

### 3. What a complex API skill should be

A strong Hyperliquid API skill should contain:

- a sharp trigger description
- a small operational decision tree in `SKILL.md`
- explicit defaults for transport, client, and endpoint choice
- gotchas for signing, vaults, nonces, and rate limits
- reference files for request/response shapes
- eval cases that compare with-skill vs without-skill behavior

### 4. Best-practice patterns that matter for this package

- Start from real expertise and real source material, not generic API advice.
- Refine with real execution, not just static writing.
- Keep `SKILL.md` lean and move bulky detail into `references/`.
- Use defaults, not menus. The skill should tell the agent which source/client to prefer for which task.
- Add gotchas for the mistakes agents will actually make.
- Add validation loops and eval cases.

## Hyperliquid API findings

### High-level API taxonomy

The Hyperliquid skill should teach this first, because most mistakes begin with picking the wrong API surface:

| Surface | Use it for | Return shape |
| --- | --- | --- |
| `Info` | read-only queries, market data, account state, explorer-like reads | JSON objects or arrays returned from `/info` |
| `Exchange` | trading, transfers, account configuration, signed actions | action result envelopes from `/exchange`, often with per-item statuses |
| `Subscription` | live updates and streaming data | WebSocket event payloads delivered over subscriptions |

### Why this taxonomy matters for the skill

- If the user wants data snapshots or account reads, default to `Info`.
- If the user wants to place, cancel, modify, transfer, configure, or sign, default to `Exchange`.
- If the user wants real-time updates, default to `Subscription`.
- If the user wants low-latency request flow or stream restoration, WebSocket transport becomes part of the answer, not just the endpoint.

### Official vs community source roles

#### Official Python SDK

Useful for:

- canonical usage flows
- action examples
- order, cancel, modify, transfer, and websocket examples
- understanding how official helpers assemble actions and signatures

Weakness:

- many methods still return `Any`
- type detail is not strong enough to be the only foundation for a precision skill

#### `nktkas` TypeScript SDK

Useful for:

- explicit client split: `InfoClient`, `ExchangeClient`, `SubscriptionClient`
- transport split: `HttpTransport` vs `WebSocketTransport`
- request/response schema definitions
- typed error categories
- per-method docs close to the implementation

This is the best current source for the "when to use which API and what the common return pattern looks like" part of the skill.

### Concrete Hyperliquid coverage found in the cloned TypeScript SDK

- `Info` methods: about 77
- `Exchange` methods: about 51
- `Subscription` methods: about 30

This is important because it argues against a single flat skill file. The package needs structured references.

### Return-shape examples worth encoding into the skill references

#### `Info -> allMids`

- use for: snapshot of mids across coins
- request mode: read-only
- response shape: mapping of symbol to decimal-string price

#### `Exchange -> order`

- use for: placing one or more orders
- request mode: signed L1 action
- response shape: status envelope with per-order statuses, including:
  - resting order details
  - filled order details
  - explicit error strings
  - waiting states like `waitingForFill` and `waitingForTrigger`

This means the skill must teach agents not to assume one simple success boolean for order placement.

#### `Subscription -> allMids`

- use for: live mid-price updates
- request mode: WebSocket subscription
- response shape: event payload with `mids` mapping and optional `dex`

### Key gotchas the future skill must include

- Hyperliquid signing is not one thing. There are at least two signing flows: L1 actions and user-signed actions.
- `Exchange` actions are sensitive to nonce handling, vault context, and expiration.
- Rate limits differ for IP-based usage, WebSocket messages, and address-based actions.
- Batched requests are not charged the same way for IP and address-based limits.
- Order/cancel results can be mixed-status vectors, not a single uniform success object.
- WebSocket is not only for subscriptions; it can also be used for lower-latency POST-style request flows in the community SDK model.

## Packaging implications

## Proposed package contents, current pass

```text
packages/hyperliquid-api/
├── package.json
├── SKILL.md
├── references/
│   ├── api-selection.md
│   ├── method-index.md
│   ├── info-returns.md
│   ├── exchange-returns.md
│   ├── subscriptions.md
│   ├── signing.md
│   ├── rate-limits.md
│   └── error-handling.md
├── evals/
│   ├── evals.json
│   └── trigger-queries.json
├── scripts/
│   └── install-skill.mjs
├── research.md
```

### Why this structure is probably right

- `SKILL.md` can stay compact and accurate.
- return types can live in references without bloating activation context.
- evals can enforce that the skill chooses the correct API surface.
- installer logic can ship in the same package that ships the skill.

## Design argument: how to make this skill accurate without making it bloated

The user goal is valid, but the wrong implementation would be a monolithic skill that tries to memorize all Hyperliquid behavior in one file. For a large and evolving API, that is a bad fit.

The right approach is:

1. Put the agent's high-value decision rules in `SKILL.md`.
2. Put method families and return-shape detail in `references/`.
3. Prefer official docs for protocol rules.
4. Prefer the typed TypeScript SDK for exact request/response and error taxonomy.
5. Use the official Python SDK for canonical flows and examples.
6. Validate with evals so the skill proves it chooses the right API.

So the argument is not "do not build a Hyperliquid skill." The argument is "do not build it as a single dense instruction blob."

## Immediate next steps

- [x] Create the package as a single-skill root directory.
- [x] Draft a compact `SKILL.md` centered on API-surface selection.
- [x] Draft `references/api-selection.md` with the first decision tree:
  - read-only snapshot -> `Info`
  - signed state change -> `Exchange`
  - real-time stream -> `Subscription`
- [x] Draft `references/exchange-returns.md` with action-result envelopes and mixed-status handling.
- [x] Draft `references/signing.md` with L1 vs user-signed distinctions.
- [x] Add eval prompts that test wrong-surface failure cases.

## Sources reviewed

### Agent Skills

- [Agent Skills home](https://agentskills.io/home)
- [Specification](https://agentskills.io/specification)
- [Best practices](https://agentskills.io/skill-creation/best-practices)
- [Evaluating skills](https://agentskills.io/skill-creation/evaluating-skills)
- [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- [Adding skills support](https://agentskills.io/client-implementation/adding-skills-support)
- Cloned repo: `https://github.com/agentskills/agentskills`

### Hyperliquid official

- [Official docs](https://hyperliquid.gitbook.io/hyperliquid-docs)
- [API overview](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)
- [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [WebSocket docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket)
- [Signing](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing)
- [Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Rate limits and user limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)
- [Error responses](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses)
- Cloned repo: `https://github.com/hyperliquid-dex/hyperliquid-python-sdk`

### Hyperliquid community TypeScript SDK

- [GitHub repo](https://github.com/nktkas/hyperliquid)
- [GitBook docs](https://nktkas.gitbook.io/hyperliquid)
- local clone docs inspected:
  - `README.md`
  - `docs/clients.md`
  - `docs/transports.md`
  - `docs/signing.md`
  - `docs/error-handling.md`
