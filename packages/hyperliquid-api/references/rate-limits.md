# Rate Limits

Use this file when the user asks about throughput, congestion, retries, batching, or safe request patterns.

## Core rule

Do not explain Hyperliquid rate limiting as one global limit. Different limits apply to different channels.

## Important distinctions

### IP-based limits

- affect general request throughput

### WebSocket messaging limits

- affect messages sent over WebSocket
- relevant for post requests and subscription-heavy clients

### Address-based action limits

- apply per user address for actions
- separate from read-only info requests
- sub-accounts are treated as separate users

## Important operational notes

- address-based limits still allow cancellation more generously than normal actions
- batched requests count differently for IP-based and address-based accounting
- under congestion, unnecessary resend behavior can hurt

## Advice

- if the user asks about reads, clarify that address-based action limits do not apply the same way
- if the user asks about batched orders or cancels, explain that per-item accounting can still matter
- if the user asks about latency-sensitive trading, mention congestion behavior and resend discipline
