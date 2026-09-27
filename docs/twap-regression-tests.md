# TWAP regression contracts

TWAP tests must preserve the current execution and presentation contracts rather than require a particular source-code spelling. Read [mobile data presentation](mobile-data-presentation.md) before changing loading, error or stale-state assertions.

## Execution boundary

- Production TWAP placement enters through `useTrackedTwapOrder`; cancellation enters through `useTwapCancel`. Architectural checks may inspect TypeScript call expressions, but must accept options objects, whitespace and formatting changes.
- Test the cancellation hook's actual execution guard. Before the SDK request, the active owner and network, asset ID, TWAP ID and pending cancellation record must still match the claimed action. Missing guards, changed identities, modified parameters and invalidated claims must prevent the request.
- A successful SDK response is not final cancellation confirmation. The action remains pending until fresh TWAP data confirms it; an ambiguous request outcome preserves the pending state and prevents duplicate cancellation.
- A definitive rejection from a user-requested cancellation must remain visible as action feedback. Feedback from an old account or network must not leak into the current account.

## Mobile presentation

- An active subscription without a first snapshot, reconnecting subscription, failed read or stale snapshot must not display passive warning/error copy or offer cancellation of cached TWAP rows.
- Exercise stale/error cases with an existing nonempty snapshot, not only an empty array. The absence of an error branch in JSX is not evidence that the execution guards disappeared.
- Recovery to a current successful snapshot restores the real rows and routes cancellation with the exact market and TWAP ID. Only a successful current empty snapshot may show the empty-list conclusion.
- User-requested cancellation feedback remains visible while passive data is pending. Keep tests for this distinction separate from tests for quiet fetching.

## Export

TWAP 成交历史 CSV 导出。状态：已实现，未发布；没有真实钱包、真机或 testnet 验收。日期：2026-09-27。范围：桌面与手机 TWAP「Fill History」子视图底部的「Export CSV」、`hooks/trade/use-twap-fill-history-csv.ts`、`lib/trade/user-fills.ts` 的 `fetchUserTwapSliceFillHistory` 与按网络共享的 `getTwapSliceFillsExportPacer`，以及它们使用的 `lib/trade/info-weight-pacer.ts`。TWAP 下单与撤单边界（`useTrackedTwapOrder`、`useTwapCancel`）不涉及，也没有改动。

### 目标

Fill History 表格显示 `userTwapSliceFills` 快照与实时订阅合并后的最近 2,000 条（`MAX_TWAP_HISTORY_ROWS`）。导出按时间分页读取 `userTwapSliceFillsByTime`，给用户一份超出表格窗口的 TWAP 分片成交文件，对应官方终端 TWAP 成交页签的导出。依据侦察阶段读取的官方前端包（2026-09-21 本地留存副本，Git 忽略），官方同样调用 `userTwapSliceFillsByTime`，从 0 向后分页，文件名为 `twap_fill_history`，并按用户设置附带 `aggregateByTime`。

### 约束

- 只发只读 Info 请求，不签名。表格数据源、2,000 行显示上限、`useTwapSliceFills`、持仓面板工具栏都不变；成交历史 CSV（`useUserFillsCsvExport`）继续用 `retainItemsWhere: fill.twapId === null` 排除 TWAP 成交，两份文件互不包含。
- 导出是用户请求的动作。进度和结果只走 Sonner 短提示（[通知契约](trading-notifications.md)中复制与导出一行），不进入订单任务状态机。按钮名称固定为「Export CSV」，只在本次导出进行中（`isExporting`）禁用，与被动快照状态无关。
- 不新增被动数据提示，[数据展示契约](mobile-data-presentation.md)不变：未连接时不显示页脚；加载、失败、过期仍是原有的安静占位；「No TWAP fills found.」仍只在当前成功的空快照之后出现。
- 数字与日期只经 `lib/format.ts` 格式化，跟随导出时的数字格式设置与界面语言；表头和标签用订阅语言的 `useLingui` 翻译。

### 方案

- 分页器：`fetchUserTwapSliceFillHistory` 包装 `fetchTimeRangeHistory`。键为 `getUserTwapSliceFillKey`（`time:coin:tid`，跨页重叠按身份去重），时间取 `entry.fill.time`，每条经 `isValidUserTwapSliceFillHistoryItem` 校验；`requireAscending: true`，游标取页末时间，页内倒序即 `MalformedHistoryPageError`；`retainLatestItems` 为 `TWAP_SLICE_FILLS_EXPORT_LIMIT`（10,000），只限制内存中保留的条数，不提前结束分页；`maxPages` 沿用默认 200。结果经 `normalizeUserTwapSliceFills` 用外层 `twapId` 覆盖 `fill.twapId`，按时间升序；`truncated` 在分页达到上限或保留条数达到 10,000 时为真。
- 不设 `pageLimit`。该接口的页大小没有文档；若固定为 2,000，服务端以后返回更小的页时，`fetchTimeRangeHistory` 的「短页即结束」会在第一页后静默结束。不设时以空页或只含重叠记录的页结束，代价是每次导出多一次请求，并失去「单页超过 2,000 条即失败」的防护。
- 请求：`useTwapFillHistoryCsv` 通过 `useHistoryExportRunner` 取当前钱包地址与 `mainnet|testnet:address` 身份，同一时间只运行一次；逐页请求 `userTwapSliceFillsByTime({ user, startTime, endTime })`，首页 `startTime` 为 0，`endTime` 为点击时的 `Date.now()`。hook 只提供单次请求，重试由 `fetchUserTwapSliceFillHistory` 负责：每页经 `fetchHistoryPageWithRetry`，对 429、408 和 5xx 最多重试 3 次；有 `Retry-After` 时照它等待（`parseRetryAfterMs` 上限 60 秒），没有时 429 等 60 秒（`TWAP_SLICE_FILLS_EXPORT_RATE_LIMIT_FALLBACK_MS`，经新的 `rateLimitFallbackMs` 选项传给 `getQueryRetryDelayMs`；其他调用方不传，仍是共享的 10 秒），与官方终端遇到 429 等 60 秒一致。不发送 `aggregateByTime`：SDK 0.33.3 的请求 schema 没有该字段，会在发送前被剥离，见 [SDK 核对流程](hyperliquid-sdk-reference.md#audited-contracts)。
- 限流预算：Hyperliquid [限流文档](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)规定每个 IP 的 REST 请求共享每分钟 1,200 权重；Info 请求基础权重 20，`userTwapSliceFillsByTime` 属于「每返回 20 条另加权重」的接口。`getItemWeightedInfoRequestWeight` 按 20 + ⌈条数 / 20⌉ 计算（文档没说不满 20 条如何计，这里向上取整），一页 2,000 条约 120，只够每分钟约 10 页，而终端自己的 REST 读取也在同一预算里。成交历史导出不受影响：`userFillsByTime` 只提供最新 10,000 条，最多约 6 页；本接口没有这个上限，要从 0 走完全程。
- 节流：`fetchUserTwapSliceFillHistory` 要求调用方传入节流器（`pacer`），用它包住每一次请求尝试，重试也算在内。hook 传入 `getTwapSliceFillsExportPacer(getNetwork())`：模块级 `Map` 按网络（`mainnet`、`testnet`，即请求的 API 主机，与 `getInfoClient()` 用同一个 `getNetwork()` 判断）各保存一个 `createTwapSliceFillsExportPacer()` 实例，存活到标签页关闭，不随导出结束、组件卸载或中止而重建。每次尝试前按一整页（观察到的最大页 2,000 条，即 120）预留权重，若最近 60 秒已记录的权重加上预留超过 `TWAP_SLICE_FILLS_EXPORT_WEIGHT_PER_MINUTE`（720，每分钟预算的 60%），就等到足够多的旧记录移出窗口；尝试结束后记录权重：返回了页的按实际条数计，失败（包括会重试的 429、408、5xx）或中途中止的按整页预留 120 计，因为服务端可能已经计数。记录时间取尝试结束时刻（`performance.now()`，不受用户调整系统时钟影响），不早于服务端计数的时刻，窗口因此偏保守。结果是同一标签页内的导出，不论前一次是完成、失败还是被中止，合计在任意 60 秒内最多约 6 整页，余下约 480 留给终端其他读取。中止只取消本次正在进行的等待或请求，不清除已记录的权重，切走子视图再回来重新导出仍要等旧记录移出窗口。等待经 `waitForHistoryRetry`，账户或网络切换、卸载会立即中止等待，不再发下一页。每个 hook 实例经 `useHistoryExportRunner` 同一时间只运行一次导出，被中止的等待立即结束，被中止的请求立即记账，所以中止后马上开始的导出看到的是完整记录。节流器的检查不是预占：若两个同时挂载的 Fill History 页脚同时导出（现有布局中未发现这种情况），两者可能在同一时刻都通过检查。若服务端某页超过 2,000 条（未观察到），实际权重照样记录，下一页等待更久，窗口最多超出那一页多出的部分。
- 耗时：约 10,000 条以内（至多 5 整页加 1 次结束请求）不等待；12,001 条需要 8 次请求，第 7 次等约 60 秒；30,000 条需要 17 次请求，约 2 分钟；默认 `maxPages` 200 页用满约 33 分钟。前一次导出在最近 60 秒内用掉的权重照样占用预算，所以紧接着重新导出时，第一页也可能要等。等待期间一直显示 loading 提示。
- 文件：`twap_fill_history.csv`，列与 `trade_history.csv` 相同，两份文件可以直接拼接：Time（`formatDateTimeShort`）、Asset（`coin`）、Direction（强平为 `Liquidated`，否则为方向标签）、Type（固定 `TWAP`）、Price（`formatUSD`）、Size（`formatNumber` 加市场 `szDecimals`）、Fee（`formatToken` 加 `feeToken`）、PNL（非零时 `formatUSD` 带符号，否则 `FALLBACK_VALUE_PLACEHOLDER`）、Transaction（`hasUserFillExplorerTransaction` 判定为全零哈希时为 `FALLBACK_VALUE_PLACEHOLDER`，与表格不给这类成交浏览器链接一致）。
- 提示：开始时 `Exporting TWAP fill history...`（loading）；成功为 `CSV exported.`；达到保留上限为 `CSV export reached the history limit. Some records were not included.`（warning）；其他错误为 `Failed to export TWAP fill history.`，不显示原始错误。三者复用同一个 toast id。账户或网络切换、组件卸载会中止请求，撤掉提示，不下载文件。
- 界面：桌面 `TwapFillHistoryTable` 在表格外壳之后增加 38px 页脚（`data-testid="twap-fill-history-footer"`），按钮样式与成交历史页脚相同，只在钱包已连接且有地址时渲染；没有「View all」，因为 gatu 没有 TWAP 成交历史页面。手机 `MobileTwapFillHistoryList` 在等待、确认空和列表三种状态渲染页脚（`data-testid="mobile-twap-fill-history-footer"`，按钮 38px 高、`after:h-11` 触控热区、`active:text-market-close-fg` 按压反馈）；列表状态放在卡片与「Load more」之后，contained 模式下位于滚动内容末尾，page 模式下跟随内容；未连接时不渲染。Current 与 History 子视图不显示该页脚。

### 状态

| 情况 | 表格或列表 | 导出页脚 |
| --- | --- | --- |
| 未连接 | 桌面为连接提示，手机为空容器 | 不显示 |
| 首次加载、空闲 | 安静占位，`aria-busy` | 显示，可用 |
| 快照读取失败 | 安静占位 | 显示，可用 |
| 实时流降级且无记录 | 安静占位；桌面另有中性「Retry」 | 显示，可用 |
| 当前成功的空快照 | `No TWAP fills found.` | 显示，可用 |
| 有记录 | 最近 2,000 条，分页显示 | 显示，可用 |
| 导出进行中（含节流与 429 退避等待） | 不变 | 名称不变，禁用；进度只在提示里 |
| 账户或网络切换、切走子视图或页签 | 不变 | 请求中止，提示撤掉，不下载；已记录的权重保留，随后重新导出仍按剩余预算等待 |
| 导出失败 | 不变 | 错误提示，不含原始错误 |

### 备选与代价

- 表格显示超过 2,000 行：按时间分页只能从 `startTime` 向后读，SDK 0.33.3 的该方法没有 `reversed`，要读到更早的记录就得从 0 走完全程，还需要新的状态语义。本次不做。
- 固定 `pageLimit: 2000`：保留超页防护，但依赖未公开的页大小。本次不固定，理由见上。
- 发送 `aggregateByTime`：需要修改 SDK 补丁并增加「按时间合并成交」设置；官方终端按用户设置发送。gatu 的文件与表格一样是逐笔记录，一个分片跨多个挂单成交时，行数可能多于官方开启合并后的文件。
- 列集合：采用 `trade_history.csv` 的列，而不是表格列（Market、Trade Value、带报价币的 Closed PNL）或官方原始键（time、coin、dir、px、sz、ntl、fee、closedPnl）。代价是继承成交历史导出的限制：USDH 等报价的市场价格与 PNL 也以 `$` 显示；以 `-`、`=`、`+` 开头的单元格（包括占位符和负数）由 `escapeCsvCell` 加前置单引号；没有 TWAP ID 列。
- 保留上限 10,000：沿用成交历史导出的取舍，不是接口限制；官方最多读 200 页，不设保留上限。更活跃的账户只得到最新 10,000 条，并收到截断提示。
- hook 放在 Fill History 组件内：切换子视图或账户页签会卸载组件并中止导出，与其他导出一致。改放在 `TwapTab` / `MobileTwapTab` 并向下传递可以跨子视图保留导出，本次不做。
- 限流：一次导出可能读很多页。2026-09-27 侦察探测在约 50 次连续请求后遇到 HTTP 429；按上面的权重公式，连续读满 10 页就会用完每分钟预算。最初实现不节流，只靠 3 次 10 秒重试（共约 30 秒，短于一分钟窗口），大账户会以错误提示结束，并让终端其他读取在这段时间内收到 429；审查后改为上面的节流与 60 秒退避。代价是大账户导出变慢（30,000 条约 2 分钟），且提示不显示进度或正在等待；3 次重试都遇到 429 时约 3 分钟后才报错。
- 令牌桶节流：可以更平滑，但任意一分钟内允许「容量 + 补充」，最坏接近配额的两倍；滑动窗口给出与服务端计数方式无关的上界（任意 60 秒不超过 720），代价是超过 6 页后以约每分钟一批的节奏推进。
- 只加长 429 退避、不节流：仍会先连续打满预算，终端其他读取照样受影响。本次两者都做。
- 节流器随单次导出新建：最初每次调用 `fetchUserTwapSliceFillHistory` 都新建节流器，导出结束、中止或切走子视图后，已记录的权重随旧实例丢弃。2026-09-27 对抗审查（r1，P2）用假时钟复现：第一次导出在第 7 页的节流等待中被中止，立即重新导出又连发 6 页，0 秒内共 12 次请求、权重 1,440，超过 720，也超过每 IP 1,200 的配额。现改为模块级、按网络共享的节流器。代价：只在同一标签页内共享，多个标签页同时导出时各自按 720 计，合计仍可能超过每 IP 配额；测试要在用例之间调用 `clearTwapSliceFillsExportPacersForTests` 重置。放进持久化存储可以跨标签页共享，但 `performance.now()` 不能跨文档比较，得改用会被用户调整的墙钟，本次不做。
- 失败尝试的计法：重试原先在节流之内，只有最终成功的响应记账，中间失败的尝试不记。官方限流文档没说 429、5xx 或客户端中止的请求是否计权重、计多少，现在每次尝试都先等预算，失败或中止的按整页预留 120 记。按上限记只会让导出变慢、不会超出；代价是连续重试时后续页可能多等最多一个窗口。按基础权重 20 记更快，但服务端若按整页计就会低估。

### 验证

实际运行（2026-09-27，本分支工作区，结果均通过）：

- `user-fills.test.ts`：分页器跨 2,000 条页的重叠去重与请求游标；比 2,000 小的页不会提前结束；空首页；外层 `twapId` 覆盖；倒序页、缺 `twapId`、无效成交、超出 `endTime`、后续页早于游标时失败关闭；保留最新 10,000 条并标记截断；页数预算用尽时标记截断；中止后不再请求下一页。删掉 `requireAscending`、加上 `pageLimit: 2_000` 或删掉保留上限，分别都会让对应用例失败（本地变异检查，未提交）。
- 节流（审查修复后新增，假时钟）：`info-weight-pacer.test.ts` 覆盖权重公式（0、1、20、21、2,000 条）、窗口有余量时不等待、等最旧记录移出窗口、需要移出多条记录、超出预留的响应推迟后续请求、中止等待。`user-fills.test.ts` 用 30,000 条验证任意 60 秒内记录的权重不超过 720、请求时刻为 6 次在 0、6 次在 60 秒、5 次在 120 秒；3,688 条不等待；节流等待中止时不发第 7 页。`history-csv-twap.test.tsx` 用 vitest 假定时器验证 12,001 条导出在 59 秒时只发了 6 页、未下载，满 60 秒后发完 8 页并下载；无 `Retry-After` 的 429 在 59 秒内不重试、60 秒时重试并成功。`history-pagination.test.ts`、`query-retry.test.ts` 覆盖 `rateLimitFallbackMs` 只替换无 `Retry-After` 时的 429 延迟。去掉 `pacer.acquire` 会让三处节流用例失败，去掉 hook 的 `rateLimitFallbackMs` 会让 429 用例失败（本地变异检查，未提交）。
- `history-csv-twap.test.tsx`：请求参数恰好是 `{ user, startTime: 0, endTime }`，不含 `aggregateByTime`，不调用 `userFillsByTime`；文件名、表头、行值（含强平、零哈希、非零 PNL）与升序；成功、截断、坏页和请求失败的提示；单次运行；账户切换和卸载时静默中止（节流让首个请求晚一个微任务发出，用例先等请求发出再打断）。原有「成交历史导出只含非 TWAP 成交」用例保持不变。
- `desktop-twap-tab.test.tsx`、`mobile-twap-card.test.tsx`：页脚只出现在 Fill History；等待、失败、空快照和列表状态都可用；未连接时不存在；导出中禁用且名称不变；手机页脚位置、尺寸与触控热区。
- 契约扫描与相关组：`i18n-reactivity-contract`（新增三个文件）、`i18n-hot-switch`、`number-format-reactivity-contract`、`locale-format-contract`、`design-token-ratchet`、`modal-surface-contract`、`action-progress-label-contract`、`trading-action-button-label-contract`、`mobile-data-presentation-contract`、`dialog-dismiss-control-contract`，以及本页下方的 TWAP 回归命令。

审查修复 r1（2026-09-27，分支 `claude/sdk-fix-r1-twap-csv`，基于 `19af214b`）实际运行：

- 先写回归测试，在 `19af214b` 上确认失败：`history-csv-twap.test.tsx`「中止后立即重新导出仍要等待」在旧代码上，第二次导出立即又发 6 页（期望累计 6 次，实际 12 次）；「每次重试都计入预算」在旧代码上，两次 429 不记账，59,999 ms 内发出 8 次（期望 6 次）。
- 修复后新增并通过：`user-fills.test.ts` 让两次导出共用一个注入的节流器（第一次在第 7 页等待时中止），第二次的首个请求在 60 秒发出，两次合计在任意 60 秒内不超过 720；用伪节流器验证 429 重试、一条的页、空页依次记 120、21、20，请求途中被中止记 120；`getTwapSliceFillsExportPacer` 同一网络返回同一实例，不同网络返回不同实例。`history-csv-twap.test.tsx` 每个用例前重置共享节流器；上述两条 hook 用例用 vitest 假定时器（`setTimeout`、`clearTimeout`、`performance`）运行。`Retry-After: 0` 的重试被假定时器按 1 ms 调度，所以用例在 60 秒后再推进 1 秒，让最后几页发完。其余 `fetchUserTwapSliceFillHistory` 用例改为显式传入 `createTwapSliceFillsExportPacer(...)`，断言不变。无 `Retry-After` 的 429 等 60 秒的回退现在由 `fetchUserTwapSliceFillHistory` 传给 `fetchHistoryPageWithRetry`，不再由 hook 传入；原有 429 用例仍经 hook 验证。
- 变异检查（本地临时改动，已还原，未提交）：hook 改回每次导出新建节流器，「中止后立即重新导出」失败（12 次对 6 次）；注册表每次返回新实例，该用例与注册表用例失败；把重试移回节流之外、只记成功页，三条记账用例失败；分页函数忽略传入的节流器，六条用例失败（其中四条超时）。
- `pnpm exec biome check`（4 个改动的 TS/TSX 文件）通过。`pnpm --filter @gatu/terminal typecheck` 报 4 个错误，全部在 `funding-history-load-boundary.test.tsx` 的第 88、125 行；把本次改动的文件临时换回 `19af214b` 版本后错误相同，属于既有问题，本次改动没有新增类型错误。
- `vitest run` 本页下方 TWAP 回归命令的 11 个文件，加 `query-retry`、`i18n-reactivity-contract`、`number-format-reactivity-contract`、`locale-format-contract`、`design-token-ratchet`、`action-progress-label-contract`：17 个文件、339 个用例全部通过。未跑全量测试和 `pnpm build`，也没有做浏览器、真机或真实网络检查。

未做：浏览器与真机检查（38px 页脚在桌面 lg、md 与紧凑宽度下压缩表格可视高度的实际效果）、真实钱包导出、testnet 分页形状核对、大账户在真实网络下的限流表现（节流只经假时钟单元测试验证，服务端实际计数方式与不满 20 条的计法未核实）。

## Regression entry points

`order-submission-wiring.test.ts` owns the production entry-point inventory. `twap-cancel-hook.test.tsx` exercises the real cancellation guard, SDK-boundary behavior and action feedback. `mobile-twap-card.test.tsx` and `desktop-twap-tab.test.tsx` exercise the rendered views and exact cancellation arguments; desktop and mobile need not use identical passive-state copy. Tracking and reconciliation suites cover pending outcomes and confirmed completion.

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/order-submission-wiring.test.ts \
  src/lib/tests/twap-cancel-hook.test.tsx \
  src/lib/tests/mobile-twap-card.test.tsx \
  src/lib/tests/desktop-twap-tab.test.tsx \
  src/lib/tests/tracked-twap-hook.test.tsx \
  src/lib/tests/twap-reconciliation.test.tsx \
  src/lib/tests/user-fills.test.ts \
  src/lib/tests/info-weight-pacer.test.ts \
  src/lib/tests/history-pagination.test.ts \
  src/lib/tests/history-csv-twap.test.tsx \
  src/lib/tests/mobile-data-presentation-contract.test.ts
```
