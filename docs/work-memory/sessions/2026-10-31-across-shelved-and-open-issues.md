<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-across-shelved-and-open-issues",
  "date": "2026-10-31",
  "title": "搁置 Across 持久存款地址、保持 CCTP 方案，核对全功能审查后仍未修复的问题",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "运营方 2026-10-31 决定「搁置 Across，继续保持目前这个方案」，并要求检查还有哪些问题没有修复。Across：自助申请表即时发放 Integrator ID 与 API Key，可勾选的存款地址接口只有已弃用的 /swap/counterfactual（地址 24 小时有效）；9 月用当时的 Key 调 POST /deposit-addresses 五次都是 403 FORBIDDEN_API_KEY，10-31 用假 Key 发同样请求结果相同；新 Key 未探测。ADR 0004、接入设计与阅读入口补记搁置。未修复清单以 2026-10-30 全功能审查为准：第一批 P1 在六个本地分支修完但未推送、未上线；P2 41 项、P3 44 项、四项待运营方决定、2026-10-13 生产审计四项代码遗留与各发布记录的真实验收仍未完成。合并六个分支的本地预览 fccfa225：typecheck 通过，全量 693 个文件 690 通过，两项失败为沙箱端口与负载超时（后者单独重跑通过）。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
  "sources": [
    {"path": "docs/adr/0004-across-deposit-addresses.md"},
    {"path": "docs/across-deposit-addresses.md"},
    {"path": "docs/across-reference.md"},
    {"path": "docs/cctp-deposits.md"},
    {"path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx"},
    {"path": "docs/work-memory/sessions/2026-10-13-production-readiness-audit.md"},
    {"url": "https://docs.across.to/tools/integrator-id"},
    {"url": "https://docs.across.to/introduction/api-keys"},
    {"url": "https://docs.across.to/introduction/persistent-deposit-addresses"}
  ],
  "supersedes": []
}
-->
# 搁置 Across 持久存款地址，核对仍未修复的问题

## 背景与范围

同步记录，未取得任务标识。接续 2026-10-30 的全功能审查；那份记录（`docs/work-memory/sessions/2026-10-30-full-feature-audit.md`）和第一批 P1 的六份任务记录都在本地分支 `claude/p1-*` 上，尚未进入 `dev`。运营方先问 Across 持久存款地址能否申请；10-31 按建议在申请页提交后反馈「表单 无法申请 久地址」，随后决定「搁置 Across，继续保持目前这个方案，目前还有哪些问题没有修复了。检查下」。本记录只写决定、证据与未修复清单，没有改产品代码。

## 结论与依据

### Across 持久地址：搁置

- **自助申请表**（https://docs.across.to/tools/integrator-id，2026-10-31 读取页面脚本 `9278f3f99a659f9f.js`）：表单把 `email`、`projectName`、`discord`、`telegram`、`website`、`twitter`、`blurb`、`category`、`chains`、`apis` 发到同源 `/api/integrator`，答复里直接带 `integratorId` 与 `apiKey` 显示在页面上；已申请过的答复显示 `API Key & Integrator ID Already Generated` 并指向 Telegram（https://t.me/acrosstg）。可勾选的接口里与存款地址有关的只有 `/swap/counterfactual`（标签 `Deposit Addresses — Generate counterfactual deposit address`）；官方 FAQ 写明它已弃用、地址 24 小时有效，由 `POST /deposit-addresses`（`expiresAt` 为空的持久地址）取代。[API Keys & Integrator ID](https://docs.across.to/introduction/api-keys) 说 Integrator ID 经共享沟通渠道（Telegram、Slack）申请。表单没有条款勾选项。
- **9 月证据**（归档标签 `archive/across-deposit-addresses-20260920-weekly-revisions` 里 09-13、09-14、09-15 的任务记录）：用当时的 Key 调 `POST /deposit-addresses` 五次（三次普通请求，一次 SPOT 目的地、一次 PERPS 目的地），全部 403 `FORBIDDEN_API_KEY`「Invalid or missing API key」；`/swap/approval` 带不带 Key 都返回 200，说明不了权限。当时准备过一份支持请求（本机 `.worklog/2026-09-13/across-normal-request/`，未入库），记录里没有发送的记载。
- **10-31 对照**：用明显无效的 Key（`not-a-real-key`）和 9 月探测相同的故意无效请求体（目的链 1337、收款与退款地址都是非法值，不可能建出地址）发一次 `POST /deposit-addresses`，答复同样是 403 `FORBIDDEN_API_KEY`「Invalid or missing API key」（请求编号 `sfo1::iad1::h7j26-1793380759423-79bc891a1a52`）。所以在这个接口看来，9 月那把 Key 与假 Key 没有区别；同一请求体先被鉴权拒绝，说明鉴权在请求体校验之前。由此推断（未经 Across 确认）：持久地址权限需要 Across 团队另行开通，自助表单拿不到。
- **决定**：运营方不再测试新 Key，搁置 Across。[ADR 0004](../../adr/0004-across-deposit-addresses.md)、[接入设计](../../across-deposit-addresses.md)与[阅读入口](../../across-reference.md)已补记。现行方案不变：新存款只走 [CCTP](../../cctp-deposits.md)（外部钱包手动存款与 ADR 0040 的邮箱自动存款），另有 ADR 0034 的银行卡入金；提款由 `deposit-modal.tsx` 按 `usdcRouting` 走 CCTP（`sendToEvmWithData`）或 `withdraw3`。
- **来源链**：全功能审查决定表里「CCTP 流水显示具体来源链」要调 Across 的 `hyperliquid-transfers` 接口（把用户地址发给 Across、改 CSP），本记录把它随 Across 一并列为搁置，对应的待启动任务卡已撤下。运营方没有单独就这一项表态；如果只想搁置持久地址，这一项可以单独恢复。

### 2026-10-31 仍未修复的问题

编号与原文见全功能审查记录「二审结果」各表。远端 `dev` 仍是 `d99c2bc9`、`main` 仍是 `cdb47637`（`git ls-remote`），审查之后没有别的修复进入 `dev`，线上 p35 仍有下表所有问题。

| 类别 | 内容 | 现状 |
| --- | --- | --- |
| 已修、未推送 | 第一批 P1：`claude/p1-order-safety`（M1、A8、A1，交易延迟保护开关、Scale USD 封顶、TWAP 价格校验）、`claude/p1-funds-safety`（D1、D2、B4/D4）、`claude/p1-vault-dashboard`（E1、E16、E6、E14、E2 的 Max、E3、E4）、`claude/p1-history-tables`（B1、B2、B10、B16、D3、B5、B19、子账户与持仓量奖励流水）、`claude/p1-chart`（C1、C14）、`claude/p1-order-modify`（B3、只减仓触发单改单） | 本地分支，等运营方批准推送；后合进 `dev` 的那个 PR 要给 `position-market-close-entry.test.tsx` 的 HIP-3 保证金用例补 `reverseBlocked: false` |
| 已修、未推送（其他会话） | `claude/link-language-review-fixes`（5 个提交：带 `lang` 的导航改为网络优先，回访者点语言链接时不再启动上一版缓存的壳而丢掉语言参数）；文档分支 `claude/release-p35-record`、`codex/work-memory-2026-10-19`、`codex/work-memory-2026-10-26` | 都不在远端 |
| P2，41 项 | 下单 A2–A5、A11、A12；行情 M2、M4、C2–C4、C7、C9、C12、C15、C18；表格 B6–B9、B11、B13、B17、B21、B20/D9；资金 D5–D8；仪表盘 E2 其余（金库全额提取）、E5、E9、E12、E13、E15；多语言与全局 F1–F3、M3、M9；布局 F4 | 未开始；F4 需运营方先决定 |
| P3，44 项 | 审查记录「P3 与不成立」所列（B19 已随第一批修复），另含两条未送审的观察 | 未开始 |
| 待运营方决定 | 审查记录「需要运营方决定」第 2 项（市价滑点默认值与上限）、第 3 项（下单后是否保留 TIF、只减仓、TP/SL 勾选）、第 4 项（md 宽度的堆叠布局，F4）、第 6 项（Chase、Trailing Stop、现货 Strict 名单、子账户等；多资产存款随本记录搁置）；ADR 0041 记录里已有订单历史的 `default` 账户与 `dexAbstraction` 账户是否照官方做强制迁移弹窗 | 未决定 |
| 需运营方操作或取证 | 金库全额提取（`usd: "0"`）先在测试网提取一次再写 ADR；只减仓触发单改单的 `a: true` 与 `oid` 是否保留要在测试网签名核实；GitHub 分支保护；各发布记录列出的真实验收（真实下单与过期拒绝、发送与提现、金库、推荐、邮箱自动存款、外部钱包无名 Agent 与首单、配对清单 RD-1..RD-3、物理滑杆、银行卡 CF-11 与法律审阅、新账户自动设为统一账户、日语母语审校） | 未做 |
| 2026-10-13 生产审计的代码遗留 | 现货缺价时用入场成本冒充市值；图表 iframe 同源 `unsafe-inline`；Service Worker 缓存 opaque 图标；外部钱包存款 `directSubmissionStarted` 缺 Hook 级异常路径测试（OI 未知放行按 ADR 0023 维持，不算缺陷） | 未修 |
| 其他记录的遗留 | 日语三处价格值显示无上下文的「市場」；发送确认步骤的 320px 换行没有用浏览器布局套件核对；ADR 0041 取证时的三个旁观现象（Privy 登录窗口钱包图标晚出现、内置浏览器面板 Service Worker 注册失败、Privy `analytics_events` CORS 报错） | 未修 |

本轮在预览分支 `fccfa225` 上抽查，下列问题仍在：M3（`command-menu.tsx` 仍写死 `Search markets...`）；A4（`lib/errors/definitions/twap.ts` 在设了触发价时仍拿最高/最低价与标记价比较）；D8（`send-modal.tsx` 的 Max 仍对数字类型的 `availableBalance` 向下取整）；M2（`styles.css` 未改，订单簿价格列仍是 `minmax(0, 1fr)`）；F1（逐条解析各语言 `messages.po` 的非废弃条目：es、fr、hi、ar 各 31 条空译文，zh、ja 为 0）。其余条目没有逐条重读代码：它们所在的文件要么第一批没有改动，要么改动不在该问题的范围内。

## 验证与限制

- `git ls-remote origin`：`dev` 为 `d99c2bc9`，`main` 为 `cdb47637`。本地分支是否在远端：上表列出的分支在远端都不存在。
- 预览分支 `claude/p1-preview`（`fccfa225`，合并六个 P1 分支）：`pnpm typecheck` 通过；`pnpm --filter @sairn/terminal test --maxWorkers=4` 693 个文件中 690 通过、1 跳过、2 失败。`vite-development-cache` 是沙箱禁止监听端口（各分支记录里已知）；`client-bootstrap-error` 的「最小遥测模块加载失败仍显示安全回退页」一项用时 1006 毫秒失败，当时另一个工作树在并行安装依赖，单独重跑该文件 2 项通过，判断为负载下超时。
- 未做：用新 Key 探测（运营方选择不测）、联系 Across；P2、P3 条目没有逐条重读代码（只抽查上述五项）；没有构建，第一批推送前的包体预算余量未测；真实交易、资金与真机验收都没做。
- `i18n:extract` 在第一批记录里打印的缺失数（ar、es、fr、hi 66，zh 3）与上面逐条解析的数字口径不同，原因未核对；界面上回落英文的是 31 条那一组。

## 后续与替代关系

- Across 持久地址重新启动的条件：先经 Across 的共享渠道取得 `POST /deposit-addresses` 权限并用无效请求体探测确认（预期 400 或 422，而不是 403），再按现行架构重做服务端设计（ADR 0004 补记）。
- 第一批六个分支等运营方批准推送并开 PR（base `dev`）；推送前在隔离工作树量一次包体预算。第二批按审查记录的修复规划分 PR。
- 本记录不替代全功能审查记录与 2026-10-13 生产审计记录，只补充 10-31 的现状；ADR 0004 的历史方案保留不改。
