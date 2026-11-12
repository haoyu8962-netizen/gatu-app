<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-12-ios-resume-websocket-recovery",
  "date": "2026-11-12",
  "title": "iOS 主屏幕应用重新打开后长时间无数据：WebSocket 恢复路径的五处等待与修复（ADR 0050）",
  "kind": "task",
  "status": "verified",
  "topics": ["market-recovery", "hyperliquid-api"],
  "summary": "运营方报告 iPhone 主屏幕应用隔一段时间再打开，先白屏约 5 秒，再长时间只有外壳没有数据。审查确认恢复路径上的五处等待：回到前台不检查连接（最多 5 秒，静默不满 45 秒时要等 SDK 心跳约 40 秒）、重连退避不被打断（最多 30 秒）、rews 的 reconnect 等旧连接的 close 事件（Chromium 实测 60 秒，WebKit 约 0.1 秒）、订单簿连接池没有回到前台的处理（约 40 秒）、store 在隐藏时挂载后不刷新缓冲。按 ADR 0050 修复并给 @nktkas/rews 4.1.0 打补丁。全量单测、33 处变异、真实 Chromium 与 WebKit 探针、类型检查、生产构建通过；Codex 只读 low 两轮 8.7 与 9.5，一项 P2 与一项 P3 已修；静态交易启动基线上调 355 字节。报告的现象没有在模拟器里复现，白屏原因未确认，真机未验收，未推送、未发布。",
  "thread": null,
  "baseCommit": "19db63d1680074b3748993d2ec75fbe371f120d9",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0050-websocket-recovery-on-resume.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "packages/hl-react/src/internal/websocket/transport-monitor.ts" },
    { "path": "packages/hl-react/src/store.ts" },
    { "path": "packages/hl-react/src/subscriptions/l2-book-transport-pool.ts" },
    { "path": "patches/@nktkas__rews@4.1.0.patch" },
    { "path": "apps/terminal/tests/browser/websocket-half-open-probe.mjs" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "scripts/check-client-bundle-budget.mjs" }
  ],
  "supersedes": []
}
-->
# iOS 主屏幕应用重新打开后长时间无数据：WebSocket 恢复路径的五处等待与修复（ADR 0050）

## 背景与范围

同步记录，2026-11-12。任务标识未取得（`thread: null`）。基线是 `origin/dev` `19db63d1`；桌面应用建的工作树停在 `main` `af031ae4`，分支上没有独有提交，动手前把分支移到了 `origin/dev`。

运营方报告并附截图：iPhone 上「添加到主屏幕」的终端，隔一段时间重新打开，先白屏约 5 秒，然后是截图里的画面，持续很久。截图是浅色主题、4G，市场 SNDK-USDC（xyz），钱包地址、杠杆和下单表单都在，价格是 `-`，订单簿是骨架，持仓与委托的数量在转圈。运营方的原话：「它似乎没有重载，而且回到之前的状态」「加载太久了，而且是无数据。白屏时间过久」；同样场景下 `app.hyperliquid.xyz` 很快。要求审查代码、找出问题并解决。

范围：`packages/hl-react` 的 WebSocket 恢复路径（共享连接监视器、订阅 store、订单簿连接池）、`@nktkas/rews` 的依赖补丁、对应测试、CI 清单与文档。没有改启动渲染、被动数据的展示规则和任何执行守卫。

## 结论与依据

**没有数据的画面是怎么来的。** 订阅数据过期后各处按[被动数据规范](../../mobile-data-presentation.md)显示占位：`mobile-market-bar-provider.tsx` 在资产上下文过期时不显示价格，`mobile-book-view.tsx` 把过期当作订单簿失败，持仓与委托数量在快照未就绪时转圈。所以这个画面持续多久，就是 WebSocket 恢复并送达新快照用了多久。

**恢复路径上确认的五处等待**（常量与出处见 [ADR 0050](../../adr/0050-websocket-recovery-on-resume.md) 的表）：

1. `transport-monitor.ts` 回到前台时什么都不做，等 5 秒一次的周期检查发现静默满 45 秒；静默不满 45 秒时只能等 SDK 心跳（30 秒一次，10 秒无应答才重连）。这来自 `5e242efe`（2026-07-16），它去掉了回到前台就重连的做法，没有留下替代的即时判断。
2. 重连退避不被打断：rews 的延迟 0.5 秒起翻倍到 30 秒，`store.ts` 每条订阅最多 5 秒、20 次后冷却 30 秒。页面在后台失败的尝试把延迟推高，回到前台后仍要等完。
3. rews 4.1.0 的 `reconnect()` 对打开的连接只调用 `close()`，等它的 `close` 事件到了才开新连接。
4. 订单簿连接池的连接 `maxRetries: 0`，不会自己重连，也没有回到前台的处理；连接半开时只有 SDK 心跳能发现。
5. `store.ts` 的 `wasHidden` 只由隐藏事件置位：在隐藏的页面里挂载的 store，第一次变为可见时不刷新缓冲的行情。

**实测。** 浏览器对半开连接（对端不再应答、TCP 仍被确认）调用 `close()` 到触发 `close` 事件：Chromium 147.0.7727.15 是 60,005 ms（两次相同），Playwright 的 WebKit 26.4 是 25–119 ms。未打补丁的 rews 在 Chromium 上 15 秒内没有开出新连接，WebKit 63 ms；打补丁后 Chromium 2 ms、WebKit 5–14 ms。

**iOS 模拟器里的观察**（iPhone 17，iOS 26.5，Safari，Mac 的网络；输入是工具注入的点击）：

- Safari 切到后台 170 秒，页面没有被挂起，定时器和帧照常。
- 探针页（只订阅 `allMids`）在 `SIGSTOP` 120 秒后：定时器间隔约 122 秒，连接仍打开，积压帧一次送达，没有 `close`，回到前台后 95 ms 收到心跳应答。
- 线上 `app.sairn.ai/trade/BTC`（p40，未登录）在 `SIGSTOP` 300 秒后：恢复约 5 秒后回到前台，第一张截图就有价格和订单簿。

结论是模拟器加 Mac 的网络复现不了报告的现象。真机上还有两种这里给不出的情况：蜂窝网络 NAT 映射过期后连接不报错也不再有数据；系统回收网页进程后的冷启动。

**采用的方案**（ADR 0050 决策 1–5）：共享连接在回到前台时按状态处理（不是打开状态就跳过退避；静默满 45 秒立即重连；否则发心跳，2.5 秒内没有任何帧才重连）；等待中的订阅在回到前台或网络恢复时立即重试，失败计数同时清零；连接池关闭 `l2Book` 帧静默达到过期阈值的连接；给 rews 打补丁，重连和关闭不再等旧连接的 `close` 事件；store 记录挂载时的隐藏状态。仍在收帧的连接不会因为页面变为可见而被替换，保留 `5e242efe` 的目的。

**没有采用的做法**及原因见 ADR 0050 的备选方案表：回到前台一律重连、缩短周期与阈值、调短 SDK 保活、从外部访问 rews 的私有字段、替换 rews、对订单簿连接也发探测。

**白屏约 5 秒没有复现，原因未确认。** 已核对：`StartupFallback` 只在启动闸门和路由等待时渲染，没有找到回到前台会让已渲染的页面变回空白的路径。最可能的解释是系统回收网页进程后的冷启动（ADR 0010 的空白启动在浅色主题下是白色；市场与标签页从持久化设置恢复，看起来像没有重载）。这是推断。

**过程中的两个教训**已写进 [Agent 工作手册](../../agent-handbook.md)第 5、6 节：模拟器不会挂起后台页面，要用 `SIGSTOP` 模拟；`pnpm patch-commit` 会重新解析整份锁文件，这次带出两百多行无关改动，已还原并只手工写入与补丁有关的四处，再用冻结安装验证。

## 验证与限制

工作区基线 `19db63d1` 加本次改动，2026-11-12，本机。

- 定向单测：`ws-transport-monitor`（21 项）、`store-resume`（29 项）、`store-visibility-pause`（10 项）、`store-staleness`（38 项）、`l2-book-transport-pool`（21 项）、`l2-book-transport-pool-resume`（9 项）、`websocket-half-open-reconnect`（6 项）全部通过。
- 失败在先：把安装的 rews 换回未打补丁的文件，`websocket-half-open-reconnect` 当时的 4 项全部失败，还原后通过。
- 变异：最终状态下 33 处全部被抓到，监视器 12 处、store 8 处、连接池 11 处、补丁语义 2 处（多清一次发送缓冲、多清一次重试计数）。第一轮有 4 处（隐藏、断网、连接关闭时作废探测，以及定时器里的重复判断）没被抓到，原因是同一行为有两道重复的防线；删掉定时器里的判断和 `open` 时的清理后复测全部抓到。对 rews 的变异没有原地改安装的文件：先移走原文件，放副本，测完移回。
- 现有用例的行为变化：`store-staleness.test.ts` 的两项「drops hidden buffered … data when the confirmed subscription fails」原来断言回到前台后状态仍是 `error`，现在回到前台会立即重试，状态是 `subscribing`；被丢弃的帧仍然不出现。断言已按新行为改写。
- 审查：Codex CLI `gpt-6-astra`，只读，推理强度 low，两轮。
  - 第一轮 8.7/10：一项 P2（冷却只剩 1 秒时回到前台，那次重试如果失败会开始新的 30 秒冷却，比不改更慢）、一项 P3（文档把只统计 `l2Book` 帧写成了「任何帧」），并列出三处它预计测试抓不到的变异。两项都成立：重试时把失败计数清零（与冷却自然结束时相同），文档与注释改为实际行为，三处变异各补一项测试。
  - 第二轮只审修正：没有发现，9.5/10。它不能运行测试，结论来自读代码。
- 真实引擎：`node apps/terminal/tests/browser/websocket-half-open-probe.mjs chromium,webkit 75000`，读数见上。脚本驱动，不是真人操作。
- `pnpm exec biome check <改动文件>`：通过。`pnpm typecheck`（hl-react、ui、terminal）：通过。`node --test scripts/check-client-bundle-budget.test.mjs scripts/ci-workflows.test.mjs`：38 项通过。
- `pnpm install --frozen-lockfile --prefer-offline`：通过，证明手工编辑的锁文件自洽；SDK 两个快照下的 `@nktkas/rews` 都链接到打过补丁的目录。
- 全量终端单测与生产构建、包体读数：见下面的「构建与全量单测」。
- 本地证据（Git 忽略）：`.worklog/2026-11-12/ios-resume-websocket-recovery/`，含两个草稿探针脚本、探针页服务、各次读数的 JSON、四张模拟器截图、两轮审查的提示词与报告、两侧构建的预算输出和逐块对比。

限制：

- 报告的现象没有复现，所以不能说已经修好被报告的场景；改动消除的是代码与实测确认的等待。
- 没有真机验证，没有真实钱包登录下的恢复验证，没有蜂窝网络下的验证。
- 表里「改动后」的时长来自常量与假时钟单测，不是真机读数。
- 白屏不在本次改动范围内。
- 页面隐藏时间短于阈值、订单簿连接又恰好死掉时，订单簿仍走原路径（最多约 40 秒）；多条流同时过期时 `scheduleStaleRecovery` 只重连共享连接。两者都没有改。

### 构建与全量单测

生产构建按[性能基线](../../terminal-performance-baseline.md)的复现规则做了两侧：Node 22.15.0、pnpm 10.21.0、没有 `.env.local`、`VITE_MOBILE_PAIRING_ENABLED=false`、固定构建身份。

- 基线 `19db63d1`（独立工作树）：总量 3,375,962，静态交易启动 1,652,171，手机运行时增量 119,765，桌面运行时增量 204,578，`trade-terminal-page` 127,808。五个读数与文档里 `8ca35543` 的协议读数逐字节相同。
- 本次改动（最后一次代码修改之后）：总量 3,376,264（+302），静态交易启动 1,652,526（+355），手机运行时增量 119,772（+7），桌面运行时增量 204,602（+24），`trade-terminal-page` 127,810（+2）。450 个客户端分块，没有循环的静态导入，所有预算通过。
- 逐块对比：只有 `vendor-tanstack-router` 变化超过 20 字节（+342），分块图确认改动的四个模块都在这个分块里。
- 审查修正之前的一次构建读数是静态交易启动 +272、总量 +57；两次之间只差一行赋值，83 字节的差大部分是构建波动。
- 静态交易启动的基线上调 355 字节到 1,644,480。原因：p40 的发布构建在这一项只剩 391 字节，加上这次的增长后发布配置约剩 36 字节，低于发布预检要求的 200 字节。没有测配对开启的构建。

全量终端单测（`pnpm --filter @sairn/terminal test --maxWorkers=4`，沙盒外）：

- 第一次（审查修正之前）：717 个文件，715 个通过、1 个跳过、1 个失败；9,926 项里 9,923 项通过、1 项跳过、2 项失败。失败的就是上面按新行为改写的两项，当时文件里还是旧断言。
- 第二次（最终代码，含审查修正与基线上调）：717 个文件，716 个通过、1 个跳过；9,931 项里 9,930 项通过、1 项跳过；退出码 0。

## 后续与替代关系

没有被替代的记录。`5e242efe` 的决定（回到前台不无条件重连）保留，本次补上了它缺的即时判断。

后续事项（同 ADR 0050）：

1. 发布后由运营方在真机上按原场景确认：主屏幕应用，蜂窝网络，放到后台几分钟后再打开。仍然慢时用 `?hl_diagnostics=1` 读 `__hl_debug()` 的 `recoveryEvents`，或先给恢复过程加可见的记录。
2. 白屏：在真机上区分系统启动画面、冷启动的空白启动和恢复时主线程被占用，再决定处理方式；涉及启动时显示内容的方案与 ADR 0010 冲突，需要运营方决定。
3. `scheduleStaleRecovery` 把订单簿流与共享连接上的流分开处理，并给连接池的退订等待加上限。
4. 把 rews 的改动提给上游，合入后去掉补丁。
5. 下一次发布预检要看静态交易启动的余量，见[性能基线](../../terminal-performance-baseline.md)本次的小节。
