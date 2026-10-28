<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-28-japanese-interface-language",
  "date": "2026-10-28",
  "title": "交易终端新增日语界面语言",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "运营方要求在新工作树里安排 Codex（gpt-6-astra）为交易终端增加日语。新增 ja 目录（2,158 条现行消息全部翻译，占位符、标签与 ICU 结构逐条一致），语言菜单显示「日本語」，日期用 ja-JP（拉丁数字），TradingView 用 ja，数字仍跟随独立的数字格式设置。审查后修正了两条复数消息缺少的单数分支，并把代币分类标签改回与其他语言一致的英文。全量 Vitest 通过（唯一失败为沙箱端口限制，沙箱外重跑通过）；新目录块使客户端总量 +38,736 gzip 字节（成对固定身份构建），总量基线相应抬高。未推送、未做真实浏览器检查与母语审校，官网语言清单未改。",
  "thread": null,
  "baseCommit": "f7423d70",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/lingui.config.ts"},
    {"path": "apps/terminal/src/config/i18n.ts"},
    {"path": "apps/terminal/src/config/chart.ts"},
    {"path": "apps/terminal/src/lib/bootstrap-error-copy.ts"},
    {"path": "apps/terminal/src/locales/ja/messages.po"},
    {"path": "apps/terminal/src/lib/tests/chart-locale.test.ts"},
    {"path": "apps/terminal/src/lib/tests/token-selector-category-catalogs.test.ts"},
    {"path": "docs/i18n-presentation.md"},
    {"path": "docs/terminal-performance-baseline.md"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "CHANGELOG.md"}
  ],
  "supersedes": []
}
-->
# 交易终端新增日语界面语言

## 背景与范围

2026-10-28 运营方要求：新建一个工作树，安排 Codex 的 gpt-6-astra 模型为交易终端增加日语语言环境，符合项目规范且不影响功能。同步记录。

- 工作树 `.claude/worktrees/japanese-locale`，分支 `claude/japanese-locale`，基线 `origin/dev` f7423d70。
- 实施由 Codex CLI 0.154.0 完成：`codex exec -m gpt-6-astra -s workspace-write -c approval_policy='"never"' -c model_reasoning_effort='"medium"'`，约 16.7 万 token，提示词写明不提交、不推送、不改官网与 `brand/`。Claude Code 负责提示、审查、修正、验证与提交。
- 范围只限交易终端（`apps/terminal`）与其文档；官网 `apps/website` 的语言清单文案未改。

## 结论与依据

- **接入点**：`lingui.config.ts` 的 `locales` 加 `ja`（在 `zh` 之后）；`config/i18n.ts` 的 `locales` 显示名「日本語」、`languageToIntlLocale.ja = "ja-JP"`；`config/chart.ts` 映射 TradingView `ja`；`bootstrap-error-copy.ts` 增加日语启动失败文案。非英语目录本来就是 `import.meta.glob` 懒加载块，加载器、哈希校验（`lib/i18n-catalog.ts`）不需改动。
- **不变的部分**：数字格式（`legacyNumberFormatLocaleMap` 已有 `ja-JP → en-US`）、其他 6 个目录（`i18n:extract` 后零差异）、SEO 静态文案、现货资产描述（Hyperliquid 快照只有 en/es/fr/zh-CN，日语沿用不支持语言的回退，测试已覆盖 `ja` 与 `ja-JP` 返回 null）。
- **术语**：资金的 Deposit/Withdraw 译为入金／出金；Earn 的 Supply 译为預け入れ，它的说明和结果通知里的 withdraw 写作引き出す。Earn 的 Withdraw 按钮与弹窗标题和资金出金共用同一个 msgid `Withdraw`（中文同样共用「提款」），所以显示为「出金」；要分开，得给源码加消息上下文，所有语言都要跟着改，本任务没做。其余术语：成行／指値／逆指値、板、証拠金、清算価格、資金調達率、無期限先物／現物、利確／損切り、統合アカウント，Reverse 统一为ドテン；品牌、代币符号、协议缩写保留原文。「Earn」作为产品名保留英文。
- **审查修正**（Codex 产出之后）：
  - 两条复数消息（`cancel-all-orders-modal`、`position-close-all-modal`）的英文单数分支语义不同（「该笔订单」「可能不再受保护」），日语只保留了 `other`，数量为 1 时会显示「1 件をすべて」且把「可能」写成必然。补了 `=1` 精确分支。
  - 代币分类标签 `AI/Defi/Gaming/Layer 1/Layer 2/Meme` 在所有语言（含中文）都保留英文，Codex 译成了日语并在测试里为日语开了特例；改回英文并删掉特例，口径与其他语言一致。
  - `chart-locale.test.ts` 的导入空行、CHANGELOG 条目的换行。

## 验证与限制

在工作树 f7423d70 + 本任务改动上实际运行：

- 独立 PO 检查脚本（pofile + @messageformat/parser，脚本不入库）：en 2,158 条、ja 2,158 条同序同集，空译文 0，占位符／标签／ICU 参数不一致 0。
- `pnpm --filter @sairn/terminal i18n:extract`：ja Missing 0，其他 6 个 `.po` 无差异；`i18n:compile` 通过。
- `pnpm exec biome check <21 个改动的 ts/tsx>`：按仓库配置实际检查 16 个文件，无问题。`pnpm --filter @sairn/terminal typecheck` 通过。
- `pnpm --filter @sairn/terminal test --maxWorkers=4`：686 个文件中 684 通过、1 跳过、1 失败；失败的 `vite-development-cache.test.ts` 是沙箱禁止监听端口（`listen EPERM 127.0.0.1:5173`），在沙箱外单独重跑通过。
- 生产构建（各自工作树、无 `.env.local`、Node 22.15.0、协议规定的固定构建身份加 `VITE_MOBILE_PAIRING_ENABLED=false`）：本分支第一次构建在总量预算处失败（3,350,633，比 3,311,757 的基线多 38,876，允许 10,000），chunk 循环检查通过（443 个 chunk）。在临时工作树 `ja-budget-baseline` 构建 dev f7423d70 作对照：3,311,897（442 个 chunk），差值 +38,736，其中新 `ja` 目录块占 38,653；交易页静态启动 +190，手机与桌面运行时启动各 +4。按 `docs/terminal-performance-baseline.md` 的规则把总量基线抬到 3,350,493 并在该文档与 `scripts/check-client-bundle-budget.mjs` 写明测量；改后对同一产物重跑预算检查通过（+140），`node --test scripts/check-client-bundle-budget.test.mjs` 19 项通过，补跑 `inject-shell-preloads` 与 `collect-inline-script-hashes` 成功。CI 的元数据不同，读数可能相差几百字节。

以上是首个提交 4e760836 的验证；当时三个含日语的 Playwright 矩阵尚未运行。

### Codex 只读审查（运营方要求 gpt-6-astra、`low`、至少 3 轮）

命令：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"low"' --output-last-message <报告>`，每轮把上一轮的发现与处理交给下一轮证伪。审查方在只读沙箱里没有运行 Vitest、构建或浏览器，结论是静态核对加内存脚本。

- **第 1 轮**（审 4e760836，约 13.8 万 token，8.2 分）：2 项 P2、4 项 P3，均已核实。修复提交 3ada121c：
  - 推荐码与全部平仓两个浏览器夹具没有注册 `ja` 目录，日语用例实际渲染英文。现在两个夹具都导入 `ja`，遇到未注册的语言直接抛错，不再静默回退。
  - 二维码网络不一致提示把扫码设备译反，已改为「扫描桌面上显示的新二维码」。
  - 手机分页摘要 `{0} of {1}` 译成了件数，改为 `{0} / {1} ページ`。
  - 「両建て」有歧义，改为「未決済建玉（両側合計）」。
  - 唯一一处全角分号改为读点，测试期望同步。
  - Earn 的 Withdraw 与资金出金共用 msgid，只更正了本记录的说法（见上文术语）。
  - 修复后在沙箱外实跑：`referral-code-card.pw.ts` 20 项通过，`position-close-all.playwright.config.ts` 46 项通过，`TOP_NAV_CONNECTED_MATRIX=full` 下用 `--grep " ja"` 只跑日语的顶部导航 12 项通过（不是完整矩阵）。
- **第 2 轮**（审 3ada121c，约 14.4 万 token，8.4 分）：确认第 1 轮修复正确；新报 1 项 P2、3 项 P3，均已核实。
  - 修正了三条语境错误：Staking 验证者列头 `Commission` 误作推荐奖励（紹介報酬），改为「手数料率」；Vault 徽标 `Child` 改为「子ボールト」，`Closed` 改为「閉鎖済み」。
  - Earn 独有的 `Available to Withdraw` 改为「引き出し可能額」。
  - 本记录补上了第 1 轮的修复经过（就是这一节）。
  - 另用脚本扫描了 Vault、Staking、Referral、Earn、Leaderboard、API wallet 文件中含「注文/紹介/決済/出金/清算/ポジション」的短标签，并与中文对照，没有发现其他语境错误。
- **第 3 轮**（审 e88dea31，约 15.4 万 token，8.4 分）：确认第 2 轮修复正确；对全部 1,094 条 ≤3 词的消息逐条对照源码用途，新报 1 项 P2、3 项 P3，均已核实：
  - 逐仓保证金弹窗的 `Add to Target` 指目标杠杆，原译「対象に追加」，改为「目標まで証拠金を追加」。
  - 现货兑换的 `From` / `To` 误用了账户振替的「振替元/振替先」，改为「交換元/交換先」。
  - 存款方式选择里带 `Deposit method` 上下文的 `Transfer USDC` 原来和内部划转同译，改为「USDC を送金して入金」。
  - API 钱包的 `Validity` / `Current validity` 指天数和到期日，改为「有効期間/現在の有効期限」。
  - 另报一项既有 P2（不计分）：下单表单的订单类型标签页用的是无上下文的 `Market`。这条 msgid 被十几个组件当作「市场」列头共用，所以日语显示「市場」而不是「成行」，中文同样显示「市场」而不是「市价」。只改目录修不了，要改源码改用 `Order type` 上下文，会影响所有语言，本任务没改，待运营方决定。
- **第 4 轮**（窄范围，审 e88dea31..4bc653d0 的第 3 轮修复，并补查前三轮未覆盖的 4 词以上中长句：设置、主题、语言、PWA、启动与恢复、空状态、市场信息、图表、HIP-3、排行榜；约 10.4 万 token，9.3 分）：无 P0–P3 新发现，第 3 轮修复均确认。
- 第 4 轮后对 HEAD 4bc653d0 重跑：全量 Vitest（沙箱外，`--maxWorkers=4`）686 个文件中 684 通过、1 跳过，`client-bootstrap-error.test.ts` 一项 `vi.waitFor` 超时（手册登记的负载偶发项），与 `bootstrap-error-page.test.ts` 一起单独连跑 3 次，每次 7 项通过；typecheck 通过；PO 结构检查 2,158 条无空译文、无占位符不一致。审查修复只改了译文，没有重新做生产构建，包体数字仍是 4e760836 的测量。
- 审查方列出的既有、非本改动引入的英文显示（不计分，本任务不处理）：命令菜单 `command-menu.tsx` 的硬编码英文、推荐奖励的 `Token #` 回退、法律页正文只有英文（`legal-doc-page.tsx` 以 `lang="en"` 渲染）、Staking 验证者与 Vault 描述直接显示上游原文。

未做：真实浏览器里切换日语的目视检查（各业务页面的布局与长文案截断）、日语母语审校、真机验收。

## 后续与替代关系

- 推送前按手册第 7 节跑一轮 Codex 只读 `low` 审查；分支尚未推送，PR 未开。
- 日语母语者审校交易、风险与法律相关文案。
- 浏览器里按 `docs/i18n-presentation.md` 的热切换要求目视检查日语下的桌面、紧凑与手机布局；`top-nav-connected` 的完整矩阵只跑过日语子集。
- 既有的英文显示（命令菜单等，见上）若要修，需要在源码加翻译并补齐全部 6 种非英语语言。
- 官网 `apps/website` 的 Features/Hero 语言清单与 `docs/website-plan.md` 若要宣传日语，需另行修改。
