# Leaderboard, Vaults, and Staking redesign — pre-development audit

Last verified: 2026-08-13

Status: **awaiting product confirmation; no page implementation has started**.

## Scope and source precedence

This audit covers only these proposed production routes:

- `/vaults`
- `/vaults/$vaultAddress`
- `/staking`
- `/leaderboard`

The desktop and mobile designs share each route's controller and domain model. `18c` in the combined Staking/Referrals design is the existing Referrals product and is out of scope. The handoff route table mentions `/staking/validators/$validator`, but the package contains no validator-detail screen, field contract, or state specification, so that route is not approved for implementation yet.

Sources are applied in this order:

1. Hyperliquid's current official developer and product documentation is the hard behavioral constraint.
2. The project's pinned `@nktkas/hyperliquid@0.33.3` types and existing `@gatu/hl-react` integration define the callable SDK surface.
3. The delivery-package READMEs define product intent where they do not conflict with the first two sources.
4. Current production behavior at `app.hyperliquid.xyz` may fill a field/source gap only when the handoff is silent and the dependency is explicitly approved. It cannot override documented protocol behavior or the handoff's product intent and is always marked undocumented and potentially unstable.
5. The `.dc.html` files define visual composition and interaction references only. Their code and fixture values must not enter the project.

`@nktkas/hyperliquid` is the project's pinned community TypeScript SDK, not an official Hyperliquid SDK. Its v0.33.3 tag is nevertheless the exact implementation contract this repository compiles and signs against.

Primary official sources:

- [Hyperliquid Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Hyperliquid staking](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/staking)
- [Hyperliquid staking linking](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees#staking-linking)
- [Hyperliquid unstaking FAQ](https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/unstaking-and-link-staking-issues/unstaking-transfer-taking-more-than-7-days)
- [Hyperliquid legacy Vaults](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/hypercore-vaults-legacy)
- [Legacy Vault depositor rules](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/for-vault-depositors-legacy)
- [Protocol Vaults / HLP](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults)
- [Legacy Vault leader rules](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/for-vault-leaders-legacy)
- [Hyperliquid nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)

Pinned-SDK source used for the exact callable/type audit:

- [v0.33.3 `vaultDetails`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/vaultDetails.ts)
- [v0.33.3 `vaultTransfer`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/exchange/_methods/vaultTransfer.ts)
- [v0.33.3 `userVaultEquities`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/userVaultEquities.ts)
- [v0.33.3 `userNonFundingLedgerUpdates`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/userNonFundingLedgerUpdates.ts)
- [v0.33.3 `validatorSummaries`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/validatorSummaries.ts)
- [v0.33.3 `delegations`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/delegations.ts)
- [v0.33.3 `delegatorSummary`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/delegatorSummary.ts)
- [v0.33.3 `delegatorHistory`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/delegatorHistory.ts)
- [v0.33.3 `delegatorRewards`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/delegatorRewards.ts)
- [v0.33.3 `cDeposit`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/exchange/_methods/cDeposit.ts)
- [v0.33.3 `cWithdraw`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/exchange/_methods/cWithdraw.ts)
- [v0.33.3 `tokenDelegate`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/exchange/_methods/tokenDelegate.ts)
- [v0.33.3 `linkStakingUser`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/exchange/_methods/linkStakingUser.ts)

Current-production evidence, checked on 2026-08-13:

- [Vaults page](https://app.hyperliquid.xyz/vaults)
- [Staking page](https://app.hyperliquid.xyz/staking)
- [Leaderboard page](https://app.hyperliquid.xyz/leaderboard)
- [`Mainnet/vaults` stats feed](https://stats-data.hyperliquid.xyz/Mainnet/vaults), used by the official App but absent from the developer API contract
- [`Mainnet/leaderboard` stats feed](https://stats-data.hyperliquid.xyz/Mainnet/leaderboard), used by the official App but absent from the developer API contract
- [`Testnet/vaults`](https://stats-data.hyperliquid.xyz/Testnet/vaults) and [`Testnet/leaderboard`](https://stats-data.hyperliquid.xyz/Testnet/leaderboard), both responding with the same observed top-level schemas during the audit

## Delivery-package status

| Product | Design reference | Delivery checklist | Authority decision |
| --- | --- | --- | --- |
| Vaults | `designs/Gatu标志加载动画/designs/independent-products/金库 Redesign.dc.html`, sections 16a/16b/16c | `designs/Gatu标志加载动画/designs/exports/vaults/README.md` | Valid visual/product input, corrected by official legacy HyperCore Vault behavior. |
| Staking | `designs/Gatu标志加载动画/designs/independent-products/质押与推荐 Redesign.dc.html`, sections 18a/18b | `designs/Gatu标志加载动画/designs/exports/staking/README.md` | Valid visual/product input, but several action descriptions conflict with official behavior and are corrected below. |
| Leaderboard | `designs/Gatu标志加载动画/排行榜 Redesign.dc.html`, sections 22a/22b | Missing | Secondary visual reference only. It is absent from the delivery package's independent-product map and has no export README or verified field contract. |

Vaults and Staking are marked D2 in the delivery index: fields/layout are present, but their action designs do not cover the mandatory D1 state machine. The implementation must therefore add the reviewed funds-action flow rather than treating the design runtime's direct `input → done` demo as production behavior.

## 1. Mandatory module mapping

Every listed page is new; the repository currently has no matching route or page component. Existing navigation entries are disabled `Soon` placeholders with no route or click behavior.

| Design section / concern | Proposed route | Existing project surface | Proposed implementation | Status |
| --- | --- | --- | --- | --- |
| Vault list 16a | `/vaults` | No page/route | `apps/terminal/src/components/vaults/vaults-page.tsx`, `vaults-list.tsx`, `use-vaults-controller.ts`, `domain/vaults.ts`; include discover/search and official/user/deposited/leading filter states | New |
| Vault mobile list/detail 16b | Same Vault routes | `useIsMobile`, inclusive 1000px layout contract, shared Table/Card/Drawer primitives | Responsive views over the same controller/domain; no separate mobile data source | New |
| Vault detail 16c | `/vaults/$vaultAddress` | No page/route; portfolio chart is not a reusable public builder | `vault-detail-page.tsx`, detail view/chart/tabs/lockup card, `vault-action-modal.tsx`, `vault-reconciliation.ts` | New |
| Staking desktop 18a | `/staking` | No page/route | `apps/terminal/src/components/staking/staking-page.tsx`, overview/balances/validators/rewards/history views, `use-staking-controller.ts`, `domain/staking.ts` | New |
| Staking mobile 18b | `/staking` | `useIsMobile`, Adaptive Modal/Sheet conventions | Responsive views over the desktop controller/domain; validator table may scroll where the handoff requires it | New |
| Validator detail | Not approved | Handoff route table mentions it, but no section/spec exists | Defer. Do not invent fields, navigation, or a detail page. | Blocked by missing specification |
| Leaderboard desktop 22a | `/leaderboard` | No page/route/data adapter | `apps/terminal/src/components/leaderboard/leaderboard-page.tsx`, view/table/controller, `domain/leaderboard.ts` | New, conditional on undocumented feed approval |
| Leaderboard mobile 22b | `/leaderboard` | Existing responsive hooks/Card/Pagination/Select | Responsive cards/table over the same controller and exact source rows | New, conditional on undocumented feed approval |
| Funds action state | Vault and Staking modals/sheets | API-wallet state is credential-specific and cannot be reused safely; page-local state would be lost on route unmount | New pure shared state module plus an app-shell-owned global Funds Action host: `input → review → awaiting → submitted → reconciling → done`; exhaustive tests | New |
| Read-only public stats | Vault list and Leaderboard | No supported adapter; page-level fetch would bypass integration policy | Add typed, runtime-validated, cached adapter under `packages/hl-react`; expose a project hook to pages; bind `Mainnet`/`Testnet` exactly to the selected environment and never cross-fallback | Shared integration change requiring approval |
| Documented Info queries | Vault detail and Staking | `packages/hl-react/src/hooks/useInfo.ts` | Reuse the existing generic typed `useInfo` surface; never call `/info` directly in page components | Reuse |
| Financial writes | Vault and Staking actions | `packages/hl-react/src/hooks/useExchange.ts` and registry | Call only the existing typed exchange hook; no page signing or request assembly | Reuse |
| Legal/geographic gate | Every write CTA | `useLegalStatus`, terms acceptance, and `useGeoRestriction`; the current geo hook does not expose query failure | Reuse the existing gates and expose a non-breaking geo error signal so these high-stakes pages can fail closed while public reads remain available | Reuse/small safe extension |
| Cross-tab funds safety | All financial writes | `funds-action-lock.ts` omits the new methods | Add the approved methods to the shared funds lock and its `retry: false` path; add integration tests | Required shared safety fix |
| Address explorer link | Leaderboard rows | `packages/hl-react/src/explorer.ts` has transaction/token helpers but no address helper; the app has no internal explorer route | Add a typed `getExplorerAddressUrl` beside the existing helpers and open the official explorer with `target="_blank" rel="noopener"` | Small shared integration extension |
| Routes | Four proposed routes above | TanStack file routes and generated `routeTree.gen.ts` | Add route modules with `ssr: false` and existing `buildPageHead` pattern; regenerate route tree | New after approval |
| Navigation | Four proposed routes | Desktop and mobile show disabled Vaults/Staking/Leaderboard placeholders | Replace those exact placeholders with public links and active state. This intentionally removes the compact desktop wallet-visibility gate for Vaults/Leaderboard and extends mobile static items from disabled labels to typed links. Earn remains disabled. Read-only pages remain visible when disconnected; signing CTAs remain gated. | Modify after approval |
| i18n | All new copy | Lingui catalogs: en/zh/hi/es/fr/ar | Extract all copy; complete English and Chinese, preserve project fallback convention for other configured locales | Extend |
| Design tokens | All new UI | `apps/terminal/src/styles.css`, `packages/ui`, Tailwind semantic utilities | Reuse semantic project tokens; add only missing product-semantic entries centrally | Extend only if missing |

### Existing behavior that must remain intact

- Portfolio Vault equity display and every existing portfolio/account query.
- Referrals route and section 18c.
- Trading wallet onboarding, Agent signing, deposit/withdrawal surfaces, and account identity rules.
- Shared component behavior. Page wrappers may add variants; existing Button/Card/Modal/Table behavior must not change.
- Disconnected users may read public Vault, validator, and Leaderboard data. Account-specific values fail closed and never use an Agent address as the master account.

Repository integration surfaces checked during this audit:

- `packages/hl-react/src/hooks/useInfo.ts`
- `packages/hl-react/src/hooks/useExchange.ts`
- `packages/hl-react/src/registries/exchange.ts`
- `packages/hl-react/src/internal/exchange/funds-action-lock.ts`
- `packages/hl-react/src/explorer.ts`
- `apps/terminal/src/hooks/wallet/use-wallet-session.ts`
- `packages/hl-react/src/signing/agent-session.ts`
- `apps/terminal/src/components/trade/header/top-nav.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx`
- `apps/terminal/src/config/nav.tsx`
- `apps/terminal/src/routeTree.gen.ts`
- `apps/terminal/src/lib/tests/top-nav.test.tsx`
- `apps/terminal/src/lib/tests/mobile-nav-drawer.test.tsx`
- `apps/terminal/src/lib/tests/nav.test.ts`

## 2. Mandatory field and SDK mapping

### 2.1 Vault list (16a/16b)

The delivery is a legacy HyperCore Vault follower experience, not a new HyperEVM/ERC-4626 Vault UI.

| Display field / behavior | Authoritative source and type | SDK/integration status | Decision |
| --- | --- | --- | --- |
| Vault name/address/leader/created time/TVL | Undocumented App feed `summary.{name,vaultAddress,leader,createTimeMillis,tvl}` | Not in a stable project adapter | Runtime-validate and expose through the proposed integration adapter. Never use design fixtures. |
| Full public Vault discovery | Official App `Mainnet/vaults` feed | Pinned `vaultSummaries()` is unsuitable: it documents only Vaults created less than roughly two hours ago and returned `[]` during the audit | Use the App feed only if explicitly approved as an unstable dependency. Stable-SDK fallback can show only address-direct and user-known Vaults. |
| APR | Stats feed `apr: number`, a decimal ratio | `vaultDetails.apr` exists for a single detail, but is not a substitute for list discovery | Format with Big.js. Do not interchange list/detail snapshots silently. |
| Performance sparkline | Stats feed `pnls: [period, string[]][]` | No documented list equivalent | Select the exact period series; parse/format financial strings outside React. |
| Period | Feed periods `day/week/month/allTime` | No page adapter yet | Map UI labels 24h/7D/30D/All-time exactly; do not scale one fixture series. |
| Your deposit | `userVaultEquities({user})[].equity: string` | Existing typed Info method | Query only with the verified owner/master address. Missing/error data is unknown, not zero. |
| Deposited filter | `userVaultEquities({user})[].vaultAddress` | Existing typed Info method | Exact case-insensitive address membership. Disabled/disconnected state cannot be inferred as an empty deposit set. |
| Leading filter | `leadingVaults({user})[].address` | Pinned SDK method, not clearly documented in GitBook | Runtime-validate and mark as SDK-backed; fail closed on missing data. |
| Official filter/group | No stable protocol enum; the current App uses internal special-address classification | Missing | Blocked pending a reviewed, versioned exact-address/classification policy. Do not infer it from `relationship`. |
| User filter/group | Requires the same reviewed classification policy and child-Vault handling | Missing | Blocked with Official. Do not define User as “everything not deposited/leading”. |
| Discover grouping | Handoff requires Official / User / I manage | Partially available (`leadingVaults` only) | Preserve those three product groups only after classification is approved; otherwise ship an explicitly reduced grouping rather than relabeling unknown rows. |
| Total TVL | Sum of validated list `summary.tvl` strings | No single stable SDK aggregate | Big.js sum outside components. Never add JS numbers. |
| “Official” badge | No SDK/feed field | Missing | Omit unless an approved, versioned allowlist is supplied. |
| Snapshot age | HTTP metadata/feed receipt time, not a business field | Adapter responsibility | Show data freshness based on local receipt and response metadata; do not present `createTimeMillis` as snapshot time. |

The audited Mainnet public Vault feed was approximately 14.2 MB uncompressed and contained roughly 9,468 raw rows at that instant; the Testnet response was approximately 2.8 MB. Those figures are observations, not product constants. The adapter keeps only one selected-environment normalized projection in memory, never persists or retains the raw response after validation, removes the prior environment's query on environment change, never uses cross-environment placeholder data, and relies on explicit/manual refresh plus HTTP validators rather than background duplicate downloads. Abort handling, schema validation, an explicit degraded state, and resource-budget tests are mandatory.

### 2.2 Vault detail (16c/16b)

| Display field / behavior | Authoritative source and type | Decision |
| --- | --- | --- |
| Name, address, leader, description | `vaultDetails({vaultAddress,user?})` | Render only a validated non-null detail. The SDK comment permits `null` even though its Promise type omits it, so runtime validation must accept not-found. |
| APR | `vaultDetails.apr: number` | Decimal ratio; format via domain helper. |
| Performance chart | `vaultDetails.portfolio[period].accountValueHistory/pnlHistory` | Use exact period strings and server timestamps; no synthesized curve. |
| User equity/current PnL/all-time PnL | `followerState.{vaultEquity,pnl,allTimePnl}` | Account-specific; hide/unknown when owner snapshot is unavailable. |
| Deposit time and current lock | `followerState.{vaultEntryTime,lockupUntil}` and `userVaultEquities.lockedUntilTimestamp` | Interface timestamps are execution truth. Never derive a universal four-day unlock. |
| Maximum withdrawable | `vaultDetails.maxWithdrawable: number` | Validate finite/non-negative, convert through its decimal string, and conservatively floor to micro-USDC for a UI ceiling. The parsed JS number is not exact chain accounting and the server remains authoritative. It is not the current equity. |
| Deposits permitted/closed state | `allowDeposits`, `isClosed` | Fail closed before opening the deposit review. |
| Leader commission | `leaderCommission: number` | Render returned ratio. Do not hardcode 10%; protocol Vaults may use 0. |
| Depositors | `followers[]` | Current response may cap at 100 and exposes no total/capped flag. Label it as “returned depositors”; never infer `100+` merely because 100 rows were returned. |
| Balances/Positions | Additional documented clearinghouse state scoped to the Vault address | Implement only after exact endpoint/field mapping; do not treat `vaultDetails` as containing these records. |
| Trade/Funding history | Additional fill/funding endpoints scoped to the Vault address | The current design covers fewer tabs than the official App. Any added tab needs a separate field contract. |
| Minimum deposit | No follower minimum in `vaultDetails`, `vaultTransfer`, or official depositor docs | Remove the hardcoded `20 USDC`. Accept only a positive amount that converts exactly to safe micro-USDC; surface server/vault-specific errors. |
| “Post-operation shares” preview | No authoritative atomic preview field | Omit. TVL can move between review and execution, so static share math would be misleading. |
| Forced-close behavior | `alwaysCloseOnWithdraw` plus official legacy withdrawal behavior | If true, show the proportional-close rule in review. In all cases warn that withdrawal can cancel orders, close positions, incur slippage, and produce a net amount below the request. |
| Principal/performance risk | Official legacy depositor documentation | Every detail and deposit review must state that all principal may be lost and historical APR does not predict future returns. |

Official legacy behavior is contextual copy only: HLP locks the most recent deposit for four days, while a user Vault uses a one-day lock. Runtime enforcement always uses the returned lock timestamp.

### 2.3 Staking (18a/18b)

| Display field / behavior | Authoritative source and type | Decision |
| --- | --- | --- |
| Total network stake | `validatorSummaries()[].stake: number` in raw 1e8 units | SDK explicitly warns that values may exceed safe integer precision, so precision may already be lost during JSON parsing. Never use it for exact accounting or transaction limits. Either add a reviewed lossless source or show a clearly approximate display value; never sum it as exact JS numbers. |
| Your total/delegated/available stake | `delegatorSummary({user}).{delegated,undelegated}: string` | Big.js parsing. Missing/error snapshot is unknown, not zero. |
| Pending withdrawal total/count | `delegatorSummary.{totalPendingWithdrawal:string,nPendingWithdrawals:number}` | Show the aggregate and count exactly. |
| Individual pending unlock rows/progress | No queue IDs or per-item unlock timestamps. `delegatorHistory` has initiated/finalized events only | Do not fabricate a queue or countdown. Show aggregate plus exact history entries/hash. |
| Delegations | `delegations({user})[]` → `{validator,amount,lockedUntilTimestamp}` | Exact current delegation and server lock timestamp. |
| Validator identity/status | `validatorSummaries` → validator/signer/name/description/isActive/isJailed/unjailableAfter | Keep these states distinct. Do not claim an inactive reason unless the API provides it. |
| Validator stake | `validatorSummaries[].stake` | Unsafe raw integer warning applies; use guarded conversion. |
| Uptime/APR | `stats[day|week|month].{uptimeFraction,predictedApr}: string` | Map the selected period exactly and format ratios via Big.js. |
| Commission | `commission: string` | Decimal ratio. Official rules constrain increases; do not say it can always rise. |
| Rewards | `delegatorRewards({user})[]` → `{time,source:"delegation"|"commission",totalAmount}` | Label the column “Reward source”. The API does not provide a source validator, so do not invent one. |
| Reward settlement | Official Staking docs: rewards accrue every minute, are distributed daily, and are automatically redelegated/compounded | Explain automatic compounding. Staking must not render a Claim CTA; Claim controls in section 18c belong to Referrals only. |
| Lifetime rewards | No reliable summary; summing history assumes complete retention | Do not label a client sum as lifetime unless completeness is documented. |
| Action history | `delegatorHistory({user})[]` → `{time,hash,delta}` | Render exact event semantics and real hash. |
| Spot HYPE available | Validated spot clearinghouse state for the verified owner | Add an integration/domain mapping; do not reuse staking available. |
| Staking link state | `userFees({user}).stakingLink` | Read-only status is safe. Any action must implement the permanent two-party flow described below. |

### 2.4 Leaderboard (22a/22b)

There is no Leaderboard read method in `@nktkas/hyperliquid@0.33.3`, and Hyperliquid's developer docs do not publish the current App feed as an API contract. The only SDK-related write is `setDisplayName`; editing a display name is not part of this page scope.

| Display field / behavior | Current official-App source | Decision |
| --- | --- | --- |
| Address/display name/account value | `leaderboardRows[].{ethAddress,displayName,accountValue}` | Runtime-validate every row. Use display name as optional copy, never identity. |
| Window metrics | `windowPerformances: [["day"|"week"|"month"|"allTime", {pnl,roi,vlm}], ...]` | Map 24h/7D/30D/All-time exactly. Field is `vlm`, not the handoff's invented `volume`. |
| PNL/ROI/Volume | Period strings `pnl`, `roi`, `vlm` | Big.js parsing/formatting. ROI is a ratio and is multiplied by 100 only for display. |
| ROI definition | Feed-provided `roi`; the current App describes ROI as PNL divided by the greater of 100 and starting account value plus maximum net deposits | Render the feed value. Required starting-balance/deposit inputs are not present in each row, so do not reimplement or “correct” the formula in the page. |
| Rank | Order after the approved official eligibility/exclusion policy and selected metric ordering | Derive deterministically; do not hardcode the fixture rank or row count. |
| Search | Exact/partial address and optional display name | Client derivation over validated rows; explicit no-results state. |
| Sorting | Current App supports Account Value, PNL, ROI, and Volume | Implement all four with stable tie-breaking, not only PNL. |
| Pagination | Current App exposes 5/10/25/50; handoff shows 10/25/50 | Follow current App, including mobile 5, if official-parity mode is approved. |
| Trader link | Official `/explorer/address/$ethAddress` | Add/reuse an integration-layer address URL helper and open the official explorer in a protected new tab. The project has no internal explorer-address route; do not invent a portfolio route. |
| Eligibility note | Current App excludes a row only when account value is below 100k **and** all-time volume is below 10m | The handoff's “either threshold” wording is wrong. Treat this as current-App policy, not protocol documentation. |
| Vault/special-account exclusion | Current App also excludes child/special Vault and known protocol/treasury addresses using the Vault feed and internal address sets | Exact parity requires a reviewed exclusion adapter/allowlist. Do not claim official parity if this policy is omitted. |

The audited Mainnet Leaderboard response was approximately 34.5 MB uncompressed and contained roughly 41,730 rows at that instant; the Testnet response was approximately 20.2 MB. These are observations, not constants. A page-level direct fetch is rejected. As with Vaults, keep only the selected environment's validated normalized projection, release raw data, remove the old-environment query on switch, never persist the feed, and never use cross-environment placeholder data. The adapter must also provide cancellation, stale/error semantics, explicit refresh, resource-budget tests, and test fixtures. Production failure shows a fail-closed error state rather than demo rows.

## 3. Action/SDK/reconciliation mapping

All amounts are parsed and scaled in pure domain functions with Big.js. `vaultTransfer.usd` is USDC × 1e6; Staking `wei` fields are HYPE × 1e8. The scaled result must be an integer, positive, and `Number.isSafeInteger` before calling the pinned SDK.

| User action | Existing SDK method | Signing identity | Preflight and exact reconciliation | Retry decision |
| --- | --- | --- | --- | --- |
| Deposit to Vault | `vaultTransfer({vaultAddress,isDeposit:true,usd})` | Verified, approved local trading Agent selected by the existing registry and bound to exact environment/owner | Fresh detail permits deposits; then match a new `userNonFundingLedgerUpdates` `vaultDeposit` event by Vault and exact USDC amount, followed by refreshed detail/equity | No automatic retry. Generic post-signing error reconciles first. |
| Withdraw from Vault | `vaultTransfer({vaultAddress,isDeposit:false,usd})` | Verified, approved local trading Agent selected by the existing registry | Fresh conservatively quantized `maxWithdrawable`, lock state, and withdrawal risk fields; match new `vaultWithdraw` by Vault, owner, and requested amount. Final UI uses ledger `netWithdrawnUsd`, `commission`, and `closingCost` | Same; requested amount is not guaranteed net received. |
| Spot → Staking available | `cDeposit({wei})` | Exact active master user wallet | Fresh spot balance; match a new `delegatorHistory` `cDeposit` event and refreshed available/spot balances | No automatic retry after signature dispatch. |
| Delegate | `tokenDelegate({validator,wei,isUndelegate:false})` | Exact active master user wallet | Fresh available stake and validator status; match new delegate history plus refreshed delegation/summary. Use returned `lockedUntilTimestamp` | No automatic retry. |
| Undelegate | `tokenDelegate({validator,wei,isUndelegate:true})` | Exact active master user wallet | Fresh exact delegation and expired server lock; match `isUndelegate:true`, delegated decrease, and immediate available increase | No automatic retry. This does **not** start the seven-day queue. |
| Staking available → Spot | `cWithdraw({wei})` | Exact active master user wallet | Fresh available balance and `nPendingWithdrawals < 5`; match a new withdrawal `phase:"initiated"` event and pending aggregate/count increase. Later `finalized` records completion | No automatic retry. This is the only seven-day queue action. |
| Initiate staking link | `linkStakingUser({user:stakingAddress,isFinalize:false})` | Exact trading user wallet | Fresh `userFees(trading).stakingLink`; reconcile requested state | Recommended deferred until an explicit permanent-authority UX is approved. |
| Finalize staking link | `linkStakingUser({user:tradingAddress,isFinalize:true})` | Exact staking user wallet | Revalidate both parties and requested relationship; reconcile both `userFees` views | Recommended deferred; irreversible high-risk confirmation required. |

The SDK's successful responses are `{status:"ok",response:{type:"default"}}` and contain no transaction hash. A real hash becomes available only after matching Vault ledger or Staking history data. Therefore the generic handoff rule “unknown always shows a transaction hash” cannot be satisfied honestly. In `unknown`, the UI must instead show the public operation tuple (environment, verified owner, SDK method, target/direction, exact scaled integer amount, start time, and identity epoch), state that the hash is not yet available, prohibit resubmission, and offer read-only verification. It may show a hash only after a matching ledger/history record exists.

Before any write, the controller must also pass the existing legal and geographic gates. It reuses `useLegalStatus`/terms acceptance and `useGeoRestriction`; unresolved, error, or blocked legal/geo state disables the action. Public read-only data remains visible. `vaultTransfer` additionally requires a fresh verified local Agent for the same owner and environment. If it is absent, reuse the existing Agent-registration flow without approving a builder fee, because Vault transfer does not carry a builder code. Staking writes require the exact active master wallet and must never fall back to an Agent signer.

### Shared funds-action state machine

| Stage/result | Required behavior |
| --- | --- |
| `input` | Validate amount and authoritative snapshot; no signature side effect. |
| `review` | Show exact owner, target, amount, fees/lock warnings, and irreversible consequences. Refresh authoritative preflight before signing. |
| `awaiting` | Signing/authorization active. User-signed Staking actions may show a wallet prompt; Agent-signed Vault actions can sign locally without one. Modal/sheet, overlay, Escape, and route-owned close controls are locked. |
| `submitted` | One signed SDK call has been dispatched/accepted; closing and duplicate submission remain locked. |
| `reconciling` | Read-only polling of ledger/history and state snapshots. Never re-sign. |
| `done: success` | Only after exact reconciliation. Show server-derived final amounts/hash where available. |
| `done: rejected` | Only an explicit wallet rejection, such as known code 4001. A later retry requires returning to review. |
| `done: apiError` | Definite SDK validation/API rejection before ambiguous success. Show sanitized error; retry requires review/preflight. |
| `done: unknown` | Transport/timeout/late-result uncertainty after dispatch. Preserve the operation reference, say “do not submit again”, and provide verification only. |

The current shared lock omits `vaultTransfer`, `cDeposit`, `cWithdraw`, `tokenDelegate`, and `linkStakingUser`. Before enabling writes, the approved methods must be added to `packages/hl-react/src/internal/exchange/funds-action-lock.ts`, thereby also entering `useExchange`'s `retry: false` path. This integration-layer change and its lock/concurrency tests are a required safety exception to a page-only edit boundary.

That Web Lock ends when the SDK Promise settles; by itself it does **not** prevent another tab from replaying an operation after a transport timeout enters `unknown`. To honor the no-resubmission contract, the global host also needs a non-secret pending-operation marker keyed by environment and verified owner. It records the exact public operation tuple before dispatch, is visible across tabs, and resumes read-only reconciliation after route changes or reload. It is cleared only by a definitive rejection or reconciliation, not by an automatic TTL. An explicit destructive recovery path is required for permanently unresolvable markers. No wallet credential or private key enters this marker.

The app-shell-owned host keeps the Modal/Sheet and identity/environment epoch alive across route unmounts. An identity or environment change aborts UI work and hides the action, but retains an ambiguous marker for its original identity so returning to that identity can continue reconciliation. Page components cannot own or silently discard an awaiting/submitted/reconciling/unknown operation.

## 4. Page-state mapping

| Page | Required states |
| --- | --- |
| Vault list | public normal, loading, feed error, definitive empty, search no-results, and official/user/deposited/leading filter states; disconnected and non-signing owners still see public rows while account-specific filters/values fail closed |
| Vault detail | public normal, loading, not-found, error; disconnected, non-master/non-signing, deposits-disabled, closed, locked withdrawal, and actionable owner states |
| Staking | public validator normal/loading/error/empty plus account disconnected, account snapshot error, no stake, active stake, pending withdrawal aggregate, and non-signing owner states |
| Leaderboard | normal, loading, feed error, definitive empty, and search no-results; wallet state does not gate public data |
| Every financial action | all six stages and all four results, including legal/geo/Agent gates, identity/environment change, route unmount/recovery, cross-tab pending marker, stale preflight, malformed response, late result, abort, and exact/non-exact reconciliation |

Fixtures may drive acceptance screenshots only behind `import.meta.env.DEV`. They must be runtime-schema-valid, use placeholder addresses and amounts, never contradict the surrounding wallet shell, and never enter production or replace a real error with demo data.

## 5. Token mapping

The handoff token source is `designs/Gatu标志加载动画/docs/hl-ui-spec/tokens.json`; project tokens are defined in `apps/terminal/src/styles.css` and shared UI styles. No page component may contain color literals or repeated magic geometry.

| Handoff semantic | Project mapping decision |
| --- | --- |
| Primary/secondary/disabled text | Reuse `fg`, `fg-muted`, `fg-disabled` and established terminal semantic aliases. |
| Page/card/sunken/modal surfaces | Reuse `grid-container`, `surface`, `fill-weak`, and `modal`; preserve both themes. |
| Borders/dividers/focus/error/warning/success | Reuse `stroke-*`, `stroke-focus`, `error`, `warning`, and `success` semantics. |
| Numeric typography | Reuse project font/size/weight utilities and `tabular-nums`; all short labels/label-value pairs obey `whitespace-nowrap`. |
| Spacing/radii/row heights/chart dimensions | Reuse exact project scale where semantically equivalent. Add named `--vault-*`, `--staking-*`, or `--leaderboard-*` variables centrally only when the design value has no equivalent. Do not borrow API-wallet-prefixed tokens. |
| Responsive breakpoint | Reuse the project-wide inclusive `MOBILE_BREAKPOINT_PX = 1000` and `useIsMobile`; desktop CSS begins at 1001px. |
| Modal/Sheet | Reuse `AdaptiveModal` and shared scrim/modal tokens. Page wrappers may suppress forbidden scale motion without changing shared components. |
| Charts | Theme colors come from semantic CSS tokens. Financial series remain strings/Big.js until the chart-boundary conversion; malformed points are rejected, not coerced to zero. |

## 6. Confirmed handoff conflicts and proposed resolutions

| Handoff statement | Verified behavior | Proposed resolution |
| --- | --- | --- |
| Undelegate enters a seven-day queue | Undelegate returns funds immediately to Staking available after its one-day delegation lock. Only `cWithdraw` starts the seven-day queue; at most five are pending | Correct every label, review, state transition, and reconciliation rule. |
| Staking link can be unlinked / rewards belong to trading account | Linking permanently attributes staking to a trading account for fee discounts; no unlink exists. The staking user obtains complete control over trading funds and gives up its own discount | Show read-only link status in the first delivery; defer signing until a dedicated two-party irreversible-risk flow is approved. Never expose `stakingLinkDisableTradingUser` as unlink. |
| Validator commission can rise at any time | Official rules constrain an increase unless the new commission is at most 1% | Remove the absolute claim; render the returned commission only. |
| Jailed validators always reject a new delegation | Official docs say jailed validators do not produce blocks or rewards, but do not document this exact API rejection | A Gatu safety policy may disable delegation to jailed validators, labeled as product protection rather than protocol fact. |
| Reward source is a validator | `delegatorRewards` exposes only `delegation` or `commission` | Rename to Reward source and show only the returned enum. |
| Staking rewards need a Claim action | Rewards are distributed daily and automatically redelegated/compounded | Show the automatic-compounding explanation and no Claim button. Section 18c's Claim flow remains Referrals-only. |
| A per-withdrawal unlock queue/progress is available | The API exposes only aggregate pending amount/count plus initiated/finalized history, without stable queue IDs or unlock timestamps | Show aggregate and exact history; omit fabricated rows/countdowns. |
| Every Vault locks for four days | HLP uses four days after the latest deposit; a user Vault uses one day | Enforce only returned timestamps; explain the category rule as contextual copy. |
| Every Vault deposit has a 20 USDC minimum | No follower-side SDK or official-doc rule supports it | Remove it; validate exact positive micro-USDC and surface the server response. |
| Vault commission is always 10% | `leaderCommission` is returned; protocol Vaults may use 0 | Render the interface value. |
| “Official/User Vault” is an interface field | No such enum exists | Require exact reviewed address classification or omit the badge/group claim. |
| Leaderboard uses `volume` and can scale fixture data by period | Feed uses real per-window `vlm` | Map the real period tuple; never transform one window into another. |
| A trader is excluded when either account value or all-time volume is below its threshold | Current official App excludes only when both are below their thresholds | Follow current App behavior only if undocumented-parity mode is approved; label it as current ranking policy, not protocol law. |
| Only PNL is sortable | Current App sorts Account Value, PNL, ROI, and Volume | Implement all four if parity mode is approved. |
| Leaderboard row opens a portfolio page | Current App opens `/explorer/address/$address` | Follow the explorer route. |
| Unknown always has a transaction hash | These SDK writes return no hash | Never fabricate. Show the public operation reference until ledger/history supplies a real hash. |

## 7. Decisions required before page code

Recommended implementation boundary:

1. **Approve the undocumented public-data adapter.** Add a typed, runtime-validated read-only adapter in `@gatu/hl-react` for the two environment-specific `stats-data` feeds. Keep only one selected-environment normalized projection in memory and release raw responses. Its UI must disclose/fail closed when unavailable. Without this approval, Leaderboard cannot be real and Vaults must be reduced to address-direct/user-known records.
2. **Approve the shared funds-safety change.** Add `vaultTransfer`, `cDeposit`, `cWithdraw`, and `tokenDelegate` to the cross-tab funds lock and forced `retry: false` integration path. Add an app-shell global action host and a non-secret cross-tab pending marker so an `unknown` operation remains blocked/reconcilable after the SDK lock releases, route navigation, or reload. Add `linkStakingUser` only if linking is later approved.
3. **Defer validator detail.** Do not create `/staking/validators/$validator` until a screen and field contract are supplied. Validator rows remain non-navigating on `/staking`.
4. **Defer Staking linking writes (recommended).** Show verified current link status and accurate permanent-risk copy, but do not initiate/finalize the link in the first delivery. Alternatively, explicit approval is required for a two-wallet, two-phase, irreversible action flow.
5. **Use aggregate withdrawal data.** Show pending total/count and exact history; do not invent individual seven-day progress rows.
6. **Constrain “etc.” to this audited scope.** Build the four routes listed at the top. Referrals already exists and section 18c is excluded; no additional product page is inferred.
7. **Use current-App Leaderboard parity as a versioned policy.** Include all four sorts, the current AND threshold rule, explorer links, and reviewed special-account exclusions; document that the feed and policy are not a public developer API guarantee.
8. **Supply or approve Vault classification.** Official/User filters and groups cannot ship truthfully until an exact, versioned classification policy is approved. Do not infer it from `relationship` or substitute a different “Others” filter.

Implementation begins only after these decisions are confirmed, in accordance with the delivery package's mandatory “mapping tables first, wait for confirmation” rule.

## Proposed verification after approval

- Pure domain tests for every amount scale, safe-integer boundary, percentage, aggregate, official/user/deposited/leading filter, search, sort, and malformed row.
- Exhaustive shared action-state tests for six stages, four results, locked close behavior, illegal transitions, read-only unknown verification, route unmount/recovery, and cross-tab pending-marker recovery.
- Integration tests for funds locking, `retry: false`, exact wallet/Agent identity, legal/geo gates, owner/environment changes, aborts, late results, and zero duplicate signed calls.
- Controller tests for fresh preflight, conservative `maxWithdrawable` quantization, exact/non-exact ledger/history reconciliation, stale cached data, response validation, selected-environment feed isolation, and public-feed failure.
- Update `top-nav.test.tsx`, `mobile-nav-drawer.test.tsx`, and `nav.test.ts`; add explorer-helper, registry/funds-lock, action-host, adapter, route, and i18n tests; verify the generated route tree.
- Biome, typecheck, Lingui extract/compile, targeted Vitest, full lint/build/test.
- Desktop and 375px mobile screenshots in light/dark and English/Chinese for the exported Vault discover, official/user/deposited/leading filter, search-empty, detail/chart, lock rejection, deposit/withdraw flows; Staking overview, validator states, rewards/actions, no-Claim contract, four funds flows and aggregate pending state; and Leaderboard normal/loading/error/empty/search/sort/pagination states. Include trigger instructions and no real account data.
