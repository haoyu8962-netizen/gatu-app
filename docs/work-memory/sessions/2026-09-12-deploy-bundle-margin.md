<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-12-deploy-bundle-margin",
  "date": "2026-09-12",
  "title": "部署包预算：订单队列去重与固定参数复验",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "pairing-release"],
  "summary": "服务器交易页面 gzip 超限 11 字节；统一订单队列计数与徽标渲染，保留预算和状态优先级，本地完整构建通过，交易页面距上限 227 字节，线上待验证。",
  "thread": null,
  "baseCommit": "23966794",
  "commits": [],
  "sources": [
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "apps/terminal/src/components/trade/tradebox/order-toast.tsx" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "docs/work-memory/sessions/2026-09-12-pr22-merge-validation.md" }
  ],
  "supersedes": []
}
-->
# 部署包预算：订单队列去重与固定参数复验

## 背景与范围

用户服务器日志报告 388 个客户端 chunk 无循环，但交易页面 gzip 为 123,218 字节，
较 119,207 基线增加 4,011 字节，超过 4,000 容差 11 字节。其余列出的预算通过。
之前日志显示服务器同步到 main `177c68c9`；本次没有连接服务器。
本地基线 `23966794` 工作区干净，与 origin/main 的差异只有上一任务的 Caddy 文档，
应用源码一致。GitHub 查询核对 PR #22 已合并，head `42349cb1` 的八项检查通过，
包括四种配对开关组合。因此 CI 通过不能保证其他构建身份下也有充足余量；
实际导致本次字节差异的环境因素尚未确认。

本记录是本次可见证据和决策摘要，不是原始会话导出；未核对任务标识，thread 为 null。
旧记录的历史验证结论保留，不将其整体标为失效。

## 结论与依据

先在性能规范写明约束，初次尝试共用 MarginModeForm 的三个重复声明。
客户端 gzip 从 123,153 增至 123,178，未改善预算余量，已撤回全部保证金表单修改。
以下初次保证金测试结果仅属于该已放弃方案，不用于证明最终订单队列实现。

最终方案：订单队列状态由七次 filter 改为一次计数，六种徽标共用渲染。
保留顺序、数量、翻译和样式；外框仍按 pending > 四种 warning > failed > success 选择。
逐笔订单、取消、移除计时、确认与对账逻辑不变。
新增混合状态计数/样式/语言切换与六组外框优先级回归检查。
不调整预算、构建拆包、交易签名、订阅或资金可用性判断。

## 验证与限制

使用 Node 22.15.0、pnpm 10.21.0，在修改前及修改后分别运行完整 terminal build：

```bash
GATU_BUILD_SHA=177c68c96327728fbaae42ab104edf74d855728f \
GATU_RELEASE_ID=20260912121556-177c68c9 \
GATU_BUILD_TIME=2026-09-12T12:15:56.000Z \
NODE_ENV=production NITRO_PRESET=node-server \
VITE_MOBILE_PAIRING_CREATE_ENABLED=true \
VITE_MOBILE_PAIRING_IMPORT_ENABLED=true \
pnpm --filter @gatu/terminal build
```

以上 release ID 和时间为固定的部署形态测试输入，并非已取得的服务器原值。
实际服务器环境未完整取得，不将本地构建冒充服务器复现。
修改前完整构建退出 0，388 chunks 无循环；gzip 结果：交易页面 123,153（距上限 54），
总量 3,059,934，静态启动 1,553,938，移动增量 111,590 / 合计 1,665,528，
桌面增量 196,770 / 合计 1,750,708。这个本地结果通过，不能声称重现了服务器的 11 字节超限。

初次保证金表单方案的阶段检查（随后撤回）：

- `pnpm exec biome check apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx`：通过。
- `pnpm --filter @gatu/terminal typecheck`：退出 0。
- `node --test scripts/check-client-bundle-budget.test.mjs`：15/15 通过。
- `pnpm --dir apps/terminal exec vitest run src/lib/tests/margin-mode-modal.test.tsx`：26/26 通过。
- `pnpm --dir apps/terminal exec vitest run src/lib/tests/i18n-hot-switch.test.tsx src/lib/tests/i18n-reactivity-contract.test.ts`：86/86 通过。

首次单测命令额外包含两个不存在的语言测试过滤路径，实际只运行保证金文件；随后用上述正确路径运行语言测试。
修改前构建还在生成服务端产物时，提前单独调用预算脚本报 `TanStack Start manifest was not found`；
该诊断不代表完整构建失败，随后同一完整构建成功产出 manifest 并通过预算检查。
最终订单队列方案的检查（同一份最终源码）：

- Biome 检查并格式化 `order-toast.tsx` 与 `order-toast-placement.test.tsx`：通过。
- `pnpm --filter @gatu/terminal typecheck`：退出 0。
- `pnpm --dir apps/terminal exec vitest run src/lib/tests/order-toast-placement.test.tsx src/lib/tests/i18n-hot-switch.test.tsx src/lib/tests/i18n-reactivity-contract.test.ts`：98/98 通过，含 12 项订单提示测试。
- `pnpm i18n:extract`：退出 0，六份 `.po` 文件无差异；已有缺失翻译统计保留（ar/es/fr/hi 各 12、zh 3），没有据此声明翻译全部完成。
- 包预算检查器源码及测试没有更改；前述 15/15 验证仍对应同一检查器版本。
- 最终客户端 chunk 为 122,980 gzip / 392,239 raw 字节，较固定参数原版减少 173 gzip / 1,469 raw；完整构建退出 0，所有预算通过，388 chunks 无静态循环。

完整构建固定参数对比（gzip 字节；最终实现为本记录同提交的订单提示与测试变更）：

| 指标 | 修改前 | 最终实现 |
| --- | ---: | ---: |
| 交易页面 | 123,153 | 122,980 |
| 全部客户端 JS + CSS | 3,059,934 | 3,059,757 |
| 静态交易启动（72 assets） | 1,553,938 | 1,553,697 |
| 移动运行时增量（11 assets） | 111,590 | 111,582 |
| 移动启动合计（83 assets） | 1,665,528 | 1,665,279 |
| 桌面运行时增量（25 assets） | 196,770 | 196,793 |
| 桌面启动合计（97 assets） | 1,750,708 | 1,750,490 |

没有更改检查器、基线、容差或 startup source roots。桌面增量小幅增加 23 字节，
其总启动体积仍降低，不能把各个 chunk 都描述为变小。
本地脱敏 stdout/stderr 保存在 Git 忽略的 `.worklog/2026-09-12/deploy-bundle-margin/`，
包括基线、已撤回方案和最终构建，以及最终测试/类型检查、预算检查器测试、翻译提取日志；
这不是完整会话或服务器日志的导出。

## 后续与替代关系

首次 memory:index / memory:check 因记录未使用模板规定的小节标题而失败；随后按模板修正标题。收尾 memory:index 和 memory:check 通过，memory:test 8/8 通过，git diff --check 通过。

没有执行远程部署、服务切换或真实钱包操作。此修复不构成上线或真机验收证据。
按用户此前提交和更新 PR 的授权推送补充 PR；原 PR #22 已合并，需要新 PR 承载本修复及上一轮 Caddy 文档。合并到 main 后才重跑服务器部署。
