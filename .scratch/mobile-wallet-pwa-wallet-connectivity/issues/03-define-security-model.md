# Define Security Model

Status: done

## Summary

Define the security guarantees for mobile agent storage, QR transfer, expiration, revocation, and account-action gating.

## Recommended Decision

Treat the mobile agent as a high-value trading key. It cannot withdraw funds, but it can place/cancel/modify trades, so storage and transfer should be hardened.

Use one-QR encrypted payload plus one-time pairing code for v1. Do not use a third-party relay.

Use a single named Hyperliquid mobile agent slot with base name `Mobile`. The approved `agentName` sent to Hyperliquid must be `Mobile valid_until <validUntilMs>`, where the base name stays stable and the suffix carries the expiry timestamp. The base name is intentionally under Hyperliquid's 16-character named-agent base limit.

## Acceptance Criteria

- QR payloads do not leak through server logs: **resolved by URL fragments only, no relay, and no secret-bearing query/path fields**.
- Imported secrets are removed from the URL/history immediately: **resolved by mandatory `history.replaceState` cleanup before validation/decryption side effects**.
- Agent keys expire or are rotated on a defined schedule: **resolved by 30-day mobile agent validity plus reset/relink rotation**.
- Users can reset mobile access: **resolved by local clear on the phone and main-wallet reset/replacement from desktop**.
- CSP and third-party script constraints are reviewed for authenticated trading pages: **resolved by the CSP checklist below**.
- Payload encryption uses browser-native WebCrypto: **resolved by PBKDF2-SHA-256 plus AES-256-GCM via `crypto.subtle`**.
- Pairing code policy is defined: **resolved as a 64-bit WebCrypto-generated code, 10-minute expiry, five local attempts**.
- Agent secret storage policy is defined for desktop and mobile: **resolved by storage rules below**.
- Revocation/rotation behavior is defined for replacing older mobile agents: **resolved by the stable `Mobile` named slot rules below**.

## Security Invariants

- The mobile agent private key is a secret. It may appear only inside encrypted QR plaintext, in memory during generation/import, and in the chosen local agent store after successful import.
- Raw agent private keys must never be written to URL query strings, URL paths, analytics events, logs, React errors, toast descriptions, clipboard text, or server requests.
- The QR import URL must use a fragment: `https://<app-origin>/mobile-agent-sync#ht-mobile-sync=<base64url-envelope>`. The parser must reject sync payloads supplied through `search`, path segments, or any fragment key other than `ht-mobile-sync`.
- The fragment is only a transport container. It must be copied into memory and removed with `history.replaceState(null, "", cleanUrl)` before decrypting, writing storage, fetching Hyperliquid state, or emitting telemetry.
- The pairing code is not included in the QR payload and is never sent to a server.
- The sync flow is relayless. There is no server-side pairing session, so "one-time" means one active desktop-generated pairing at a time plus local import cleanup; it is not a server-enforced single-use guarantee against copied screenshots. Security relies on encryption, 64-bit pairing-code entropy, short QR expiry, and agent rotation.
- Mobile trading must verify the imported agent against Hyperliquid `extraAgents` before enabling order entry. Local storage alone is not sufficient proof of authorization.
- Withdrawals, deposits, transfers, builder fee approval, agent approval, reset/relink, and any future sensitive action must require the main wallet. The mobile agent can be used only for routine trading actions already intended for agent signing.

## QR URL And Envelope

The QR code encodes exactly this URL form:

```text
https://<app-origin>/mobile-agent-sync#ht-mobile-sync=<base64url(JSON.stringify(envelope))>
```

`envelope` is public metadata plus ciphertext. It must not contain `agentPrivateKey`.

```json
{
  "v": 1,
  "type": "hypeterminal.mobile-agent-sync",
  "syncId": "<base64url 16 random bytes>",
  "createdAtMs": 1779364227000,
  "expiresAtMs": 1779364827000,
  "kdf": {
    "name": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 310000,
    "salt": "<base64url 16 random bytes>"
  },
  "cipher": {
    "name": "AES-GCM",
    "length": 256,
    "iv": "<base64url 12 random bytes>",
    "tagLength": 128
  },
  "ciphertext": "<base64url AES-GCM ciphertext plus tag>"
}
```

The decrypted plaintext is UTF-8 JSON:

```json
{
  "v": 1,
  "type": "hypeterminal.mobile-agent",
  "syncId": "<same syncId as envelope>",
  "issuerOrigin": "https://app.hypeterminal.com",
  "env": "Mainnet",
  "userAddress": "0x...",
  "agentAddress": "0x...",
  "agentPrivateKey": "0x...",
  "agentNameBase": "Mobile",
  "agentName": "Mobile valid_until 1781956227000",
  "agentValidUntilMs": 1781956227000,
  "createdAtMs": 1779364227000,
  "expiresAtMs": 1779364827000
}
```

Validation rules:

- `v` must be `1` and `type` must match the expected string in both envelope and plaintext.
- `syncId`, `createdAtMs`, and `expiresAtMs` must match between envelope and plaintext.
- `expiresAtMs` must be no more than 10 minutes after `createdAtMs`.
- Import must reject when `Date.now() > expiresAtMs + 60_000`; the 60-second grace is only for device clock skew.
- `issuerOrigin` must equal the current app origin, except in explicit test/dev configuration where an allowlist may include localhost and staging origins.
- `env` must be `Mainnet` or `Testnet`.
- `userAddress` and `agentAddress` must be valid EVM addresses and normalized to lowercase for storage comparisons.
- `agentPrivateKey` must match `^0x[0-9a-fA-F]{64}$`, must derive `agentAddress`, and must not be accepted if derivation fails.
- `agentNameBase` must be exactly `Mobile`; `agentName` must be exactly `Mobile valid_until <agentValidUntilMs>`.
- `agentValidUntilMs` must be greater than `Date.now()` at import time and must be no more than 30 days plus 10 minutes after `createdAtMs`.

## WebCrypto Choices

Use browser-native WebCrypto only:

1. Generate the pairing code from `crypto.getRandomValues(new Uint8Array(8))`.
2. Display the code as 16 uppercase hex characters grouped as `XXXX-XXXX-XXXX-XXXX`.
3. Normalize user input by uppercasing and removing spaces/hyphens. Reject anything other than exactly 16 hex characters.
4. Import key material with `crypto.subtle.importKey("raw", utf8("HypeTerminal mobile sync v1:" + normalizedCode), "PBKDF2", false, ["deriveKey"])`.
5. Derive an AES-GCM key with `crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])`.
6. Encrypt/decrypt with `crypto.subtle.encrypt` / `crypto.subtle.decrypt` using `{ name: "AES-GCM", iv, additionalData, tagLength: 128 }`.
7. `additionalData` must be UTF-8 bytes for `HypeTerminal mobile sync envelope v1:` plus canonical JSON of the envelope fields excluding `ciphertext`. The canonical JSON function must sort object keys recursively.

All random values, salts, IVs, sync IDs, and pairing codes must come from WebCrypto. Do not use `Math.random`.

## Pairing Code Rules

- Length and entropy: 16 hex characters, 64 bits from WebCrypto.
- Display: `XXXX-XXXX-XXXX-XXXX`; use monospace styling and a copy button only for the code, not for the encrypted URL.
- Expiry: code expires when the QR payload expires, 10 minutes after creation.
- Attempts: phone import UI allows five failed decrypt/validate attempts for a single fragment, then requires rescanning a newly generated QR. This is local abuse protection, not the primary security boundary.
- Regeneration: desktop may have only one active visible pairing code at a time. Regenerating clears the previous code and QR from UI state.
- UI copy: "Enter the pairing code shown on your desktop. It unlocks mobile trading for this wallet only. Do not share it."
- Error copy must not distinguish wrong code from malformed ciphertext. Use one generic error: "Could not import this mobile trading link. Check the code or generate a new QR."

## Expiration, Reveal, And Rotation

- QR payload validity: 10 minutes.
- Mobile agent validity: 30 days from approval.
- Renewal prompt: warn the user when the mobile agent has less than 72 hours remaining; renewal requires the main wallet.
- Desktop reveal: the QR and pairing code are shown only after the main wallet signs `approveAgent` for the generated mobile agent.
- Import reveal: phone shows account/environment/agent details only after successful decrypt and schema validation.
- Trading gate: before enabling mobile trading, fetch `extraAgents` for `userAddress` and require an entry whose address matches `agentAddress`, whose base name matches `Mobile`, and whose `validUntil` is in the future.

## Storage And URL Cleanup

Desktop generation:

- Generate the mobile agent private key in memory.
- Keep the key only long enough to build the encrypted payload after `approveAgent` succeeds.
- Do not persist the mobile agent private key on desktop unless the current desktop is also importing itself as a mobile device.
- Clear in-memory generation state when the modal closes, QR expires, wallet account changes, env changes, or approval/import completes.

Mobile import:

- Read `location.hash`, copy the `ht-mobile-sync` value into memory, and immediately call `history.replaceState(null, "", location.pathname + location.search)` before decrypting.
- After successful validation, store only the final agent record needed by the agent wallet layer: env, user address, agent private key, agent public key, base name, approved `agentName`, `agentValidUntilMs`, imported timestamp, and sync ID.
- Storage may use the existing localStorage-backed agent store for v1 because the current app already persists agent private keys there. The mobile record must be schema-validated on every read and cleared on parse failure, address mismatch, env mismatch, agent expiry, or failed `extraAgents` verification.
- Do not store the encrypted QR envelope or pairing code after import.
- Never include sync fragments in recent-wallet data, diagnostics, support bundles, or persisted navigation state.

## Revocation And Reset Rules

- Relink: approving a new mobile agent uses the same base named slot `Mobile` with a new key and new `valid_until` timestamp. The old mobile key must fail verification after Hyperliquid reflects the replacement.
- Phone reset: "Reset mobile trading" on the phone clears local mobile agent storage immediately. This does not revoke a key already approved on Hyperliquid; the UI must say that full revocation requires the main wallet.
- Main-wallet reset/revoke: from desktop/main wallet, generate a throwaway private key, approve its address with `agentName` `Mobile valid_until <Date.now() + 60_000>`, do not store the throwaway key, and then refetch `extraAgents`. This replaces the previous mobile key and leaves only an inaccessible short-lived agent in the slot.
- Stale local cleanup: if local storage contains a mobile agent whose address is absent from `extraAgents`, whose `validUntil` is expired, or whose base name is not `Mobile`, clear it before trading and show a relink state.
- Account switch: if wagmi user wallet address changes, never reuse an imported mobile agent from another `userAddress`.

## CSP And Third-Party Script Checklist

Before enabling mobile sync on authenticated trading pages:

- Ensure `script-src` does not allow arbitrary remote scripts or inline scripts beyond the app's existing build requirements.
- Ensure analytics/error tooling scrubs URLs and never captures `location.hash`, pairing codes, private keys, decrypted plaintext, or storage values.
- Ensure wallet connection telemetry uses event names and connector IDs only, not full URLs.
- Prefer `Referrer-Policy: strict-origin-when-cross-origin` or stricter.
- Keep sync import code in first-party bundles only; do not let third-party scripts run before fragment cleanup on the import route.
- Add tests or manual QA evidence that a thrown import error does not include the encrypted envelope or decrypted plaintext.

## Test Matrix

- Creates a QR URL whose secret material is only in the encrypted fragment.
- Rejects any sync payload supplied in query string or path.
- Cleans `location.hash` with `history.replaceState` before decrypting or fetching.
- Decrypts a valid payload with the correct pairing code.
- Rejects wrong pairing code with the generic import error.
- Rejects expired envelope after the 10-minute validity plus 60-second skew grace.
- Rejects envelope/plaintext mismatch for `syncId`, timestamps, type, or version.
- Rejects malformed base64url, malformed JSON, unknown algorithm names, short salt, short IV, and missing ciphertext.
- Rejects `agentPrivateKey` that does not derive the declared `agentAddress`.
- Rejects wrong `issuerOrigin`, wrong `env`, wrong `userAddress`, and unsupported agent name base.
- Stores only the final mobile agent record after import.
- Clears local storage when the imported agent is absent or expired in `extraAgents`.
- Keeps withdrawals/deposits/builder fee approval/agent rotation on the main-wallet signing path.
- Replaces older mobile access on relink using the `Mobile` named slot.

## Reference Constraints

- Hyperliquid `approveAgent` accepts `agentAddress` and optional `agentName`, and the official docs note named-agent limits.
- The `@nktkas/hyperliquid` client accepts `agentName` values of the form `<base> valid_until <timestamp>` and validates the base name length after stripping that suffix.
- Existing HypeTerminal agent storage already uses localStorage-backed `{ privateKey, publicKey }` records; v1 may extend that shape for mobile metadata rather than introducing a second secret store.

## Notes

This issue is complete and unblocks issues 04 and 05. Implementation should treat this document as the source of truth for sync payload shape, crypto parameters, URL cleanup, expiry, storage, and revocation behavior.

## Codex Goal

Objective: Turn the security model into an implementation-ready checklist and update this issue with precise decisions for crypto, expiry, storage, URL handling, and revocation.

Dependencies: issues 01-02.

Allowed scope: documentation only. Do not implement product code.

Deliverables:

- Exact QR payload shape.
- Encryption/decryption algorithm and WebCrypto API choices.
- Pairing code generation and validation rules.
- Expiration and reveal rules.
- Storage and URL cleanup rules.
- Revocation/rotation rules.
- Test matrix for security-relevant behavior.

Verification:

- The issue has no open security branch left before implementation.
- The implementation issues can refer to this issue without asking new product/security questions.

Goal prompt:

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and .scratch/mobile-wallet-pwa-wallet-connectivity/issues/03-define-security-model.md. Complete the security model for the one-QR encrypted mobile sync flow. Update only markdown docs, mark the issue ready-for-agent or done when resolved, and do not implement product code.
```
