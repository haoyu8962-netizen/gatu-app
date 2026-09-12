<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-12-neutral-surface-audit",
  "date": "2026-09-12",
  "title": "中性卡片底色与相邻弱填充全量源码审查",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "order-entry", "account-funding"],
  "summary": "同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。",
  "thread": null,
  "baseCommit": "43ce177c384377c3f1f84a92623d4892b0859624",
  "commits": [],
  "sources": [
    { "path": "docs/neutral-surface-audit.md" },
    { "path": "apps/terminal/src/styles.css" },
    { "path": "apps/terminal/src/components/trade/components/market-asset-info.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-disclosure-header.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-close-dialog-ui.tsx" },
    { "path": "docs/ui-ux-guidelines.md" }
  ],
  "supersedes": []
}
-->
# 中性卡片底色与相邻弱填充全量源码审查

## 背景与范围

本记录为本轮审查的同步摘要，不是完整会话导出。用户先在资产资料弹窗中标记“标的资产 ARB / 最大杠杆 10x”，询问底色样式及必要性，随后要求：“还有哪些功能块应用了这些底色的 请你review 一遍 确保没有遗漏”。本次按审查请求盘点源码，未将其扩大为全局删除底色。

基线为 `43ce177c384377c3f1f84a92623d4892b0859624`，完成前核对分支为 `codex/UIreview`，工作区在新增本次文档前干净。未取得可核验的原始任务标识，故 `thread` 为 null。用户截图仍属于会话附件，含个人账户信息，未复制进仓库，也未导出其他任务的对话。

## 结论与依据

完整证据与后续设计建议见 [中性底色审查](../../neutral-surface-audit.md)。三个 `*-card` 令牌在浅色主题都是 `#F7F9FB`，深色解析为半透明弱填充；同色不等于相同用途。

- 直接卡片引用为 42 行、28 个文件、43 次样式词出现。相邻 hover 与 `fill-weak/weaker` 合并后为 245 行、106 个文件、264 次出现。后者含官网的六个 Astro 文件；不是实际渲染实例数。
- 只读资产资料、逐仓/TP/SL/平仓摘要、充值/提现费用、API Wallet 复核和市场选择器页脚是精简候选。状态选择、输入和复制、加载占位、授权与结果核验不应按颜色批量删除。
- 展开共享影响：平仓摘要三个消费者、移动折叠头五个消费者、交易下拉共用样式；订单表头覆盖灰底为 `bg-modal`，TP/SL compact 灰底分支当前没有业务调用启用。
- 另外记录订单簿 hover、桌面拖动占位、官网代码底色和收益分享按钮 hover，避免 class 检索漏掉 CSS 直接引用或同色别名。

新增专题审查文档及逐文件清单，更新文档地图和本任务索引。未改变产品行为，不新增虚构 Release Notes 或“已采用”的 ADR。

## 验证与限制

源码读取与检索覆盖 `apps/`、`packages/` 的生产源文件，具体扩展名、排除项和检索式写入专题文档。读取令牌定义及匹配代码上下文，对关键共用组件进一步核对调用参数与类名覆盖。初次清单只含常见 TS/CSS 扩展名；补查 Astro 后增加官网 12 行、6 文件，最终数字按扩展后的范围报告。

在上述源码基线、本次文档工作区实际执行：

- 以 Python 重新扫描全部约定扩展名，按文件/行号/样式族对附录做多重集合比较：通过，245 行、106 文件、264 次样式词出现，未发现遗漏或额外登记。
- 检查专题文档、文档地图和任务记录中的仓库相对链接：457 个目标均存在。此检查不宣称远端访问或全部 Markdown 标题锚点已经验证。
- `pnpm memory:index`：索引生成成功；`pnpm memory:check`：通过；`pnpm memory:test`：8/8 通过。
- `git diff --check`：通过。

未运行应用构建、类型检查或业务回归，因为本任务仅修改文档。没有逐一打开全部业务弹窗，没有执行签名、资金操作或配对；不能把源码审查当成完整运行时视觉、可访问性或真实设备验收。

## 后续与替代关系

本轮审查交付不包含视觉实施。若后续精简，先从专题文档的只读候选入手，同步共享消费者及对应骨架，再验收深浅主题、桌面/移动、焦点/选择状态与长文本。保持当前主题契约，不将整组共享卡片令牌设为透明。

本记录没有整体替代既有记录；行号和计数绑定上述基线。未来实现变化应追加新的验证记录，并更新专题文档中的状态与清单。

2026-09-12 追加结果（基线 `32b73f68`）：已完成指定范围的 12 个组件文件修复，第 5 行未改；`pnpm typecheck`、12 个修改文件的 Biome check、`pnpm build`（含循环依赖与包体积检查）、`memory:index/check/test` 均通过（memory 8/8）；375px 与 1440px 完成受影响页面截图对比，账户相关弹窗使用真实组件与固定示例数据，深浅主题示例无渲染错误或横向溢出、前后文字一致，两张前态截图按基线 class 复现，证据保存在 Git 忽略的 `.worklog/2026-09-12/neutral-surface-fix/`；未新增测试，未执行真实签名或资金操作。
