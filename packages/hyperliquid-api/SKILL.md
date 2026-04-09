---
name: hyperliquid-api
description: Use this skill when the user needs to work with the Hyperliquid API, Hyperliquid SDKs, common request and response shapes, signing, WebSocket subscriptions, rate limits, or when they ask which Hyperliquid API surface to use for a task. Especially use it when correctness about API-surface selection, core return patterns, action results, signing mode, or transport choice matters.
license: Proprietary to HypeTerminal workspace unless replaced before publishing
compatibility: Designed for Agent Skills-compatible clients such as Codex and Claude Code. Requires filesystem access to bundled references; network access may be needed if live verification is requested.
---

# Hyperliquid API Skill

Use this skill to choose the correct Hyperliquid API surface and avoid guessing about request or response behavior.

## Default decision rules

1. If the task is read-only, start with `Info`.
2. If the task changes state, places trades, transfers funds, or configures the account, use `Exchange`.
3. If the task needs live updates or streaming, use `Subscription`.
4. If the task mentions low latency, streaming, or continuous updates, consider `WebSocketTransport`.
5. If the task needs simple snapshot reads or serverless-style usage, prefer `HttpTransport`.

## What to do first

1. Classify the task as `Info`, `Exchange`, or `Subscription`.
2. State that classification explicitly in your reasoning or answer.
3. Load only the reference file needed for that task:
   - `references/api-selection.md` for surface selection
   - `references/method-index.md` for method-family coverage and fast routing to the right surface
   - `references/info-returns.md` for read-only request/response shapes
   - `references/exchange-returns.md` for action results and status envelopes
   - `references/subscriptions.md` for stream payloads and transport behavior
   - `references/signing.md` for any signed action
   - `references/rate-limits.md` for throughput, batching, or congestion questions
   - `references/error-handling.md` for mixed statuses, API rejection, or transport failures

## High-value gotchas

- Do not treat all Hyperliquid writes as the same signing flow. Some are L1 actions and some are user-signed actions.
- Do not describe `Exchange` responses as a single boolean success unless the specific method guarantees that. Order-like actions can return mixed per-item statuses.
- Do not recommend WebSocket only for subscriptions. It can also matter for lower-latency request patterns.
- Do not assume rate limits are only IP-based. Address-based action limits also matter.
- Do not dump all method details from memory. Load the targeted reference file instead.
- If the user asks about an exact method-specific return shape that is not covered by the bundled examples, say that you are giving the common pattern and verify the exact method against the official docs or the typed TypeScript SDK before claiming full certainty.

## Output expectations

When advising on Hyperliquid API usage:

1. Name the API surface first.
2. Name the transport if it matters.
3. Describe the return shape in plain language.
4. Call out signing requirements for `Exchange`.
5. Mention important caveats only if they materially affect the task.

## Source priority

Use sources in this order:

1. Official Hyperliquid docs for protocol rules.
2. Typed community TypeScript SDK for precise request/response and error-shape understanding.
3. Official Hyperliquid Python SDK for canonical action flows and examples.

If sources differ, prefer official protocol docs over SDK convenience behavior. For exact return shapes, prefer the typed TypeScript SDK over the Python SDK.
