<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-09-market-asset-info-scrim-test",
  "date": "2026-10-09",
  "title": "资产信息手机抽屉的遮罩断言跟上原语持有遮罩的规则，并纳入 CI",
  "kind": "task",
  "status": "recorded",
  "topics": ["docs-governance"],
  "summary": "dev 5cc5327a 上 market-asset-info.test.tsx 的「uses a minimum mobile height…」仍断言抽屉 overlayClassName 含 bg-trading-panel-scrim，而 7dcd49ee（PR #92）已按「原语持有遮罩、弹窗不得覆盖」删掉该组件的覆盖，故红。测试过时、组件正确：断言改为 data-overlay-class 为 null（与 legal-acceptance 同改法）。该文件不在 terminal-tests.yml 任何步骤里，所以 PR #92 的 CI 没拦住；已加入「Test terminal interaction and mounting contracts」步骤。Codex 只读对抗审查一轮 9/10、无 P0–P2，唯一 P3（记录误称另外三个测试断言遮罩类）已修正。",
  "thread": null,
  "baseCommit": "5cc5327a",
  "commits": ["0345a13c", "b0e47d17", "9b18dea4"],
  "sources": [
    { "path": "apps/terminal/src/lib/tests/market-asset-info.test.tsx" },
    { "path": "apps/terminal/src/components/trade/components/market-asset-info.tsx" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": "docs/work-memory/sessions/2026-10-09-dialog-scrim-standard.md" }
  ],
  "supersedes": []
}
-->
# 资产信息手机抽屉的遮罩断言跟上原语持有遮罩的规则，并纳入 CI

## 背景与范围

用户报告：在干净的 `origin/dev`（5cc5327a，PR #92 合入后）上，`apps/terminal/src/lib/tests/market-asset-info.test.tsx` 的 "MarketAssetInfo › uses a minimum mobile height so content-rich spot metadata can expand" 失败（26 过 1 败），`data-overlay-class` 期望含 `bg-trading-panel-scrim`、实际为 null。要求判断该改组件还是改测试，并查清为何 CI 没拦住。同步记录，无任务标识。分支 `claude/market-asset-info-scrim`，基线 5cc5327a。

## 结论与依据

- 组件正确、测试过时。7dcd49ee 有意删除 `market-asset-info.tsx` 的 `overlayClassName="!bg-trading-panel-scrim backdrop-blur-[2px] duration-200"`；`.claude/rules/style-ui-guide.md`「Dialog chrome」与 AGENTS.md 终端视觉契约规定弹窗不得自行覆盖遮罩、模糊，`modal-surface-contract` 扫描所有组件钉住这一点。恢复覆盖会直接违反该契约。
- [2026-10-09-dialog-scrim-standard](2026-10-09-dialog-scrim-standard.md) 记录「四个组件测试原本断言 `bg-trading-panel-scrim`」并已改过，但漏了本文件：它不在当时跑的 18 个文件里。
- 修复：断言改为 `expect(dialog?.getAttribute("data-overlay-class")).toBeNull()`，与 `legal-acceptance-modal.test.tsx` 在 7dcd49ee 中的改法一致。该测试的 `@sairn/ui` 桩把 `overlayClassName` 原样写到属性上，组件再传任何覆盖都会让它失败。
- CI：`.github/workflows/terminal-tests.yml` 只按清单跑测试文件，`market-asset-info.test.tsx` 不在任何步骤里，所以 PR #92 的 CI 通过。已加入「Test terminal interaction and mounting contracts」步骤（紧跟 `market-overview.test.tsx`，同属市场头部表面）。

## 验证与限制

- 2026-10-09，本分支工作区（基线 5cc5327a + 本改动）：`pnpm --dir apps/terminal exec vitest run --maxWorkers=2` 跑 `market-asset-info`、`modal-surface-contract`、`leverage-dialog-risk-warning`、`position-pnl-share-modal`、`adaptive-modal-dismissal` 五个文件，56 项全过。`node --test scripts/ci-workflows.test.mjs` 12 项通过。
- 2026-10-10 按 CI 参数补跑：`pnpm --dir apps/terminal exec vitest run --maxWorkers=1 src/lib/tests/market-asset-info.test.tsx` 1 个文件 27 项通过。`pnpm memory:index`、`memory:check`、`memory:test` 均通过，`pnpm exec biome check` 本测试文件无问题。
- Codex 只读对抗审查（`gpt-6-astra`，medium，单路覆盖行为证伪、规范与记录、变异）：9/10，无 P0/P1/P2，三条意图均判成立；指出 `duration-200` 由原语自带（`packages/ui/src/drawer.tsx`、`modal.tsx`），删除组件覆盖不影响 200ms 过渡。唯一 P3 见「后续」一节的更正。它的变异表说明新断言只证明组件不传覆盖，原语的遮罩颜色、模糊与边框由 `modal-surface-contract` 钉住；200ms 过渡（`duration-200`）只经源码核对，目前没有测试钉住。
- 未跑全量单测，也未在浏览器里打开资产信息抽屉（本次只改测试断言与 CI 清单，没有改运行时代码）。

## 后续与替代关系

- 更正（审查 P3）：检索 `overlayClassName` 时还命中三个不在 CI 清单里的测试，但它们都不断言弹窗遮罩：`leverage-dialog-risk-warning.test.tsx` 与 `position-pnl-share-modal.test.tsx` 的桩只是解构丢弃该参数；`adaptive-modal-dismissal.test.tsx` 检查的是原语把自定义 overlay 类透传下去。它们通过不能证明遮罩正确，与本次遗漏不是同类问题，无后续事项。
- 本记录补正 [2026-10-09-dialog-scrim-standard](2026-10-09-dialog-scrim-standard.md) 中「改了四个组件测试」的覆盖范围，不取代其结论。
