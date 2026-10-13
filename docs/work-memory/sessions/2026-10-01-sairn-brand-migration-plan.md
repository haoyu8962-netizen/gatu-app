<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-brand-migration-plan",
  "date": "2026-10-01",
  "title": "gatu → Sairn 品牌迁移：素材核验与分阶段计划",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "docs-governance"],
  "summary": "用户把 Sairn 设计交付物（Logo/图标套件 v1.3、Motion Library 与 Share Studio 两个 HTML 工具、iOS/Android/鸿蒙图标集）放进 brand/ 并要求规划替换。六路只读调查加两路对抗审查后形成 docs/brand-migration-plan.md：交付物缺 OG 卡、PnL 标注稿、maskable-192、域名与邮箱；存储键、Web Lock 名与 Agent 槽位名 gatu 默认保留（改名或换域名都会让资金与下单守卫失效）；页头三处 Logo 低于新规则的 24px；PWA 主题色按 runtime-guardrails §8 保持 #0F1A1F；官网线上版本停在 2026-07-19 且旧文件按 immutable 缓存一年。计划含 24 项待用户决定事项、阶段 0a–7 与仓库外清单。只改文档，未运行任何仓库测试，未实施任何阶段，brand/ 下的交付物仍未入库。",
  "thread": null,
  "baseCommit": "99ddc6b4",
  "commits": ["895c7cf9", "dba03dee"],
  "sources": [
    { "path": "docs/brand-migration-plan.md" },
    { "path": "brand/README.md" },
    { "path": "brand/brand.json" },
    { "path": "docs/adr/0038-unnamed-default-agent-for-trading-connection.md" },
    { "path": "apps/terminal/src/components/funds-action/funds-action-marker.ts" },
    { "path": "apps/terminal/src/lib/trade/cctp-deposit-tracking.ts" },
    { "path": "apps/terminal/src/lib/trade/order-asset-lock.ts" },
    { "path": "docs/runtime-guardrails.md" }
  ],
  "supersedes": []
}
-->
# gatu → Sairn 品牌迁移：素材核验与分阶段计划

## 背景与范围

同步记录，未取得可核对的任务标识。分支 `claude/from-dev-1001` 从 `dev` 的 `99ddc6b4` 建立。

用户先要求把品牌素材集中到一个文件夹，`895c7cf9` 新建了 `brand/` 投放目录、交付清单和 `brand-info.yaml`。随后用户放入设计方交付物，并要求查看素材、规划替换。交付物显示新品牌名是 Sairn，所以这是整体改名，不只是换图。

本次只产出计划，不实施任何阶段。用户放入的交付物（`brand/svg`、`png`、`web`、`social`、`ios`、`android`、`harmonyos`、两个 HTML 工具和 zip）以及用户改写后的 `brand/README.md` 都没有入库，留在工作区等用户决定（计划 D18、D19）。

## 结论与依据

计划全文见 [brand-migration-plan.md](../../brand-migration-plan.md)。要点：

- **交付物缺件**：两张 OG 卡、PnL 分享卡标注稿、`icon-maskable-192.png`、manifest 用的 `icon.svg`；新域名、邮箱和社交账号还没给（`brand-info.yaml` 未更新）。设计方补件清单在计划附录 B。
- **内部标识默认保留**：存储键和 Web Lock 名带 `gatu`，其中资金动作标记、CCTP 跟踪与授权意图、下单资产占位是失败关闭的防重复守卫（`funds-action-marker.ts:5-6`、`cctp-deposit-tracking.ts:108,110`、`order-asset-lock.ts:3-4`）。改键名会让在途操作的恢复和跨标签页互斥失效；换域名效果相同，所以计划为域名切换设计了迁移闸门（D23）。
- **Agent 槽位名保持 `gatu`**：`trading-agent.ts` 用 `APP_NAME` 作回退槽位名。改名会让外部钱包用户全部重新授权，并多占命名槽位。计划把显示名拆成新常量 `BRAND_NAME`，`APP_NAME` 不变。
- **几处与现有契约冲突**：
  - 交付的 `site.webmanifest` 用 `#0A3038` 作主题色，与 `runtime-guardrails.md` §8 的 `#0F1A1F` 冲突，计划保持 `#0F1A1F`。
  - 页头 Logo 现为 18px、22px、16px，低于套件规定的最小 24px。是否统一放大需要用户决定，放大前要按 §11 的方法实测导航余量。
- **建议分三个发布批次**：A 为用户不可见的准备工作；B 为品牌对外切换，终端和官网同时发布；C 为域名迁移，DNS 最后切。
- **审查处理**：两路对抗审查共 32 条意见，没有阻断级，全部采纳或部分采纳，逐条处理见计划附录 C。

## 验证与限制

**本次实际做过的**
- 用工作流运行了六路只读调查、一次汇总和两路审查，共 10 个子代理，结果只写进会话临时目录。
- 主会话亲自抽查以下结论，均属实：
  - Agent 回退名取自 `APP_NAME`。
  - 三组存储键都带 `gatu`。
  - `.DS_Store` 已被 `.gitignore:50` 忽略。
  - `terminal-tests.yml` 里没有 `pwa-manifest`、`trading-agent-config`、`legal-policy-contract`。
  - 页头 Logo 的尺寸类名（`top-nav-view.tsx:42,44`、`mobile-header.tsx:29`、`mobile-nav-drawer.tsx:186`）。
  - §8 的主题色要求。
  - 官网线上：`https://gatu.ai/` 的 `last-modified` 是 2026-07-19；`og-website-1200x630.png` 和 `gatu-logo-1024.png` 返回 404；`logo.svg` 带一年 immutable 缓存。
- 存入仓库前更正了计划里的两处出处（官网发布命令、Lingui 宏的教训）。它们原写成「工作记忆里记过」，实际只出自会话外的个人笔记，仓库里没有记录。另外补全了三个测试文件的路径前缀。

**没有做的**
- 没有运行任何仓库 vitest、Playwright、typecheck 或构建。
- 没有在 Safari、Firefox 或真机上测试。
- 没有登录任何第三方后台。

计划里的对比度数值、ΔE、包体估算和 Service Worker 实验都是调查期的临时测算，计划已标明范围；临时文件不在仓库里，会话结束后不可复查。

## 后续与替代关系

- **待用户决定**：计划第 2 节的 D1–D24。第一批是 D18、D19（以及是否同意处理用户改写的 `brand/README.md`），以及 D1、D4、D6、D14、D21。
- **不等决定就能做**：阶段 0a 余下的文档骨架与 ADR 草稿、阶段 1a（CI 覆盖、防静默失效、官网发布流程入库）、向设计方发补件清单。
- **ADR 编号**：计划预分配 0027–0031，动笔前要再查一次是否被占用。
- 没有被替代的记录。
- 修订（2026-10-01）：`brand/brand-info.yaml` 已在执行阶段由 `brand/brand.json` 取代并删除（`c2d47191`），本记录的来源随之改指 `brand/brand.json`；执行过程见 [执行记录](2026-10-01-sairn-brand-migration-execution.md)。

- 2026-10-09 更正：来源列表里的 `apps/terminal/src/config/trading-agent.ts` 已随 ADR 0038（普通交易连接改用无名默认 Agent）删除，来源改指向该 ADR；正文提到的文件名保留为当时的写法。

## 周整理补注（2026-10-12）

本轮新增变更中的 dba03dee 又移除了普通交易的命名 Agent 槽位，见 ADR 0038；不能从本记录早期方案恢复旧槽位。旧域名组与过渡头亦已退役并随 p28 发布，AWS 资源名、仓库名和带日期的历史仍保留。上周 42f2bd23 的其余摘要修订尚在独立分支，本轮不重复套用。

后续来源：[2026-10-09-unnamed-default-agent](2026-10-09-unnamed-default-agent.md)；[2026-10-08-cloudfront-release-p28](2026-10-08-cloudfront-release-p28.md)。

本补注为事后核对，原正文、失败与验证版本保留。本轮只核对 Git、任务记录和相关当前规范；来源执行结果不视为本次重跑。查询时间与实际 head 见[本周整理](2026-10-12-weekly-memory-review.md)。
