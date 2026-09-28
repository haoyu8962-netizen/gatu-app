<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-slider-pause-preview-baseline",
  "date": "2026-09-28",
  "title": "滑杆暂停测试的预览基线竞态",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "滑杆浏览器测试「值来源在拖动中暂停」在 PR 48 的 CI 上偶发 Expected 5 / Received 6。代码分析与本地复现支持的根因在测试的读取顺序：基线在一次 evaluate 里读、暂停在下一次 evaluate 才设，其间 15ms 尾随预览会合法发布并被多计。改为先挂 MutationObserver 再暂停，在暂停提交之后的微任务里读基线；6 倍 CPU 节流下原测试 2/25 以同一签名失败、新测试 25/25 通过。Codex 只读对抗审查无 P0–P2，指出的两处表述过强经变异复核后已更正：暂停提交内同步发布的预览会被新基线吸收（由单测覆盖）。审查还发现暂停时取消待发定时器原先没有测试覆盖，已按用户决定补单测，只去掉取消分支的变异下它是唯一失败的用例。未改 trade-slider.tsx；推送前没有在 GitHub CI 上运行。",
  "thread": null,
  "baseCommit": "24444b5b",
  "commits": ["1eea3e71", "c42f13b8", "999ed3f4"],
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

用户报告：`apps/terminal/tests/browser/trade-size-slider-performance.pw.ts` 的「keeps focus and the gesture when the value source pauses mid-drag, then resumes and commits」在 PR 48（`claude/earn-page`，`81b1ba48`）的 CI 上失败一次，本地 `--repeat-each=20` 全过，同一工作流此前约 40 次运行都通过。后两条来自任务报告，本次没有复核。用户要求只改测试、不改 `trade-slider.tsx` 的行为，之后又要求用 Codex 做一次对抗审查，并在审查后补上定时器取消的单测、推送并向 `dev` 开 PR。本记录与任务同步写成，没有可核对的会话标识（`thread: null`）。调查从 `e3b5dd82`（当时的 `main`）开始；提交前把空分支快进到 `origin/dev` 的 `24444b5b`，多出的 12 个提交共改 85 个文件，其中没有滑杆相关的组件、夹具、测试、工作流或文档（其他测试和 `.github/workflows/terminal-tests.yml` 有改动）。

2026-09-28 用 `gh` 只读核对了失败本身：run 36328054185 的第 1 次尝试里，job「Terminal browser regressions (1/2)」（108644535408）在 `trade-size-slider-performance.pw.ts:155:59` 失败，`Expected: 5`，`Received: 6`，该 shard 其余 10 项通过；第 2 次尝试全部通过。

## 结论与依据

组件行为符合 `docs/slider-interactions.md` 的 `paused` 语义：暂停提交时，同一个 layout effect 先把 `latestRef.current` 更新为暂停状态、清除待发的预览定时器，最后由 `syncInputAvailability` 写入 `aria-disabled="true"`；定时器回调本身也检查 `paused`。暂停持续期间不会发布预览；恢复时按设计经同一个 15ms 定时器补发一次。

失败来自测试的读取顺序。这是代码分析和下面本地复现支持的归因，CI 那一次的具体时间线没有取证。原测试先用一次 `page.evaluate` 读基线，再用另一次 `page.evaluate` 调用夹具的 `setPaused(true)`；这个 React 更新要等到之后的任务才提交。最后一步移动排下的 15ms 尾随预览如果落在「读基线」与「暂停提交」之间，暂停尚未生效，发布是合法的，但会被计在基线之后，于是暂停期间的计数比基线多 1。

采用的改法：新增辅助函数 `pauseAndReadPreviewCount`，在同一次页面内调用里先挂 `MutationObserver` 再暂停，看到 `aria-disabled="true"` 后，在暂停提交之后的 MutationObserver 微任务里读取计数作为基线。定时器回调是独立任务，插不进这段提交与随后的微任务检查点之间，所以基线之后的计数增长都发生在暂停提交之后。这个观察点不是精确的暂停边界：暂停提交本身同步发布的预览会被计入基线，浏览器用例抓不住，这类回归由单测覆盖（见下文 Codex 一节）。页面计时 5 秒内没看到该属性就报错，而不是只能等到用例超时；`c42f13b8` 把上限从 2 秒改为 5 秒，与被替换的 `toHaveAttribute` 默认等待一致。

其余断言原样保留：手势仍在进行、焦点保留、`disabled` 为 false 且 `aria-disabled` 为 true、滑块跟到 80%、恢复后计数达到基线加 1、松开后累计 1 次提交。恢复后的检查是轮询命中，不能单独证明之后没有第二次预览；这是原测试就有的限制，单测第 402 行的用例在补发后再推进 100ms，检查仍只有 1 次。

未采用的改法：先暂停、等过预览间隔再读基线。它同样能消除误报，但检测不到「暂停前排下的定时器在暂停后仍实际发布」（定时器回调也不检查暂停时）这类回归，见下面的双重变异。有两类回归两种读法都抓不住：「暂停提交内同步发布」由单测覆盖；「只是没取消定时器、回调守卫仍在」原先没有覆盖，现由 `999ed3f4` 新增的单测覆盖。

## 验证与限制

该用例用 `page.mouse`，即 Playwright 经 CDP `Input.dispatchMouseEvent` 协议注入；整个滑杆套件和部分探针还用了页面内脚本派发的 `dispatchEvent`。它们证明真实引擎里的命中测试、布局、焦点与定时器，不证明操作系统捕获或事件顺序。本次没有改手势生命周期，不需要真人拖动验收。本机 macOS、Node v24.15.0（CI 用 22.15.0）、Playwright 1.59.1。下面的探针、双重变异和节流在 `e3b5dd82` 上运行；最终版本的检查先在 `24444b5b` 加 `1eea3e71` 上跑，`c42f13b8` 之后又重跑一遍浏览器测试和 typecheck。

- 临时探针（已删除，未入库），各 10 次：在尾随定时器待发时按原顺序「读基线 → 20ms → 暂停」，10/10 失败，计数都比基线多 1；新读法在最后一次移动后 0、5、10、13、15、17、20、30ms 暂停，全部 10/10 通过；建议的「暂停 → 等待 → 读」10/10 通过。
- 临时双重变异（同时去掉定时器回调里的 `paused` 检查和暂停时清除定时器，随后用 `git checkout` 还原，并确认与 `e3b5dd82` 一致）：新读法在最后一次移动后立即暂停，10 次中失败 7 次。另 3 次据探针日志，暂停提交时的计数已高于排空后的计数，即定时器在暂停提交前已经触发，没有可检测的对象。建议读法 10/10 通过，检测不到该变异。
- 6 倍 CPU 节流（CDP `Emulation.setCPUThrottlingRate`，`CI=1` 使用 Playwright 自带 Chromium），各 25 次：`e3b5dd82` 的原测试 2/25 失败，都是 `Expected: 3` / `Received: 4`，位于同一条暂停计数断言，没有人为间隔也自然复现；新测试 25/25 通过。
- 最终版本（`c42f13b8`）：`pnpm --dir apps/terminal run test:browser:slider`（本机品牌 Chrome）22 通过；按 CI 工作流 `CI=1 … --fully-parallel --shard=1/2` 与 `2/2` 各 11 通过；`-g "pauses mid-drag" --repeat-each=50` 在品牌 Chrome 与自带 Chromium 各 50/50 通过；typecheck 通过。`1eea3e71` 上的同样检查结果相同。
- AGENTS.md「Slider gestures」的 9 个单测文件共 128 项通过，在 `24444b5b` 加 `1eea3e71` 上运行；`c42f13b8` 只改浏览器测试里的一个常量，没有重跑单测。
- `biome.json` 的 `files.includes` 不含 `tests/browser`；以 stdin 按 `src` 路径检查 `1eea3e71`，诊断与改动前的文件相同（第 134 行用例标题格式与另外 3 处 `noNonNullAssertion` 都在未改动的代码里），没有新增。
- 新增单测（`999ed3f4`，`tests/trade-size-slider-pointer-lifecycle.test.tsx`）：真实组件上该文件 36/36 通过；只去掉暂停时清除定时器的变异下，1 项失败、35 项通过，失败的正是新用例；还原后确认组件与 HEAD 一致。「Slider gestures」9 个单测文件共 129 项通过，typecheck 通过。该文件同样不在 Biome 的 `files.includes` 内；把改动前后的文件复制到临时目录的 `src/` 下用 `biome check` 检查，两者都只有一个既有格式错误，位于 `it.each` 的 `} else` 换行处，新增行没有诊断。
- 测试改动为 `1eea3e71`、`c42f13b8`（浏览器测试）与 `999ed3f4`（单测），各自只含一个测试文件；本记录与索引单独提交。
- 推送前没有在 GitHub CI 上运行；推送后的检查结果以 PR 为准。

## Codex 对抗审查

- 运行方式：`codex exec -m gpt-6-astra -s read-only`，`approval_policy="never"`，medium 推理强度，审查 `1eea3e71` 与 `340af2fc`；13 条命令，约 10.8 万 token。它在只读沙箱里没有运行 Playwright、Vitest 或 typecheck，读取远端 CI 页面失败。
- 结论：测试修复可以合入，无 P0–P2。两项 P3 都指向本记录表述过强，另指出几处需要收窄的说法。
- 我复核的两个变异，在 `24444b5b` 加 `1eea3e71` 上运行，每次还原后都确认与 HEAD 一致：
  - 暂停提交内同步发布一次预览（在 layout effect 取得 `session` 后调用 `props.onPreview`）：新浏览器用例 `CI=1` 下 5/5 通过，即抓不住；`tests/trade-size-slider-pointer-lifecycle.test.tsx` 有 8 项失败，包括第 361 行和第 402 行的用例。
  - 只去掉暂停时清除定时器（`trade-slider.tsx` 第 393 行的分支），保留回调里的 `paused` 检查：该单测文件现有 35 项全部通过，没有覆盖。Codex 提议的「短暂停后恢复要重新等满 15ms」单测在真实组件上通过（36/36），在该变异下失败（恢复后 14ms 内已发布 1 次）。用户决定加入：`999ed3f4` 把它放在第 402 行用例之后，命名为「cancels the pending preview timer on pause, so a short pause restarts the preview interval」。
- 采纳的其他意见：辅助函数上限由 2 秒改为 5 秒（`c42f13b8`），并更正了本记录的表述。未采纳的：提交信息结尾的 `Co-Authored-By` 沿用仓库近期提交的一贯做法。

## 后续与替代关系

- 用户要求推送并向 `dev` 开 PR；本记录随分支 `claude/frosty-satoshi-7062c3` 推送，PR 编号与 CI 结果以 GitHub 为准。合入后留意该工作流是否再出现同类失败。
- 本次更正（同日，Codex 审查后）：原记录说基线「正好对应暂停生效的时刻」（摘要作「在暂停提交写入 aria-disabled 的同一时刻读计数」）、恢复后「恰好多 1 次预览」、输入「均为 Playwright 协议注入」、暂停时丢弃待发定时器「由单测确定性覆盖」。这几处都过强或不成立，已按上面的变异结果和核对改写，原措辞保留在 `340af2fc`。
- 没有被替代的记录。
