<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-26-persist-merge-first-visit-guard",
  "date": "2026-09-26",
  "title": "zustand persist 首次访问时 merge 收到 undefined 的防护",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review"],
  "summary": "zustand 5.0.9 的 persist 在首次访问、存储数据未通过校验被清除、以及版本不同且没有 migrate 时都会调用 merge(undefined)；global-settings 与 HIP-3 免责声明两个 store 的 merge 没有防护，抛出的 TypeError 被吞掉，hasHydrated() 一直为 false。两处改为 persisted ?? {}，新增覆盖全部四个持久化 store 的水合回归测试（修复前 5 项失败，修复后 14 项通过）；默认值和归一化不变，market 与 order-entry 已经安全、未改动。",
  "thread": null,
  "baseCommit": "121e8e76",
  "commits": ["06293549"],
  "sources": [
    { "path": "apps/terminal/src/stores/use-global-settings-store.ts" },
    { "path": "apps/terminal/src/stores/use-hip3-disclaimer-store.ts" },
    { "path": "apps/terminal/src/stores/use-market-store.ts" },
    { "path": "apps/terminal/src/stores/use-order-entry-store.ts" },
    { "path": "apps/terminal/src/lib/storage/validated-storage.ts" },
    { "path": "apps/terminal/src/lib/tests/persisted-store-hydration.test.ts" },
    { "path": "apps/terminal/package.json" }
  ],
  "supersedes": []
}
-->
# zustand persist 首次访问时 merge 收到 undefined 的防护

## 背景与范围

用户在 2026-09-25 用已安装的 zustand 5.0.9 复现：`persist` 在存储里没有值时（每一次首次访问），以及存储的 `version` 不同且没有 `migrate` 时，会调用 `options.merge(undefined, currentState)`。自定义 `merge` 不加防护就读 `persisted` 的属性会抛 TypeError，persist 在自己的 promise 链里吞掉它：store 保留初始状态，但 `persist.hasHydrated()` 一直为 false，`onFinishHydration` 监听器也不会执行。用户用 Node 脚本（`createStore` + `persist` + `createJSONStorage` + 内存存储）验证：未防护时首次访问 `hasHydrated() === false`，改成 `(persisted ?? {})` 后为 true。老用户不受影响；目前没有代码读取水合标志，所以这是潜在问题，没有可见缺陷。该 Node 脚本的结果来自任务描述，本会话没有重跑；下文的 vitest 红灯独立复现了同一现象。

任务：给 `use-global-settings-store.ts` 的 `merge` 加防护；审计 `apps/terminal/src/stores` 及各 package 中其余的自定义 `merge` / `migrate`；检查 `use-hip3-disclaimer-store.ts` 是否已在当前分支修过，没修过才在这里修；为每个修复的 store 加首次访问的回归测试，没有 `migrate` 的 store 再加版本不同的用例。

基线 `121e8e76`（分支 `claude/hungry-cartwright-aa350f`），开始时工作区干净。本记录与任务同步整理。这是 Claude Code 桌面会话，没有可核对的任务标识，所以 `thread` 为 null。

## 结论与依据

1. 终端在 `apps/terminal/package.json` 里把 zustand 固定为 5.0.9。已安装包的 `esm/middleware.mjs`（`persistImpl` / `hydrate`）里有三条路径会调用 `merge(undefined, current)`：存储为空（首次访问）；版本不同且没有 `migrate`（先 `console.error`，再返回 `[false, undefined]`）；以及本仓库特有的第三条——`createValidatedStorage` 对 JSON 解析失败或未通过 schema 校验的数据会 `removeItem` 并返回 null，效果等同于存储为空。原始报告没有提到第三条。存储是同步的 localStorage 时，`toThenable` 链里抛出的错误只会传给 `onRehydrateStorage`，`set(stateFromStorage, true)` 不会执行，`hasHydrated` 保持 false，结束监听器不会执行。
2. 审计范围：只有四个文件从 `zustand/middleware` 导入 `persist`，都在 `apps/terminal/src/stores`；`validated-storage.ts` 只导入类型；`packages/hl-react/src/store.ts` 没有使用 persist，其他 package 也没有。
   - `use-global-settings-store.ts`：`merge` 没有防护，已修。它的 `migrate` 同样直接强转 `persisted`，但 zustand 只在存储值存在且版本不同时调用它，参数是 `deserializedStorageValue.state`；这份数据已通过 `globalSettingsSchema`，其中 `state` 是必填对象，不可能是 undefined，所以保持不变。
   - `use-hip3-disclaimer-store.ts`：HEAD 上仍未防护。`git log --all` 显示在本次修复之前只有 `44329ff8`、`5341c3df`、`cee6c813` 三个提交改过该文件；`codex/reviewceshi` 上的 HIP-3 复审跟进 `7c9b3f21` 只改了 `hip3-disclaimer-store.test.tsx`，没有改 store，而且不在 HEAD 的祖先链上。因此在这里修复。
   - `use-market-store.ts`：`merge` 全部使用可选链，已经安全，未改动。
   - `use-order-entry-store.ts`：`merge` 展开 `persisted`，展开 undefined 什么也不做，已经安全，未改动。
3. 修复内容：两处都改为 `(persisted ?? {}) as Partial<...>`。global-settings 的 `merge` 中 `p` 不再可能为空，三处多余的 `p?.` 统一改为 `p.`。没有改动任何默认值或归一化。首次访问时合并结果与初始状态相同：`normalizeNumberFormatLocale(undefined)` 返回 `en-US`，即默认值；默认滑点 2.5 落在 [0.1, 5] 之内，限幅后不变；`marginMode`、`theme` 分别回落到默认的 `cross`、`dark`；`network` 与模块加载时一样调用 `getNetwork()`。水合在 store 创建过程中同步完成，而且 hydrate 使用的是原始 setter，所以首次访问不会写存储，也没有订阅者会看到变化。
4. 测试放在新文件 `persisted-store-hydration.test.ts`，没有追加到 `hip3-disclaimer-store.test.tsx`，因为 `codex/reviewceshi` 的 `7c9b3f21` 也在该文件末尾追加用例，合并时会冲突。测试通过 `vi.mock("zustand/middleware")` 包装真实的 `persist`，按存储名记录每个 store 的 API，不需要给生产代码新增导出。覆盖内容：首次访问（`hasHydrated()`、状态等于 `getInitialState()`、不写存储、`rehydrate()` 后 `onFinishHydration` 恰好调用一次）、未通过校验的存储数据、没有 `migrate` 的 store 遇到其他版本的数据、公开 getter 返回默认值。另有一个源码扫描用例：`apps/terminal/src` 下每个从 `zustand/middleware` 导入 `persist` 的文件都必须在测试里有对应用例，以后新增持久化 store 时会被提醒。
   - 未采用的方案：在每个 store 模块导出 store 或 `hasHydrated` 访问函数。这会增加只给测试用的生产导出。
5. 影响范围：`apps/terminal` 与 `packages` 中没有生产代码读取 `hasHydrated`、`onFinishHydration` 或 `rehydrate`，所以这次修复没有用户可见的行为变化，也没有更新 CHANGELOG。老用户的 `persisted` 本来就是对象，走的仍是原路径。

## 验证与限制

环境：Node 22.15.0、pnpm 10.21.0、vitest 4.0.16、zustand 5.0.9。worktree 原本没有 `apps/terminal/node_modules`，先运行 `pnpm install --frozen-lockfile --prefer-offline` 补齐（耗时 3.2 秒，锁文件未变，`prepare` 重新同步了 lefthook 钩子）。2026-09-26 在本 worktree 运行：

- 红灯（基线 `121e8e76`，只加新测试、未改 store）：`persisted-store-hydration.test.ts` 14 项中 5 项失败、9 项通过。失败的是 global-settings 的首次访问与无效数据用例，以及 HIP-3 的首次访问、无效数据、版本不同用例，全部停在 `hasHydrated()` 为 false 这一条断言。market 与 order-entry 的全部用例和源码扫描用例通过。这次运行的测试版本比最终提交少一处改动：源码扫描断言后来才加上失败提示语，断言逻辑没有变。
- 绿灯（与提交 `06293549` 内容一致）：同一文件 14/14 通过。
- 受影响文件一次运行（store 已修复，测试同样是加提示语之前的版本）：`persisted-store-hydration`、`global-settings-store`、`number-format-settings`、`number-format-reactivity-contract`、`network-storage`、`global-settings-modal`、`theme-toggle`、`hip3-disclaimer-store`、`hip3-disclaimer-requirement`、`hip3-deployer-disclaimer`、`global-modals-hip3-disclaimer`、所有导入 HIP-3 store 的平仓与反手提交测试（`position-market-close-submit-host`、`position-close-all-submit`、`global-modals-market-close-legal`、`position-market-close-submit`、`position-limit-close-submit`、`position-market-close-display-commit`、`position-market-close-action`、`position-market-close-submit-lifecycle`、`position-reverse-submit`），以及 `i18n-reactivity-contract`、`i18n-hot-switch`：22 个文件、406 项全部通过。
- 针对最终内容：`pnpm exec biome check`（三个改动文件）通过；`pnpm --filter @gatu/terminal typecheck` 通过；预跑 `pnpm i18n:extract` 没有产生 `.po` 变化，提交时 lefthook 的 biome 与 lingui-extract 也没有改动文件。
- `git merge-tree --write-tree` 显示 `06293549` 与 `codex/reviewceshi`（`27ee060f`）及本地 `origin/dev`（`4e3197d5`，未 fetch）都能无冲突合并。
- 未运行：终端全量单测、浏览器套件、生产构建，也没有在真实浏览器里观察首次访问（没有可见行为可观察）。没有生成 `.worklog` 快照，因为 `memory:capture` 只适配 Codex rollout 格式；命令日志只保存在会话临时目录，没有纳入仓库。

## 后续与替代关系

- 观察到但未改动：market store（version 3）和 order-entry store（version 2）都没有 `migrate`。以后提升它们的版本号时，zustand 会丢弃旧版本数据（例如收藏市场），改用默认值；如需保留用户数据，应同时加 `migrate`。同理，market store `merge` 里兼容旧字段 `selectedMarket` 的分支，只有在存储版本恰好为 3 或版本不是数字时才会执行。
- 以后新增持久化 store 时，源码扫描用例会失败，提醒把它加进 `persisted-store-hydration.test.ts`，从而用 undefined 实际调用一遍它的 `merge`。
- 没有被替代的记录。
