<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-brand-followups",
  "date": "2026-10-01",
  "title": "Sairn 品牌迁移的五项遗留：页头、设计稿、官网、跨浏览器、状态动效",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "docs-governance", "static-hosting"],
  "summary": "处理品牌迁移执行记录留下的五项遗留（进行中）：设计稿 mockups.pen 的产品名标签已替换，HT/A 字母徽标与蓝紫色板保留并写明原因。",
  "thread": null,
  "baseCommit": "f440fa1b",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md" },
    { "path": "docs/brand-assets.md" },
    { "path": "designs/mockups.pen" }
  ],
  "supersedes": []
}
-->
# Sairn 品牌迁移的五项遗留：页头、设计稿、官网、跨浏览器、状态动效

## 背景与范围

同步记录，未取得可核对的任务标识。分支 `claude/from-dev-1001`，基线 `f440fa1b`（品牌迁移执行记录 [2026-10-01-sairn-brand-migration-execution](2026-10-01-sairn-brand-migration-execution.md) 的最后一个提交）。

用户要求继续审查执行记录列出的五项遗留，规划并执行修复；缺失的状态动效素材依据设计方动效库补做后替换旧的：

1. 状态动效没有接入，动效库缺「部分成交」「提示」「警告」三个符号；
2. 已连接钱包的页头没有测量（法语在 1182 px 未连接时只剩 29 px）；
3. 没有在 Safari、Firefox 和手机真机上看过；
4. `designs/mockups.pen` 仍是旧品牌；
5. 官网从 2026-07-19 起没有发布，累计差异未审查。

先用一个只读调研工作流（五路并行，每路报告保存在会话草稿目录，不入库）取证，再逐项修复。调研报告的结论在下文按项引用，引用处注明是调研结果还是本次复核。

## 结论与依据

### 设计稿 `designs/mockups.pen`

- 调研结果：文件里的旧品牌只有名称标签（`GATU` ×3、`gatu` ×3、`Hype UI` ×1）、三个 `HT` 字母徽标方块，以及上游早期探索稿的占位名 `ANVIL` 和字母 `A`（各 3 处）。没有路径或图片节点，没有旧品牌柠檬绿，也没有网址。颜色变量是上游 Anvil 的蓝紫色板，既不是 gatu 色也不是 Sairn 色。
- 采用：用只改叶子值的脚本替换 10 个名称标签（含 `ANVIL`，因为它占着产品名的位置，用户要求全部品牌标识换成 Sairn）。序列化与原文件逐字节往返一致，差异正好 10 行，叶子数、键顺序、末尾无换行、`\u` 转义数量都不变；`HYPE-USDC` 是 Hyperliquid 交易对，不改。
- 未改：`HT` / `A` 字母徽标方块和蓝紫色板。文件是 pen.dev 2.10 格式，没有任何路径节点可以参照写法，本机没有 pen.dev 无法渲染核对；一个路径节点只能填一种颜色，Sairn 横版组合需要三个；组件实例 `8GFpt` 按 id 覆盖了徽标节点的位置。用脚本造这些节点可能让文件打不开，所以留给在 pen.dev 里手工替换（步骤写在 `docs/brand-assets.md`）。色板不是令牌来源（唯一来源是 `brand/brand.json`），同步色板是另一个设计决定。

## 验证与限制

- 设计稿：替换脚本自带往返校验与差异行数断言，另一个独立脚本逐叶子比对原文件与结果（变化 10 个、增删 0、键顺序变化 0）；`grep -i -E 'gatu|hype ui|hyperterminal'` 无命中。没有用 pen.dev 打开或渲染。

## 后续与替代关系

- 在 pen.dev 中把三个 `HT` 徽标方块与 `A` 方块换成 Sairn 横版组合（见 `docs/brand-assets.md`「设计稿」）。
- 其余四项进行中，完成后在本记录补充。
