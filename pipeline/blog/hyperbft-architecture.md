---
status: pending
tier: 3
tag: 🧭
created: 2026-05-03
---

# HyperBFT explained without the marketing

## Angle

Most architecture posts parrot the spec sheet: 200k TPS, 70ms finality, blah. Write the *honest* one — what's centralized, why 21 validators is fine (and isn't), the difference between block time and order finality, and where HotStuff variants typically break under adversarial conditions.

## Why now

- Long-tail SEO: "hyperliquid blockchain", "hyperliquid architecture" both rising
- 21 validators (up from 16 at launch) — worth contextualizing
- CleanSky-style architecture deep dives are getting traction; differentiate with skepticism

## Key evidence

- Pipelined HotStuff variant
- ~70ms single-slot finality
- 200k orders/sec on HyperCore
- 21 validators (was 16 at mainnet launch)
- HyperCore + HyperEVM share consensus + blocks; independent state

## What to be skeptical about

- Validator set size vs decentralization claims (compare ETH's 1M+, SOL's 1500+)
- Geographic distribution of validators (is it actually diverse?)
- Liveness assumptions in HotStuff under network partition
- Censorship resistance — can a 2/3 validator set front-run / censor?

## Sources

- HL Docs: https://hyperliquid.gitbook.io/hyperliquid-docs
- HyperCore overview: https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/overview
- CleanSky deep dive: https://cleansky.io/blog/hyperliquid-architecture-hypercore-hyperevm-2026/
- Blockhead: https://www.blockhead.co/2025/06/05/inside-hyperliquids-technical-architecture/
- Zealynx Part 1: https://www.zealynx.io/blogs/Understanding-Hyperliquid-Architecture-HyperBFT-HyperCore-HyperEVM-Part1
- RocknBlock: https://rocknblock.io/blog/how-does-hyperliquid-work-a-technical-deep-dive

## Notes / draft scratch
