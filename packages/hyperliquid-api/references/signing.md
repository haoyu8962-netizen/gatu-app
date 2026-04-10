# Signing

Use this file for any `Exchange` action or when the user asks about nonces, wallets, or signatures.

## Core rule

Hyperliquid signing is not a single uniform flow.

There are two major categories:

- L1 actions
- user-signed actions

## L1 actions

Typical use:

- trading and position-management style actions

Characteristics:

- signed through the L1 action flow
- use nonce handling
- can be sensitive to vault address and expiration context

## User-signed actions

Typical use:

- some fund movement or account-security style actions

Characteristics:

- signed directly as user-signed typed data
- use a different signing model than L1 actions

## Advice

- Never say "sign the exchange request" without naming which flow applies.
- If the method changes funds, agent approval, or account configuration, verify whether it is user-signed before answering.
- Mention nonces when explaining replay protection or request validity.
- Mention expiration only when it materially applies to the action under discussion.
