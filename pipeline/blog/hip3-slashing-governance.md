---
status: pending
tier: 3
tag: 🧭
created: 2026-05-03
---

# HIP-3 slashing — the most interesting governance design in years

## Angle

Validators stake-vote to slash HIP-3 deployers running malicious markets. The slashed stake stays locked for 30 days even after all of the deployer's perps halt. This is novel, lightweight, decentralized listing-committee governance — and almost nobody has analyzed it as a governance pattern (everyone covers it as "another HIP-3 detail").

## Why now

- HIP-3 has been live since Oct 2025 — long enough for first edge cases
- Governance design space is stagnant; this is genuinely fresh
- Becomes the "mental model" piece for any future builder-deployer DEX

## Key evidence

- Stake bond: 500k HYPE per deployer
- Slashing: validator stake-weighted vote
- Cooldown: 30 days post-halt
- Soft enforcement: validators don't pre-approve markets, only react

## Frame as governance design pattern

- Compare to:
  - Token-curated registries (failed)
  - Optimistic rollup fraud proofs (similar shape!)
  - DAO listing votes (slow + politicized)
- The breakthrough: economic skin-in-the-game + reactive validator oversight + market-driven listing

## Sources

- HL Docs HIP-3: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals
- HypeRPC explainer: https://hyperpc.app/blog/what-is-hip-3-hyperliquid
- Datawallet: https://www.datawallet.com/crypto/hip-3-explained-hyperliquid-upgrade
- FalconX: https://www.falconx.io/newsroom/the-transformational-potential-of-hyperliquids-hip-3
- MONOLITH analysis: https://medium.com/@monolith.vc/the-impact-of-hip-3-on-hyperliquid-and-hype-bae2d7fd72b7

## Notes / draft scratch
