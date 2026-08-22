# API wallet redesign — verification and delivery notes

Last verified: 2026-08-13

## Scope decisions

- The repository did not have an API wallet management page or route before this change. This page is being built from scratch.
- The task template did not provide an existing public route. The new route is `/api-wallet`; there is therefore no legacy route to preserve or redirect.
- The only existing navigation placeholder was the disabled desktop More-menu item `API & Subaccounts`. It had no click handler or route. It is replaced with the live `API Wallet` entry in the same menu position. The mobile navigation drawer receives the corresponding entry after `Referrals`; the trading terminal's three-item mobile bottom navigation is intentionally unchanged.
- Existing trading Agent onboarding, `Link mobile device`, `MobileAgentSyncModal`, and `/mobile-agent-sync` remain intact. They are active signing/session flows, not an old version of this page.
- The design HTML and its runtime are specification references only. No implementation code is copied from them.

## Sources and precedence

1. Hyperliquid's current documented protocol behavior is the hard constraint.
2. The project's pinned `@nktkas/hyperliquid@0.33.3` types and the existing Hyperliquid integration layer determine the callable surface.
3. The handoff README determines product intent where it does not conflict with the first two sources.
4. The design HTML determines composition and interaction presentation; the handoff tokens determine visual semantics.

Primary sources:

- [Hyperliquid exchange endpoint — approve an API wallet](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#approve-an-api-wallet)
- [Hyperliquid nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Hyperliquid signing](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing)
- [Hyperliquid API-wallet page](https://app.hyperliquid.xyz/API) (current production behavior inspected 2026-08-13; build version `2026-08-12-0a0d15280`)
- [`@nktkas/hyperliquid` v0.33.3 `approveAgent`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/exchange/_methods/approveAgent.ts)
- [`@nktkas/hyperliquid` v0.33.3 `extraAgents`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/extraAgents.ts)
- [`@nktkas/hyperliquid` v0.33.3 Agent-wallet guide](https://github.com/nktkas/hyperliquid/blob/v0.33.3/docs/guides/agent-wallets-and-vaults.md)

## 1. Page-state comparison

| Handoff page state | Previous API-wallet page | Existing reusable infrastructure | Implementation decision |
| --- | --- | --- | --- |
| Normal | Not implemented | `useInfo`, Table/Card primitives, copy/toast hook | Add SDK-backed list with sortable name, address copy, validity status, and deactivation action. |
| Empty list | Not implemented | Empty-state pattern used by Referrals | Add while retaining the full page header, authorization form, and list heading. |
| Loading | Not implemented | TanStack Query pending state and project skeleton conventions | Add a non-interactive form plus list skeleton. Authorization and row actions cannot run. |
| `extraAgents` error | Not implemented | TanStack Query error/refetch and project alert conventions | Add fail-closed error state with read-only retry. Never interpret an error as an empty list. |
| Wallet disconnected | Not implemented | `useWalletSession` and `useReconnectWallet` | Add the complete page structure. The primary CTA reconnects through the existing wallet flow; no connection logic is duplicated. |
| Non-master / non-signing session | Not implemented | `sessionMode`, `hasWalletAccess`, exact-wallet signing checks | Add a visible identity warning and read-only list. Authorization and deactivation remain disabled. An Agent-only owner session is classified here, not as proof that the master signer is active. |

### State change list

| Classification | Items |
| --- | --- |
| Add | All six page states; page-state derivation module; normal/empty/loading/error/disconnected/non-master tests. |
| Modify | Replace only the disabled desktop `API & Subaccounts` placeholder; add the matching mobile drawer entry; update navigation tests and i18n catalogs. |
| Retire | The disabled `API & Subaccounts` label only. It had no route, click handler, or runtime consumer. |
| Preserve | `/mobile-agent-sync`, Mobile Agent reset/revocation, trading Agent registration, first-use onboarding, and every existing entry into those flows. |

Repository evidence checked before implementation:

- `apps/terminal/src/components/trade/header/top-nav.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-bottom-nav.tsx`
- `apps/terminal/src/routes/mobile-agent-sync.tsx`
- `apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx`
- `packages/hl-react/src/signing/use-agent-registration.ts`

## 2. SDK comparison

| Concern | Handoff README / design runtime | Project integration layer | Official or pinned-SDK behavior | Decision |
| --- | --- | --- | --- | --- |
| List query | `extraAgents` is the source of truth | `useInfo("extraAgents", { user })` in `@gatu/hl-react` | Accepts the master or subaccount address; returns `{ address, name, validUntil: number \| null }[]` | Use the existing `useInfo` hook with the selected account address. Never query with the Agent address. |
| Approval call | `approveAgent(agentName, agentAddress, validUntil)` | `useExplicitAgentApproval` delegates to the registered user-signed `approveAgent` client | v0.33.3 accepts only `agentAddress` and optional `agentName`; there is no `validUntil` property | Call only the existing approval hook. Encode expiry in `agentName` as `<base> valid_until <epoch-ms>`. |
| Signing identity | Requires the main account | `approveAgent` is registered as a user-client method; external and embedded-wallet paths fail closed on account mismatch | `approveAgent` is a user-signed EIP-712 action | Require `hasWalletAccess`, the master address, and a case-insensitive exact match before enabling an action. Do not create a signer in the page. |
| Name length | 2–24 characters | Pinned SDK validates the base name after removing the expiry suffix | Maximum base-name length is 16; empty is reserved for the unnamed Agent | Keep the product's conservative ASCII rule and two-character minimum, but change the maximum to 16. |
| Name characters | Letters, digits, `_`, `-` | No additional project restriction | Protocol/SDK does not document this regex | Retain it explicitly as a Gatu product validation rule, not a protocol claim. |
| Duplicate name | Reject duplicate names | Existing Mobile verification treats name as identity | A new named approval with the same base name deregisters/replaces the old Agent | Block duplicates during creation because replacement is destructive. Use deliberate same-name replacement only for deactivation. |
| Agent count | Fixed maximum of five | No project helper establishes a fixed five-slot account limit | Official endpoint documents one unnamed Agent, up to three named Agents, plus two named slots per subaccount | Remove the fixed `5` validation and denominator. Show the returned count; let Hyperliquid enforce the account-specific capacity and surface its exact error. |
| Expiry choices | 30 days / 180 days / never | Existing Mobile Agent encodes a finite expiry suffix | The pinned guide documents a default finite lifetime and custom expiry up to 180 days. Omitting the suffix is not a documented “forever” named Agent contract | Offer finite 30/90/180-day choices. Do not offer “never”. Render `validUntil: null` honestly if the API returns it. |
| Deactivation / removal | Set `validUntil` in the past; the design note also says to clear `agentAddress` | The approval hook accepts the SDK's `agentAddress`/`agentName` shape. The separate Mobile reset flow uses a short-lived replacement for its own lifecycle | There is no `validUntil` request property. The current official API page sends the zero address plus the existing exact name; the documented same-name approval semantics deregister the old named Agent. The SDK accepts the zero address as a valid 42-character address | Call `approveAgent({ agentAddress: zeroAddress, agentName: exactExistingName })`. Treat “clear” as the zero address, never an empty string. Verify that the old exact name/address tuple disappears. Do not copy the Mobile-specific replacement strategy. |
| Retry | “Can retry” / repeated removal is “idempotent” | Existing Mobile flow retains an ambiguous operation and performs read-only verification | A signed request can succeed even when the client loses the response; SDK tests also account for pending Agent removal | Never automatically replay. After an ambiguous result, call only `extraAgents` until the exact outcome is known; require a new explicit review before any later signed retry. |
| Approval reconciliation | New address exists and `validUntil` matches | Existing `verifyExpectedMobileAgent` compares name, address, and expiry | `extraAgents` separates the parsed base name and `validUntil` | Require the exact address, base name, and expiry tuple before revealing the private key. |
| Deactivation reconciliation | Old address disappears | The page can refetch through the existing `extraAgents` hook | Same-name zero-address approval deregisters the prior named Agent | Require the old exact name/address tuple to disappear. A missing/failed snapshot is never success. |
| Response/hash | Unknown result should include a transaction hash | Existing mutation returns the SDK response | `approveAgent` returns `{ status: "ok", response: { type: "default" } }`; it does not return a transaction hash | Do not invent a hash. Show the public Agent address/name as the verification reference and explicitly state that this action has no transaction hash in the SDK response. |
| Data sources | Design developer note adds `userFees` | No integration path uses `userFees` for Agent membership | `extraAgents` contains the list fields needed by this page | Remove `userFees` from the mapping; it is not a list or approval reconciliation source. |
| Private key | Generated/downloaded locally; platform does not store it | Trading onboarding storage contains a different, app-owned trading Agent and is not suitable for exported keys | Agent approval sends only the public address | Generate with client-side `viem` only. Keep the candidate secret in short-lived React memory, never Query/storage/URL/log/toast/analytics/backend. Reveal it only after exact reconciliation, require an explicit saved acknowledgement, then clear it. |
| Agent capability wording | “Can order/cancel/change leverage; cannot withdraw, transfer, or change permissions” | The registry routes master-only user-signed methods to the user client, but several L1 transfer/account actions remain Agent-signed | API wallets sign delegated L1 actions; approval has no per-action scope parameter | Replace the absolute claim. State that typical uses include trading, that approval is not scope-limited, and that master-only user-signed actions such as withdrawals and external sends still require the master wallet. |

### Integration-layer files checked

- `packages/hl-react/src/registries/exchange.ts`
- `packages/hl-react/src/hooks/useExchange.ts`
- `packages/hl-react/src/hooks/useInfo.ts`
- `packages/hl-react/src/hooks/useClients.ts`
- `packages/hl-react/src/wallet.ts`
- `packages/hl-react/src/signing/mobile-agent.ts`
- `apps/terminal/src/hooks/wallet/use-explicit-agent-approval.ts`
- `apps/terminal/src/hooks/wallet/use-wallet-session.ts`
- `apps/terminal/src/lib/wallet/privy-agent-signer.ts`

## 3. Token comparison

The handoff source is `designs/Gatu标志加载动画/tokens.json`. The project's theme source is `apps/terminal/src/styles.css`, with shared radius primitives in `packages/ui/src/globals.css`. Existing semantic tokens are reused whenever their meaning matches. New entries are page-scoped semantic tokens in `styles.css`; no component owns color literals or repeated geometry constants.

| Handoff token/group | Handoff meaning | Project token or utility | Decision |
| --- | --- | --- | --- |
| `color.text.primary` | Primary text | `market-close-fg` / `fg` | Reuse. |
| `color.text.secondary` | Secondary text | `market-close-muted` / `fg-muted` | Reuse. |
| `color.text.tertiary` | Tertiary text/icon | `market-close-subtle` / `trading-panel-subtle` | Reuse. |
| `color.text.disabled` | Disabled text/control | `fg-disabled`, `trading-panel-on-disabled` | Reuse. |
| `color.text.inverse` | Text on primary/danger controls | `market-close-on-control`, `fg-inverse` | Reuse. |
| `color.border.default` | Card/list border | `market-close-stroke-card` | Reuse. |
| `color.border.input` | Input/select border | `market-close-stroke-input` | Reuse. |
| `color.border.checkbox` | Checkbox/dashed helper border | `market-close-stroke-control` | Reuse. |
| `color.border.divider` | Row divider | `trading-panel-stroke-row` | Reuse. |
| `color.border.dangerSubtle` | Destructive outline | `stroke-error-weak` | Reuse theme semantic rather than the light literal. |
| `color.surface.page` | Page canvas | `grid-container` | Reuse; it already has the required light/dark canvas semantics. |
| `color.surface.card` | Page panel/modal | `surface` / `modal` | Reuse. |
| `color.surface.sunken` | Inset notice/review surface | `market-close-card` / `fill-weak` | Reuse. |
| `color.surface.sunkenAlt` | Alternate inset surface | `fill-weaker` | Reuse. |
| `color.surface.hover` | Hovered row/control | `market-close-hover` / `fill-hover` | Reuse. |
| `color.surface.chipNeutral` | Neutral badge/skeleton | `fill-weak` | Reuse. |
| `color.surface.dark` | Primary neutral control | `market-close-control` | Reuse semantic control token so dark mode remains legible. |
| `color.surface.deviceBezel` | Design-only phone frame | None required at runtime | Do not implement the presentation-only device frame. |
| `color.semantic.up/down/warning` | Success/danger/warning | `market-close-success/danger/warning` | Reuse. |
| `color.semantic.upSubtle/downSubtle/warningSubtle` | Status badge backgrounds | `success-soft/error-soft/warning-soft` | Reuse. |
| `color.semantic.*OnDark` | Fixed inverse artwork colors | Position-share tokens | Not used by this page. |
| `color.disabledFill.*` | Disabled CTA fills | `trading-panel-*-disabled-fill` | Reuse the neutral variant for this neutral action page. |
| `color.scrim` | Modal/drawer scrim | `scrim` / `trading-panel-scrim` | Reuse. |
| `color.depthBar.*` | Order-book depth | Order-book tokens | Not used by this page. |
| `typography.fontFamily` | IBM Plex Sans | `font-market-close` | Reuse. |
| `typography.size` | 10/11/12/13/14/15/16/17/20/22 scale | Existing `text-3xs` through `text-lg`; `text-lg` is the exact 20px page title, while the 17px modal title has no exact utility | Reuse the page-title utility and add only the modal-title semantic size. |
| `typography.weight` | 400/500/600/700 | Tailwind font tokens | Reuse. |
| `typography.rules.tabularNums` | Numeric alignment | `tabular-nums` plus explicit alignment | Reuse. |
| `typography.rules.nowrap` | Short-label wrapping | `whitespace-nowrap` | Reuse. |
| `typography.rules.mobileInputMin` | iOS zoom prevention | Mobile form input uses the existing 16px `text-base` | Reuse. |
| `radius.*` | Page/modal/card/input/chip/badge geometry | Shared radius primitives are globally scaled and do not equal the handoff's physical values | Add page-scoped semantic radius tokens, including the desktop page's 14px radius; reference them through CSS variables, not component literals. |
| `space.*` | Page/card/mobile gaps and padding | Project 4px spacing scale | Reuse spacing utilities; add semantic page/content padding only where the design value is structural. |
| `size.desktopViewport` / `size.desktopContent` | 1440px frame / 1360px content | No equivalent semantic maxima | Add `--api-wallet-frame-max` and `--api-wallet-content-max`; the desktop page also uses the design reference's tokenized 700px minimum panel height. |
| `size.mobileBreakpoint` | Inclusive 1000px | `MOBILE_BREAKPOINT_PX` and existing `min-[1001px]` utilities | Reuse exactly. |
| `size.navHeight` | 56px | Existing `APP_HEADER_HEIGHT_CLASS` / `h-14` | Reuse. |
| `size.tableRowMinHeight` | 46px | No equivalent semantic row token | Add `--api-wallet-row-min-height`. |
| `size.touchTargetMin` | 44px | Existing `touch-target`; page token for composed controls | Reuse/add semantic reference where composition needs an explicit minimum. |
| `motion.hover/buttonFill/disclosure/longPressConfirm` | Allowed motion durations | Existing 120ms/150ms/200ms patterns | Reuse via page semantic motion tokens; override the shared Button's active scale within page wrappers. |
| `motion.forbidden` | No ripple/bounce/scale | Shared Button normally scales on active | Apply a page wrapper class that forces `active:scale-100`; do not alter the shared Button. |
| `shadow.card/modal` | Page panel/action overlay elevation | No correctly named page semantic | Add page-scoped card and modal shadow tokens with dark-theme mappings. |
| `shadow.dropdown/floatingPanel` | Other overlay types | Existing dropdown/overlay shadows | Not used by this page. |
| `flowStateMachine` | `input → review → awaiting → submitted → reconciling → done` and four results | No API-wallet module existed | Implement in a pure exhaustive module and test every transition and locked stage. |

## Specification conflicts and resolved behavior

| Conflict | Resolution |
| --- | --- |
| README simplifies the action flow to Review → signing → submit → result, while the AI guide and tokens require `input` and `reconciling`. | The page form is `input`; the modal implements review, awaiting, submitted, explicit read-only reconciliation, and done. |
| The HTML runtime omits `reconciling`. | Add a visible verification step; document this visual difference. |
| README requires one-time private-key display and saved confirmation, while the HTML only shows a re-download row. | Follow the stricter README: masked one-time reveal, explicit download, explicit saved acknowledgement, and memory clearing on completion/identity change. |
| The generic unknown-result rule asks for a transaction hash, but `approveAgent` returns none. | Show no fabricated hash. Show the public Agent tuple as the reconciliation reference and explain the SDK limitation. |
| Handoff says removal uses a past expiry. | Follow current official behavior: same exact name plus `zeroAddress`, with no expiry suffix. Keep the destructive UI label “Remove” and verify disappearance before success. |
| Handoff capability copy overstates protocol restrictions. | Use precise master-only versus Agent-signed wording and link to the official API-wallet documentation. |

## Visual and interaction differences from the design reference

- Production does not render the design document's page-state and result chips; test fixtures trigger those states without exposing mock controls to users.
- Mobile uses the project-wide inclusive 1000px breakpoint. Acceptance screenshots use the requested 375px viewport, while the design canvas is 390px.
- The runtime phone bezel is presentation-only and is not part of the application page.
- The action progress indicator includes the required reconciliation step.
- Loading and error fixtures retain the complete, disabled authorization form so every non-operable state can be checked for both disabled behavior and styling; the HTML runtime hides that form.
- Unsupported “never expires”, fixed `5` capacity, 24-character names, absolute transfer/permission claims, and past-expiry deletion are replaced with official behavior.
- Removal sends the zero address with the exact original `extraAgents` name. Historical names are not normalized or revalidated before removal.
- Development screenshot fixtures isolate the page from live application chrome so a mock account state cannot contradict a real disconnected header. Production always renders the normal desktop/mobile shell.
- The protocol offers no compare-and-delete form of `approveAgent`. A fresh exact-tuple preflight closes the review-to-sign stale window as far as the API allows, but another client can still replace a same-name Agent after preflight and before the signed request is processed.
- External-wallet prompts cannot always be cancelled after dispatch. An owner/network change immediately hides and clears the candidate key and ignores late client results; a late on-chain approval can therefore leave an Agent whose private key is intentionally unrecoverable and must be removed from the list.

## Delivery verification

The repository uses pnpm, so the task's npm-shaped commands were run through their repository-native pnpm equivalents.

### Screenshot fixture triggers

Fixtures are development-only and are ignored by production builds. Open `/api-wallet?fixture=<value>`; each root has a stable `data-api-wallet-state` attribute. No fixture contains a private key or a real account address.

| Page state | Fixture value | DOM state | Triggered evidence |
| --- | --- | --- | --- |
| Normal | `normal` | `normal` | Three placeholder Agents cover active, expiring, and expired rows. |
| Empty list | `empty` | `empty` | Definitive empty `extraAgents` snapshot. |
| Loading | `loading` | `loading` | Disabled form plus list skeleton. |
| `extraAgents` error | `error` | `error` | Disabled form plus fail-closed retry message. Screenshot filename uses `extra-agents-error`. |
| Wallet disconnected | `disconnected` | `disconnected` | No account tuple; existing reconnect CTA is shown. |
| Non-master | `non-master` | `nonMaster` | Owner rows remain read-only and all signing actions are disabled. |

The 48-file matrix is under `docs/api-wallet-redesign/screenshots/{en,zh}/{light,dark}/{desktop-1440x900,mobile-375x844}/`. Desktop captures use a 1440×900 viewport. Mobile captures start at a 375×844 viewport and use full-page output so no cards are cut off. Theme and locale are set through the existing `global-settings-v2` and `locale-v1` persisted settings before navigation; fonts and two animation frames settle before capture, and transitions are disabled. The screenshot directory is an explicit delivery artifact outside application source/tests/notes.

The page-state matrix is complemented by unit tests rather than mock controls in production UI: the pure state machine exhaustively covers `input → review → awaiting → submitted → reconciling → done`, all four results, retries, illegal transitions, and locked stages; controller tests cover signed-call preflight, exact reconciliation, ambiguous read-only verification, identity changes, and credential delivery.

### Changed files

- Page and page-only modules: `apps/terminal/src/components/api-wallet/` (page shell, live controller, development fixtures, view/form/list/action modal/credential/copy components, pure page/action state, reconciliation, and credential helper).
- Route: `apps/terminal/src/routes/api-wallet.tsx` and generated `apps/terminal/src/routeTree.gen.ts`.
- Navigation: `apps/terminal/src/components/trade/header/top-nav.tsx` and `apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx`.
- Page semantic tokens only: additions in `apps/terminal/src/styles.css`; no existing token or global/shared-component behavior changed.
- i18n: `apps/terminal/src/locales/{en,zh,hi,es,fr,ar}/messages.po`. All 100 API-wallet messages have Chinese translations; English uses source strings; the other configured locales retain the project's English fallback convention. The retired `API & Subaccounts` label is obsolete.
- Tests: `api-wallet-state.test.ts`, `api-wallet-action-state.test.ts`, `api-wallet-reconciliation.test.ts`, `api-wallet-credentials.test.ts`, `api-wallet-action-modal.test.tsx`, `use-api-wallet-controller.test.tsx`, `mobile-nav-drawer.test.tsx`, and the updated `top-nav.test.tsx` under `apps/terminal/src/lib/tests/`.
- Delivery: this notes file and the 48 PNG files under `docs/api-wallet-redesign/screenshots/`.
- Build-budget exception: `scripts/check-client-bundle-budget.mjs`. A clean production build added 47,198 gzip bytes across the new route and localized catalogs, beyond the prior 10,000-byte total allowance. Following the repository's existing exact-baseline convention, the total baseline is refreshed from `2,828,991` to `2,876,189` while retaining the 10,000-byte allowance; the new `api-wallet` route chunk also receives its own tighter 17,967-byte baseline plus 2,000-byte allowance. No build logic or existing surface budget changed.
- Dependencies: none added.

No standalone TypeScript example is rendered by the page. The actual SDK parameter examples are the typed production mapping functions and controller calls, so `tsc --noEmit` checks them directly rather than leaving an unchecked display string.

### Validation record

| Check | Result |
| --- | --- |
| Task TypeScript/TSX Biome check | Passed. |
| `pnpm typecheck` (`@gatu/hl-react`, `@gatu/ui`, `@gatu/terminal`) | Passed. |
| Targeted API-wallet/navigation Vitest suite | Passed: 145/145 tests across nine files, including all six page states and every pure action-state transition. |
| `pnpm i18n:extract` (second run) / `pnpm i18n:compile` | Passed and extract is idempotent. |
| 48 screenshot files | Passed automated count/state/locale/theme checks and four representative visual inspections. |
| `pnpm lint` | Repository baseline blocker outside the authorized surface: committed `apps/terminal/src/lib/markdown.tsx` has three existing `noArrayIndexKey` errors; committed `apps/terminal/src/lib/lazy.ts` has one existing explicit-`any` warning. No task file has a Biome finding. |
| `pnpm build` | Passed from a clean `.output`: client + SSR/Nitro builds, 326-chunk static-cycle check, total bundle budget, existing surface budgets, and the new `api-wallet` 17,964-byte gzip chunk check. Existing third-party/deprecation warnings remain non-fatal. |
| `pnpm test` | Passed: 337 files passed, one existing soak file skipped; 3,010 tests passed and one skipped (3,011 total). |

### Regression confirmation

| Changed or retired item | Regression confirmation |
| --- | --- |
| Disabled desktop `API & Subaccounts` placeholder | Replaced only in its former More-menu slot; wide and compact menus navigate to `/api-wallet`, expose active state, and retain the disabled Statistics item. |
| New mobile drawer entry | Appears immediately after Referrals, closes the drawer on selection, and exposes `aria-current` on `/api-wallet`. Mobile bottom navigation is unchanged. |
| Six page states | Pure derivation tests cover all six. Every non-operable state disables authorization/removal; loading/error remain visibly disabled rather than becoming empty/success. |
| Wallet connection/signing | Reuses `useWalletSession`, `useReconnectWallet`, `useActiveAgentOwner`, and the existing explicit approval hook. Agent-only sessions never query `extraAgents` with the Agent address, including missing or wrong-environment owner metadata. |
| Hyperliquid write path | All writes call the existing integration hook. Tests assert public-only `approveAgent` parameters, zero-address removal, exact-name preservation, one signed call, and no second signing during ambiguous verification. |
| Private-key boundary | Candidate secrets remain only in controller memory; tests cover reveal only after exact reconciliation, no key in approval parameters, identity-change cleanup, download/acknowledgement gating, finish cleanup, and Blob URL cleanup on download failure/success. |
| Snapshot integrity | Runtime validation rejects malformed `extraAgents` data before render, preflight, or reconciliation; missing/error/malformed snapshots remain non-operable and never count as success. |
| Existing Mobile Agent flows | `/mobile-agent-sync`, `MobileAgentSyncModal`, trading Agent registration/storage, and onboarding files were not modified. Their isolated route suite remains green. |
| Shared UI/global behavior | Shared Button/Card/Select/Modal implementations and existing global token values were not changed; page wrappers add variants and suppress scale motion locally. |
