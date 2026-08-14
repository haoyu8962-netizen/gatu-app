# Leaderboard, Vaults, and Staking redesign — audit and delivery notes

Last verified: 2026-08-14

Status: **implemented within the user-approved recommended boundary; final verification evidence is recorded below**.

## Scope and source precedence

This delivery covers only these production routes:

- `/vaults`
- `/vaults/$vaultAddress`
- `/staking`
- `/leaderboard`

The desktop and mobile designs share each route's controller and domain model. `18c` in the combined Staking/Referrals design is the existing Referrals product and is out of scope. The handoff route table mentions `/staking/validators/$validator`, but the package contains no validator-detail screen, field contract, or state specification; the user-approved boundary therefore deliberately omits that route.

Sources are applied in this order:

1. Hyperliquid's current official developer and product documentation is the hard behavioral constraint.
2. The delivery-package READMEs define product intent where they do not conflict with official behavior.
3. The project's pinned `@nktkas/hyperliquid@0.33.3` types and existing `@gatu/hl-react` integration define the callable SDK surface used to realize that intent.
4. Current production behavior at `app.hyperliquid.xyz` fills the two approved public-list source gaps only through the contained adapter described below. It cannot override documented protocol behavior or the handoff's product intent and is marked undocumented and potentially unstable.
5. The `.dc.html` files define visual composition and interaction references only. Their code and fixture values must not enter the project.

`@nktkas/hyperliquid` is the project's pinned community TypeScript SDK, not an official Hyperliquid SDK. Its v0.33.3 tag is nevertheless the exact implementation contract this repository compiles and signs against.

Primary official sources:

- [Hyperliquid Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Hyperliquid staking](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/staking)
- [Hyperliquid node / delegation README](https://github.com/hyperliquid-dex/node#delegation)
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

Vaults and Staking are marked D2 in the delivery index: fields/layout are present, but their action designs do not cover the mandatory D1 state machine. The delivered implementation adds the reviewed funds-action flow instead of treating the design runtime's direct `input → done` demo as production behavior.

## 1. Mandatory module mapping

Every listed page is new; the repository currently has no matching route or page component. Existing navigation entries are disabled `Soon` placeholders with no route or click behavior.

| Design section / concern | Route | Previous project surface | Delivered implementation | Status |
| --- | --- | --- | --- | --- |
| Vault list 16a | `/vaults` | No page/route | `apps/terminal/src/components/vaults/vaults-page.tsx`, `vaults-list.tsx`, `use-vaults-controller.ts`, `domain/vaults.ts`; discover/search plus fail-closed official/user/deposited/leading filters | Delivered |
| Vault mobile list/detail 16b | Same Vault routes | `useIsMobile`, inclusive 1000px layout contract, shared Table/Card/Drawer primitives | Responsive views over the same controller/domain; no separate mobile data source | Delivered |
| Vault detail 16c | `/vaults/$vaultAddress` | No page/route; portfolio chart is not a reusable public builder | Detail controller/view/chart plus audited deposit/withdraw state machine | Delivered |
| Staking desktop 18a | `/staking` | No page/route | Overview, balances, validators, aggregate unlock state, rewards/history, and audited actions | Delivered |
| Staking mobile 18b | `/staking` | `useIsMobile`, Adaptive Modal/Sheet conventions | Responsive views over the desktop controller/domain; validator table scrolls where required | Delivered |
| Validator detail | Outside the approved boundary | Handoff route table mentions it, but no section/spec exists | Omitted without inventing fields, navigation, or a detail page. | Deliberately not implemented |
| Leaderboard desktop 22a | `/leaderboard` | No page/route/data adapter | Page/view/controller/domain over the audited, runtime-validated App feed | Delivered with unstable-source disclosure |
| Leaderboard mobile 22b | `/leaderboard` | Existing responsive hooks/Card/Pagination/Select | Responsive cards/table over the same controller and exact source rows | Delivered |
| Funds action state | Vault and Staking modals/sheets | API-wallet state is credential-specific and cannot be reused safely; page-local state would be lost on route unmount | Pure shared state module plus app-shell recovery host: `input → review → awaiting → submitted → reconciling → done`; exhaustive tests | Delivered |
| Read-only public stats | Vault list and Leaderboard | No supported adapter; page-level fetch would bypass integration policy | Typed, runtime-validated, resource-bounded adapter under `packages/hl-react`; exact environment binding and no cross-fallback | Delivered shared integration exception |
| Documented Info queries | Vault detail and Staking | `packages/hl-react/src/hooks/useInfo.ts` | Reuse the existing generic typed `useInfo` surface; never call `/info` directly in page components | Reuse |
| Financial writes | Vault and Staking actions | `packages/hl-react/src/hooks/useExchange.ts` and registry | Call only the existing typed exchange hook; no page signing or request assembly | Reuse |
| Legal/geographic gate | Every write CTA | `useLegalStatus`, terms acceptance, and `useGeoRestriction`; the current geo hook does not expose query failure | Reuse the existing gates and expose a non-breaking geo error signal so these high-stakes pages can fail closed while public reads remain available | Reuse/small safe extension |
| Cross-tab funds safety | All financial writes | `funds-action-lock.ts` previously omitted the new methods | Added the delivered write methods to the shared funds lock and its `retry: false` path, with integration tests | Delivered shared safety fix |
| Address explorer link | Leaderboard rows | `packages/hl-react/src/explorer.ts` has transaction/token helpers but no address helper; the app has no internal explorer route | Add a typed `getExplorerAddressUrl` beside the existing helpers and open the official explorer with `target="_blank" rel="noopener"` | Small shared integration extension |
| Routes | Four delivered routes above | TanStack file routes and generated `routeTree.gen.ts` | Route modules use `ssr: false`, `buildPageHead`, and the generated route tree; Vault list/detail use a proper parent Outlet | Delivered |
| Navigation | Four delivered routes | Desktop and mobile previously showed disabled Vaults/Staking/Leaderboard placeholders | The three exact placeholders are public links with active state. The compact desktop wallet-visibility gate was intentionally removed. Earn remains disabled; signing CTAs remain gated. | Delivered |
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
| Vault name/address/leader/created time/TVL | Undocumented App feed `summary.{name,vaultAddress,leader,createTimeMillis,tvl}` | Delivered through the contained public-stats adapter | Runtime-validate and normalize before caching. Never use design fixtures in production. |
| Full public Vault discovery | Official App `Mainnet/vaults` feed | Pinned `vaultSummaries()` is unsuitable: it documents only Vaults created less than roughly two hours ago and returned `[]` during the audit | Use the approved, contained App-feed adapter with an explicit unstable-source disclosure; never silently substitute a cross-network or fixture fallback. |
| APR | Stats feed `apr: number`, a decimal ratio | `vaultDetails.apr` exists for a single detail, but is not a substitute for list discovery | Format with Big.js. Do not interchange list/detail snapshots silently. |
| Performance sparkline | Stats feed `pnls: [period, string[]][]` | No documented list equivalent | Select the exact period series; parse/format financial strings outside React. |
| Period | Feed periods `day/week/month/allTime` | No page adapter yet | Map UI labels 24h/7D/30D/All-time exactly; do not scale one fixture series. |
| Your deposit | `userVaultEquities({user})[].equity: string` | Existing typed Info method | Query only with the verified owner/master address. Missing/error data is unknown, not zero. |
| Deposited filter | `userVaultEquities({user})[].vaultAddress` | Existing typed Info method | Exact case-insensitive address membership. Disabled/disconnected state cannot be inferred as an empty deposit set. |
| Leading filter | `leadingVaults({user})[].address` | Pinned SDK method, not clearly documented in GitBook | Runtime-validate and mark as SDK-backed; fail closed on missing data. |
| Official filter/group | No stable protocol enum; the current App uses internal special-address classification | Missing | Rendered as unavailable under the approved fail-closed boundary. The page does not infer it from `relationship`. |
| User filter/group | Requires the same reviewed classification policy and child-Vault handling | Missing | Rendered as unavailable with Official. The page never defines User as “everything not deposited/leading”. |
| Discover grouping | Handoff requires Official / User / I manage | Partially available (`leadingVaults` only) | Delivered as an explicitly reduced grouping: Deposited and Leading use owner-backed facts; Official/User remain unavailable rather than relabeling unknown rows. |
| Total TVL | Sum of validated list `summary.tvl` strings | No single stable SDK aggregate | Big.js sum outside components. Never add JS numbers. |
| “Official” badge | No SDK/feed field | Missing | Omitted in this delivery because no reviewed, versioned allowlist exists. |
| Snapshot age | HTTP metadata/feed receipt time, not a business field | Adapter responsibility | Show data freshness based on local receipt and response metadata; do not present `createTimeMillis` as snapshot time. |

The audited Mainnet public Vault feed was approximately 14.2 MB uncompressed and contained roughly 26,460 raw rows at that instant; the Testnet feed contained roughly 1,872 rows. Those figures are observations, not product constants. The adapter keeps only one selected-environment normalized projection in memory, never persists or retains the raw response after validation, removes the prior environment's query on environment change, never uses cross-environment placeholder data, and relies on explicit/manual refresh plus HTTP validators rather than background duplicate downloads. Abort handling, schema validation, an explicit degraded state, and resource-budget tests are mandatory.

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
| Withdrawal duration by network | Mainnet Staking/Exchange docs specify seven days; the official node README specifies a five-minute unbonding period and current Testnet initiated/finalized history confirms approximately five minutes | Render Mainnet as seven days and Testnet as approximately five minutes. Do not apply the Mainnet duration to Testnet. |
| Finalized withdrawal hash | Current Mainnet and Testnet history uses the all-zero hash sentinel for system finalization | Render “system finalization / hash unavailable” and never create an Explorer link for the sentinel. |
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
| Rank | Order after the delivered, explicitly partial eligibility/exclusion policy and selected metric ordering | Derived deterministically with stable tie-breaking; no fixture rank or row count is hardcoded. |
| Search | Exact/partial address and optional display name | Client derivation over validated rows; explicit no-results state. |
| Sorting | Current App supports Account Value, PNL, ROI, and Volume | Delivered all four with stable tie-breaking, not only PNL. |
| Pagination | Current App exposes 5/10/25/50; handoff shows 10/25/50 | Delivered with 5/10/25/50, including the mobile 5-row option. |
| Trader link | Official `/explorer/address/$ethAddress` | Add/reuse an integration-layer address URL helper and open the official explorer in a protected new tab. The project has no internal explorer-address route; do not invent a portfolio route. |
| Eligibility note | Current App excludes a row only when account value is below 100k **and** all-time volume is below 10m | The handoff's “either threshold” wording is wrong. Treat this as current-App policy, not protocol documentation. |
| Vault/special-account exclusion | Current App also excludes child/special Vault and known protocol/treasury addresses using the Vault feed and internal address sets | Exact parity requires a reviewed exclusion adapter/allowlist. Do not claim official parity if this policy is omitted. |

The audited Mainnet Leaderboard response was approximately 34.5 MB uncompressed and contained roughly 41,739 rows at that instant; the Testnet feed contained roughly 9,468 rows. These are observations, not constants. A page-level direct fetch is rejected. As with Vaults, keep only the selected environment's validated normalized projection, release raw data, remove the old-environment query on switch, never persist the feed, and never use cross-environment placeholder data. The adapter also provides cancellation, stale/error semantics, explicit refresh, conditional validators, streaming resource limits, and DEV-only fixtures. Production failure shows a fail-closed error state rather than demo rows.

## 3. Action/SDK/reconciliation mapping

All amounts are parsed and scaled in pure domain functions with Big.js. `vaultTransfer.usd` is USDC × 1e6; Staking `wei` fields are HYPE × 1e8. The scaled result must be an integer, positive, and `Number.isSafeInteger` before calling the pinned SDK.

| User action | Existing SDK method | Signing identity | Preflight and exact reconciliation | Retry decision |
| --- | --- | --- | --- | --- |
| Deposit to Vault | `vaultTransfer({vaultAddress,isDeposit:true,usd})` | Verified, approved local trading Agent selected by the existing registry and bound to exact environment/owner | Fresh detail permits deposits; then match a new `userNonFundingLedgerUpdates` `vaultDeposit` event by Vault and exact USDC amount, followed by refreshed detail/equity | No automatic retry. Generic post-signing error reconciles first. |
| Withdraw from Vault | `vaultTransfer({vaultAddress,isDeposit:false,usd})` | Verified, approved local trading Agent selected by the existing registry | Fresh conservatively quantized `maxWithdrawable`, lock state, and withdrawal risk fields; match new `vaultWithdraw` by Vault, owner, and requested amount. Final UI uses ledger `netWithdrawnUsd`, `commission`, and `closingCost` | Same; requested amount is not guaranteed net received. |
| Spot → Staking available | `cDeposit({wei})` | Exact active master user wallet | Fresh spot balance; match a new `delegatorHistory` `cDeposit` event and refreshed available/spot balances | No automatic retry after signature dispatch. |
| Delegate | `tokenDelegate({validator,wei,isUndelegate:false})` | Exact active master user wallet | Fresh available stake and validator status; match new delegate history plus refreshed delegation/summary. Use returned `lockedUntilTimestamp` | No automatic retry. |
| Undelegate | `tokenDelegate({validator,wei,isUndelegate:true})` | Exact active master user wallet | Fresh exact delegation and expired server lock; match `isUndelegate:true`, delegated decrease, and immediate available increase | No automatic retry. This does **not** start the transfer queue. |
| Staking available → Spot | `cWithdraw({wei})` | Exact active master user wallet | Fresh available balance and `nPendingWithdrawals < 5`; match a new withdrawal `phase:"initiated"` event and pending aggregate/count increase. Later `finalized` records completion | No automatic retry. This starts the Mainnet seven-day or Testnet approximately five-minute queue. |
| Initiate staking link | `linkStakingUser({user:stakingAddress,isFinalize:false})` | Exact trading user wallet | Fresh `userFees(trading).stakingLink`; reconcile requested state | Deliberately not exposed under the approved boundary; the page is read-only for linking. |
| Finalize staking link | `linkStakingUser({user:tradingAddress,isFinalize:true})` | Exact staking user wallet | Revalidate both parties and requested relationship; reconcile both `userFees` views | Deliberately not exposed; no unlink or misleading reversible control exists. |

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

The shared lock now includes the delivered write methods `vaultTransfer`, `cDeposit`, `cWithdraw`, and `tokenDelegate`, which also places them on `useExchange`'s `retry: false` path. `linkStakingUser` remains unexposed because linking writes are outside the approved boundary. This integration-layer change and its lock/concurrency tests are the required safety exception to a page-only edit boundary.

That Web Lock ends when the SDK Promise settles; by itself it does **not** prevent another tab from replaying an operation after a transport timeout enters `unknown`. The delivered global host therefore uses a non-secret operation marker keyed by environment and verified owner. It records the exact public operation tuple before dispatch and remains visible across tabs. Returning to the exact Staking page or Vault address rehydrates that marker as `done: unknown` and permits only authoritative, read-only reconciliation. It is cleared only by a definitive rejection, exact reconciliation, or the explicit two-step destructive recovery flow, never by an automatic TTL. No wallet credential or private key enters this marker.

The app-shell-owned host keeps the public operation tuple and identity/environment epoch alive across route unmounts; it does not pretend that React modal state itself survives a reload. An identity or environment change aborts UI work and hides the action, but retains an ambiguous marker for its original owner and environment. The exact owner may resume verification from either the master-wallet session or its verified Agent-only read session. Recovery validates the SDK method, direction, asset, atomic decimals, target, amount, baselines, and owner/environment before hydrating, and cannot reach any signing path.

Ledger/history reconciliation accepts exactly one new matching event that was absent from the pre-sign baseline plus the expected authoritative state movement. Zero or multiple matching candidates remain `unknown`. Because the SDK success response contains no nonce or transaction hash, even a unique tuple match cannot cryptographically distinguish the browser request from an identical operation submitted elsewhere; the UI therefore describes the on-chain operation as verified rather than claiming a uniquely attributable SDK response.

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

## 6. Confirmed handoff conflicts and delivered resolutions

| Handoff statement | Verified behavior | Delivered resolution |
| --- | --- | --- |
| Undelegate enters a seven-day queue | Undelegate returns funds immediately to Staking available after its one-day delegation lock. Only `cWithdraw` starts the withdrawal queue; it is seven days on Mainnet and approximately five minutes on Testnet, with at most five pending | Correct every label, review, state transition, and reconciliation rule, and render the duration from the selected environment. |
| Staking link can be unlinked / rewards belong to trading account | Linking permanently attributes staking to a trading account for fee discounts; no unlink exists. The staking user obtains complete control over trading funds and gives up its own discount | Delivered read-only link status and permanent-control warning. No signing or `stakingLinkDisableTradingUser` “unlink” control is exposed. |
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
| A trader is excluded when either account value or all-time volume is below its threshold | Current official App excludes only when both are below their thresholds | Delivered the observed AND rule and labels it as current ranking policy, not protocol law. |
| Only PNL is sortable | Current App sorts Account Value, PNL, ROI, and Volume | Delivered all four sorts with deterministic tie-breaking. |
| Leaderboard row opens a portfolio page | Current App opens `/explorer/address/$address` | Follow the explorer route. |
| Unknown always has a transaction hash | These SDK writes return no hash | Never fabricate. Show the public operation reference until ledger/history supplies a real hash. |

## 7. Approved boundary and delivered decisions

The user approved the recommended boundary after this audit. The implementation applies it as follows:

1. **Undocumented public-data adapter accepted with containment.** `@gatu/hl-react` now owns both environment-specific App-feed adapters. Responses are stream-read under dataset byte and row limits, strictly schema-validated, normalized before caching, scoped by environment, and never persisted. Conditional HTTP validators avoid unnecessary full transfers; missing, dishonest, or absent `Content-Length` cannot bypass the streaming byte limit. Production failures remain explicit and never fall back to fixture or cross-network data.
2. **Shared funds safety accepted.** `vaultTransfer`, `cDeposit`, `cWithdraw`, and `tokenDelegate` use the integration layer's cross-tab lock and `retry:false` behavior. An app-shell recovery host and non-secret operation marker retain ambiguous operations across page navigation and reload. Marker storage uses an atomic global lock; unknown actions can only perform read-only verification.
3. **Validator detail deferred.** `/staking/validators/$validator` was not added because no screen or field contract exists. Validator rows remain part of `/staking`.
4. **Staking linking writes deferred.** The page renders verified linking status and the permanent-control warning, but does not call `linkStakingUser`. There is no unlink control.
5. **Pending withdrawal remains aggregate.** The UI uses returned total/count and exact history, without fabricated queue identifiers, unlock timestamps, or progress bars.
6. **Scope is limited to the audited routes.** Referrals remains unchanged and section 18c is excluded.
7. **Leaderboard parity is deliberately partial and disclosed.** The page implements all four periods and sorts, the observed AND threshold, exact feed values, network-matched Vault-address exclusion, and protected explorer links. No reviewed protocol/treasury special-address list exists, so policy `gatu-vault-feed-only-2026-08-14` explicitly does not claim exact parity with Hyperliquid's official ranking.
8. **Vault classification remains unavailable instead of guessed.** Official/User controls explain the missing reviewed policy and fail closed. Deposited and Leading use verified owner snapshots; public rows remain unclassified.

## 8. Final verification and delivery evidence

### 8.1 Delivered differences from the design references

The `.dc.html` files and their runtimes were used only for visual and interaction comparison; no design-runtime code was copied into the project.

| Design reference | Delivered difference and reason |
| --- | --- |
| Vault and Staking direct `input → done` demos | Replaced by the complete `input → review → awaiting → submitted → reconciling → done` model, including `rejected`, `apiError`, `unknown`, exact reconciliation, close locks, and cross-route/cross-tab recovery. |
| Vault 20 USDC minimum and universal four-day lock | Removed the unsupported minimum and enforce only the server-returned lock timestamp. Context copy distinguishes HLP's four-day latest-deposit lock from a user Vault's one-day lock. |
| Vault Official/User grouping and badges | Left visibly unavailable because neither the documented API nor the approved feed supplies a reliable classification. Deposited and Leading remain owner-backed; unknown rows are never guessed into a category. |
| Vault withdrawal preview | Does not promise static post-operation shares or requested amount as net received. Review copy covers forced position closure, slippage, commission, and closing cost; final values come from the ledger. |
| Staking “undelegate to seven-day queue” | Corrected: undelegation returns to Staking available after the delegation lock; only `cWithdraw` initiates the withdrawal queue (seven days on Mainnet, approximately five minutes on Testnet). |
| Staking per-withdrawal progress rows | Replaced with the authoritative aggregate amount/count and initiated/finalized history because the API exposes no stable queue ID or unlock timestamp. |
| Staking Claim and unlink controls | Omitted. Rewards auto-compound, and staking linking is permanent rather than unlinkable. Linking status and risk copy are read-only under this delivery boundary. |
| Validator detail route | Omitted because the handoff contains no detail screen, field contract, or state specification. Validator selection and current delegation remain on `/staking`. |
| Leaderboard exact official parity | Explicitly not claimed. Policy `gatu-vault-feed-only-2026-08-14` applies the observed threshold rule and network-matched Vault-feed exclusion, but no reviewed protocol/treasury special-address list exists. |
| Unknown financial result with a transaction hash | Never fabricates a hash. The UI retains the exact non-secret operation tuple, blocks resubmission, and reveals a real hash only after a matching ledger/history record appears. |
| Handoff geometry and colors | Mapped to existing semantic project tokens; only missing `--earn-*`, `--staking-*`, `--vault-detail-*`, and `--funds-action-*` values were added centrally. Responsive behavior uses the project's inclusive 1000px mobile breakpoint. |

### 8.2 Acceptance screenshot matrix

The checked-in screenshot root is:

```text
docs/leaderboard-vaults-staking-redesign/screenshots/<locale>/<theme>/<viewport>/<surface>.png
```

The dimensions are exact:

- locales: `en`, `zh`
- themes: `light`, `dark`
- viewports: `desktop-1440x900`, `mobile-375x844`
- surfaces: 14 rows below
- total: **14 × 2 × 2 × 2 = 112 PNG files**

Each query is a DEV-only deterministic fixture trigger. Production builds ignore these fixtures. To reproduce, run the terminal on port 3006, select the listed locale/theme through the existing app controls, set the viewport, and open the relative URL. Every fixture uses placeholder addresses and synthetic values; no real account, credential, or private key appears in the screenshots.

| Surface/file | Trigger URL | Expected state | Copies across locale/theme/viewport |
| --- | --- | --- | ---: |
| `leaderboard-normal.png` | `/leaderboard?fixture=normal` | Validated rows, periods, sorting, pagination, protected address links | 8 |
| `leaderboard-loading.png` | `/leaderboard?fixture=loading` | Loading skeleton | 8 |
| `leaderboard-error.png` | `/leaderboard?fixture=error` | Fail-closed feed error | 8 |
| `leaderboard-empty.png` | `/leaderboard?fixture=empty` | Definitive empty dataset | 8 |
| `leaderboard-no-results.png` | `/leaderboard?fixture=no-results` | Search no-results while source rows exist | 8 |
| `vaults-normal.png` | `/vaults?fixture=normal` | Validated public rows; fail-closed classification; owner-backed Deposited/Leading facts | 8 |
| `vaults-loading.png` | `/vaults?fixture=loading` | Loading skeleton | 8 |
| `vaults-error.png` | `/vaults?fixture=error` | Fail-closed public-feed error | 8 |
| `vaults-empty.png` | `/vaults?fixture=empty` | Definitive empty dataset | 8 |
| `vault-detail-normal.png` | `/vaults/0x0000000000000000000000000000000000000101?fixture=normal` | Placeholder-only detail, chart, risk copy, and owner metrics | 8 |
| `staking-normal.png` | `/staking?fixture=normal` | Validator, delegation, reward/history, aggregate withdrawal, and action entry surfaces | 8 |
| `staking-loading.png` | `/staking?fixture=loading` | Public/account loading state | 8 |
| `staking-error.png` | `/staking?fixture=error` | Fail-closed public/account error | 8 |
| `staking-empty.png` | `/staking?fixture=empty` | Definitive empty/no-stake state | 8 |

Browser QA covered all four routes at desktop and 375px mobile widths. The inspected pages reported no browser errors and no horizontal page overflow (`clientWidth === scrollWidth`). Financial action stages and results are verified by exhaustive unit/controller/component tests rather than screenshots containing wallet or signing material.

### 8.3 Changed-file inventory

Only the following delivery-owned categories belong to this redesign:

- Page modules and tests:
  - `apps/terminal/src/components/leaderboard/**`
  - `apps/terminal/src/components/vaults/**`
  - `apps/terminal/src/components/staking/**`
  - `apps/terminal/src/components/funds-action/**`
- Routes and app composition:
  - `apps/terminal/src/routes/leaderboard.tsx`
  - `apps/terminal/src/routes/vaults.tsx`
  - `apps/terminal/src/routes/vaults.index.tsx`
  - `apps/terminal/src/routes/vaults.$vaultAddress.tsx`
  - `apps/terminal/src/routes/staking.tsx`
  - `apps/terminal/src/routes/__root.tsx`
  - `apps/terminal/src/routeTree.gen.ts`
- Navigation:
  - `apps/terminal/src/components/trade/header/top-nav.tsx`
  - `apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx`
  - the matching navigation tests under `apps/terminal/src/lib/tests/`
- Hyperliquid integration:
  - `packages/hl-react/src/public-stats-data.ts`
  - `packages/hl-react/src/hooks/usePublicStatsData.ts`
  - `packages/hl-react/src/internal/exchange/funds-action-lock.ts`
  - `packages/hl-react/src/explorer.ts`
  - `packages/hl-react/src/index.ts` and `packages/hl-react/package.json`
  - `apps/terminal/src/lib/hyperliquid/index.ts`
- Safety, presentation, and localization:
  - `apps/terminal/src/hooks/use-geo-restriction.ts`
  - `apps/terminal/src/config/security-headers.ts`
  - `apps/terminal/src/styles.css`
  - `apps/terminal/src/locales/{ar,en,es,fr,hi,zh}/messages.po`
  - the funds, public-stats, domain, controller, view, export, lock, and navigation tests under the page directories and `apps/terminal/src/lib/tests/`
- Delivery evidence and build accounting:
  - this file and `docs/leaderboard-vaults-staking-redesign/screenshots/**`
  - `scripts/check-client-bundle-budget.mjs`

No third-party dependency was added.

### 8.4 Shared-file exceptions

| Shared file/surface | Why it changed | Existing behavior preserved |
| --- | --- | --- |
| `packages/hl-react` public-stats adapter and exports | Centralizes undocumented App-feed access behind environment binding, runtime schemas, streaming limits, HTTP validators, and normalized caching instead of fetching in pages | Existing documented Info/Exchange hooks and cache keys are unchanged. |
| `funds-action-lock.ts` | Adds only `vaultTransfer`, `cDeposit`, `cWithdraw`, and `tokenDelegate` to the existing funds Web Lock and `retry:false` classification | All previously protected methods retain their behavior; linking writes remain disabled. |
| `explorer.ts` | Adds the missing typed address-URL helper required by Leaderboard rows | Existing transaction/token URL helpers are unchanged. |
| `use-geo-restriction.ts` | Exposes non-breaking error/resolved/retry signals so financial writes fail closed when geography cannot be established | Existing country/proxy/loading fields and public reads are preserved. |
| `security-headers.ts` | Allows the reviewed Hyperliquid App public-stats origin in `connect-src`; without it, the strict browser CSP correctly blocked the delivered Vaults and Leaderboard adapters | All existing API, RPC, WebSocket, wallet, analytics, and asset sources remain unchanged. |
| `routes/__root.tsx` | Mounts the lazy funds-action recovery host inside the existing Exchange scope so ambiguous actions survive route changes | Provider ordering and existing route surfaces remain intact. |
| Navigation and generated route tree | Converts only the Vaults, Staking, and Leaderboard placeholders into real desktop/mobile routes | Earn remains disabled; existing route identities and wallet controls are unchanged. |
| `styles.css` | Adds product-semantic variables only | Existing token values and shared component styles are unchanged. |
| `lib/markdown.tsx` | Replaces table array-index React keys with stable occurrence keys to satisfy the repository lint gate | Markdown output and styling are unchanged. |
| `check-client-bundle-budget.mjs` | Records the newly measured total baseline and adds explicit Leaderboard, Staking, and Vaults surface budgets | Existing trade, token-selector, API-wallet, largest-chunk, and allowed-increase checks remain enforced. |

### 8.5 Regression confirmation

| Existing behavior | Confirmation |
| --- | --- |
| Referrals / design section 18c | No Referrals route, component, copy, or Claim behavior was changed. |
| Trading onboarding and Agent/API wallet | Registration, signing identity, persistence preference, builder-fee timing, and wallet connection behavior were not reimplemented or altered. Vault actions reuse the existing exact-owner Agent path; Staking actions use the exact active master wallet. |
| Portfolio/account Vault data | Existing portfolio equity queries and account views remain untouched. New pages reuse typed integration queries without replacing existing consumers. |
| Shared UI primitives | Button, Card, Table, Modal/Sheet, toast, and theme behavior were reused through page wrappers; no shared primitive behavior changed. |
| Desktop/mobile navigation | Route and active-state tests cover the three newly enabled links. Existing links and the disabled Earn item remain intact. |
| Funds concurrency | Tests confirm the new methods enter the same Web Lock and no-retry path without dropping protection from existing methods. |
| Environment and identity isolation | Public feeds never cross-fallback between Mainnet/Testnet; account queries use the verified owner; unresolved legal/geo/identity states disable writes rather than becoming zero/allowed. |
| Sensitive data | No Agent private key, wallet credential, or sensitive request field is sent to a backend, logged, persisted in the recovery marker, captured in fixtures, or included in screenshots. |
| External links | Leaderboard explorer links use the integration helper with `target="_blank" rel="noopener"`. |

### 8.6 SDK/documentation audit corrections

The post-implementation audit against pinned `@nktkas/hyperliquid@0.33.3`, current Hyperliquid developer documentation, and live read-only Mainnet/Testnet response shapes produced these corrections:

- Public Leaderboard/Vault feeds are now permitted by the app CSP; schema, environment, streaming-size, and fail-closed controls remain in the integration adapter.
- A disconnected public Vault detail omits the optional `user` parameter instead of passing `undefined`, so the shared Info hook does not incorrectly disable the public request.
- Staking performs a second fresh account/validator preflight at the SDK execution boundary. Reconciliation still uses the separately persisted pre-dispatch history and state baselines.
- `cWithdraw` copy is environment-specific: Mainnet uses the documented seven-day period, while current Testnet history and the official node README indicate approximately five minutes. An all-zero finalized-withdrawal hash is treated as a system-finalization sentinel and never linked as a transaction.
- Vault and Staking pages can hydrate only a semantically valid, exact owner/environment marker into `done/unknown`. Recovery is read-only, never re-enters signing, and retains the marker unless one unique post-baseline history event and the authoritative state direction both verify.
- Marker storage rejects invalid method/direction/asset/decimal/target combinations, duplicate IDs, and multiple operations for one environment/owner. Corrupt storage remains locked until the explicit two-step destructive clear.
- Vault non-funding-ledger reads now pass the documented `startTime`. A two-day lookback tolerates client/exchange clock skew, while the persisted hash baseline prevents older same-amount events from proving the new request.
- Cross-tab destructive confirmation is bound to the exact marker ID, so replacing marker A with marker B resets the two-step confirmation. Multiple exact history candidates remain `unknown` instead of being arbitrarily attributed.

Residual boundary: SDK success responses contain no transaction hash or request nonce that later history exposes. The implementation therefore verifies a unique matching history event plus a directional account-state change, but cannot cryptographically distinguish an otherwise identical operation submitted from another origin. The UI and this document do not claim that stronger attribution.

### 8.7 Verification commands and recorded results

| Command/check | Result |
| --- | --- |
| `pnpm lint` | Passed. The only diagnostic is the pre-existing `apps/terminal/src/lib/lazy.ts` `noExplicitAny` warning; there are no new lint errors. |
| `pnpm typecheck` | Passed for all three workspace packages. |
| `pnpm --dir apps/terminal exec vitest run src/lib/tests/funds-action-state.test.ts src/lib/tests/funds-action-reconciliation.test.ts src/lib/tests/funds-action-marker.test.ts src/lib/tests/funds-action-recovery-host.test.tsx src/components/staking/__tests__/use-staking-actions.test.tsx src/components/vaults/__tests__/use-vault-action-controller.test.tsx` | Passed: 6 files, 104 tests. This includes every action stage/result and transition, exact baselines, late/ambiguous outcomes, recovery, and zero blind retries. |
| Targeted fixture/controller/domain/public-stats Vitest groups | Passed in the recorded runs: one 8-file/57-test group and one 4-file/22-test group. Coverage includes DEV-only fixture gating, page states, sorting/filtering, feed isolation/limits, malformed responses, and Vault classification failure behavior. |
| `pnpm i18n:extract`, `pnpm i18n:compile`, and `msgfmt --check --check-format` for all six catalogs | Passed. English and Chinese are complete for the new copy; the Chinese catalog has no remaining non-obsolete untranslated message. |
| `pnpm build` | Passed. Client and server/Nitro builds, static-import cycle check, total bundle budget, and the explicit Leaderboard/Staking/Vaults surface budgets all passed. Final measured client gzip is 2,996,804 bytes; Leaderboard/Staking/Vaults route chunks are 9,638 / 23,907 / 27,709 gzip bytes respectively. |
| `PATH=/Users/zhixing/.nvm/versions/node/v22.18.0/bin:$PATH pnpm --dir apps/terminal exec vitest run --maxWorkers=1` | Passed: 362 files and 3,285 tests; one intentional soak test skipped. The single-worker run avoids the suite's known `mobile-agent-sync-route` parallel `act()` timing fluctuation while exercising the complete test inventory. |
| Browser acceptance on `http://localhost:3006` | Passed for the captured desktop/mobile routes: no page errors, no horizontal page overflow, and all 112 screenshot files are present. |

The commit contains only the files listed in this delivery. Concurrent Balance-surface changes remain unstaged and are not used as evidence for this redesign.
