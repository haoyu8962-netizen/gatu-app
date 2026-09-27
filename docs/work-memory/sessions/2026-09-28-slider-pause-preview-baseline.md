<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-slider-pause-preview-baseline",
  "date": "2026-09-28",
  "title": "滑杆暂停测试的预览基线竞态",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "滑杆浏览器测试「值来源在拖动中暂停」在 PR 48 的 CI 上偶发 Expected 5 / Received 6，根因在测试而不在组件：基线在一次 evaluate 里读取、暂停在下一次 evaluate 才设置，其间最后一步移动留下的 15ms 尾随预览会合法发布并被多计。改为在页面内挂 MutationObserver 后再暂停，在暂停提交写入 aria-disabled 的同一时刻读计数；6 倍 CPU 节流下原测试 2/25 以同一签名失败、新测试 25/25 通过。未改 trade-slider.tsx，输入均为 Playwright 协议注入，新版本未在 GitHub CI 上跑过。",
  "thread": null,
  "baseCommit": "24444b5b",
  "commits": ["1eea3e71"],
  "sources": [
    { "path": "apps/terminal/tests/browser/trade-size-slider-performance.pw.ts" },
    { "path": "apps/terminal/tests/browser/trade-size-slider-performance.fixture.tsx" },
    { "path": "apps/terminal/src/components/trade/components/trade-slider.tsx" },
    { "path": "apps/terminal/tests/trade-size-slider-pointer-lifecycle.test.tsx" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "path": "docs/slider-interactions.md" },
    { "path": "docs/adr/0018-slider-gestures-end-on-release.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/48" },
    { "url": "https://github.com/zora4523-bot/gatu-app/actions/runs/36328054185" }
  ],
  "supersedes": []
}
-->
# 滑杆暂停测试的预览基线竞态

## 背景与范围

用户报告：`apps/terminal/tests/browser/trade-size-slider-performance.pw.ts` 的「keeps focus and the gesture when the value source pauses mid-drag, then resumes and commits」在 PR 48（`claude/earn-page`，`81b1ba48`）的 CI 上失败一次，本地 `--repeat-each=20` 全过，同一工作流此前约 40 次运行都通过。后两条来自任务报告，本次没有复核。用户要求只改测试、不改 `trade-slider.tsx` 的行为。本记录与任务同步写成，没有可核对的会话标识（`thread: null`）。调查从 `e3b5dd82`（当时的 `main`）开始；提交前把空分支快进到 `origin/dev` 的 `24444b5b`，多出的 12 个提交共改 85 个文件，其中没有滑杆组件、夹具、测试、工作流或滑杆文档。

2026-09-28 用 `gh` 只读核对了失败本身：run 36328054185 的第 1 次尝试里，job「Terminal browser regressions (1/2)」（108644535408）在 `trade-size-slider-performance.pw.ts:155:59` 失败，`Expected: 5`，`Received: 6`，该 shard 其余 10 项通过；第 2 次尝试全部通过。

## 结论与依据

组件行为符合 `docs/slider-interactions.md` 的 `paused` 语义：暂停提交时，同一个 layout effect 先把 `latestRef.current` 更新为暂停状态、清除待发的预览定时器，最后由 `syncInputAvailability` 写入 `aria-disabled="true"`；定时器回调本身也检查 `paused`。暂停生效之后不会再发布预览。

失败来自测试的读取顺序。原测试先用一次 `page.evaluate` 读基线，再用另一次 `page.evaluate` 调用夹具的 `setPaused(true)`；这个 React 更新要等到之后的任务才提交。最后一步移动排下的 15ms 尾随预览如果落在「读基线」与「暂停提交」之间，暂停尚未生效，发布是合法的，但会被计在基线之后，于是暂停期间的计数比基线多 1。

采用的改法：新增辅助函数 `pauseAndReadPreviewCount`，在同一次页面内调用里先挂 `MutationObserver` 再暂停，看到 `aria-disabled="true"` 后，在该提交之后的微任务里读取计数作为基线。定时器回调是独立任务，无法插在这个提交与微任务之间，所以基线正好对应暂停生效的时刻；2 秒内没有看到该属性则明确报错，而不是等到用例超时。其余断言不变：手势仍在进行、焦点保留、`disabled` 为 false 且 `aria-disabled` 为 true、滑块跟到 80%、恢复后恰好多 1 次预览、松开后 1 次提交。

未采用的改法：先暂停、等过预览间隔再读基线。它同样能消除误报，但也放过了一类回归：暂停时不丢弃待发定时器的组件。下面的变异测试说明了这一点。

## 验证与限制

所有浏览器结果都来自 Playwright 协议注入的指针事件（`page.mouse` 经 CDP `Input.dispatchMouseEvent`），探针另用了页面内 `dispatchEvent`。它们证明真实引擎里的命中测试、布局、焦点与定时器，不证明操作系统捕获或事件顺序。本次没有改手势生命周期，不需要真人拖动验收。本机 macOS、Node v24.15.0（CI 用 22.15.0）、Playwright 1.59.1。下面三项探针、变异和节流在 `e3b5dd82` 上运行，最终版本的检查在 `24444b5b` 上重跑。

- 临时探针（已删除，未入库），各 10 次：在尾随定时器待发时按原顺序「读基线 → 20ms → 暂停」，10/10 失败，计数都比基线多 1；新读法在最后一次移动后 0、5、10、13、15、17、20、30ms 暂停，全部 10/10 通过；建议的「暂停 → 等待 → 读」10/10 通过。
- 临时变异（去掉定时器回调里的 `paused` 检查和暂停时清除定时器，随后用 `git checkout` 还原，并确认与 `e3b5dd82` 一致）：新读法在暂停时仍有待发定时器的 7/10 次运行中失败，另 3 次在暂停前定时器已经触发，没有可检测的对象；建议读法 10/10 通过，即检测不到该变异。
- 6 倍 CPU 节流（CDP `Emulation.setCPUThrottlingRate`，`CI=1` 使用 Playwright 自带 Chromium），各 25 次：`e3b5dd82` 的原测试 2/25 失败，都是 `Expected: 3` / `Received: 4`，位于同一条暂停计数断言，没有人为间隔也自然复现；新测试 25/25 通过。
- 最终版本：`pnpm --dir apps/terminal run test:browser:slider`（本机品牌 Chrome）22 通过；按 CI 工作流 `CI=1 … --fully-parallel --shard=1/2` 与 `2/2` 各 11 通过；`-g "pauses mid-drag" --repeat-each=50` 在品牌 Chrome 与自带 Chromium 各 50/50 通过。
- AGENTS.md「Slider gestures」的 9 个单测文件共 128 项通过；`pnpm --filter @gatu/terminal typecheck` 通过。
- `biome.json` 的 `files.includes` 不含 `tests/browser`；以 stdin 按 `src` 路径检查，诊断与改动前的文件相同（第 134 行用例标题格式与另外 3 处 `noNonNullAssertion` 都在未改动的代码里），没有新增。
- 测试改动提交为 `1eea3e71`（只含该测试文件），本记录与索引单独提交。
- 未执行：新版本在 GitHub CI 上的运行（未推送）。

## 后续与替代关系

- 推送与开 PR（目标 `dev`）等用户决定；合入后留意该工作流是否再出现同类失败。
- 暂停时丢弃待发定时器仍由 `tests/trade-size-slider-pointer-lifecycle.test.tsx` 的单测确定性覆盖；本浏览器测试负责真实引擎里的焦点、属性与手势存活。
- 没有被替代的记录。
