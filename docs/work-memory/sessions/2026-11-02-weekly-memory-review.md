<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-02-weekly-memory-review",
  "date": "2026-11-02",
  "title": "周整理：p33–p36 的交付范围、官网市场分类失败及记忆同步",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "work-memory",
    "static-hosting",
    "pr-review",
    "jurisdiction-marketing"
  ],
  "summary": "上周的官网与日本地区改动已随 p33 交付，p36 已包含两批交易终端审查修复。官网每日快照连续五次失败，最近四次确认 xyz:JIO 分类已变。语言链接的 Service Worker 修复仍在 #134。已补正相关任务记录及提交引用。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "df119e05f115457b10536bd7adadfa79acd36a28",
  "commits": [
    "ad408e8c",
    "2dcfd3e0",
    "2047ee8d",
    "cdb47637",
    "90658436",
    "ec067207",
    "26c06d02",
    "047b4bb3",
    "e9d20e48",
    "1262bf5d",
    "4549e75d"
  ],
  "sources": [
    {
      "path": "docs/work-memory/sessions/2026-10-26-weekly-memory-review.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-27-cloudfront-release-p33-and-website.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-28-cloudfront-release-p34.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-02-cloudfront-release-p36.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-02-local-record-branches-sync.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-31-p2-integration.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-01-audit-group2.md"
    },
    {
      "path": "docs/adr/0045-l1-action-expiry.md"
    },
    {
      "path": ".github/workflows/website-markets-check.yml"
    },
    {
      "path": "apps/website/src/config/deployers.ts"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/actions/runs/41303949745"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/134"
    }
  ],
  "supersedes": []
}
-->
# 周整理：p33–p36 的交付范围、官网市场分类失败及记忆同步

## 背景与范围

本次从 10 月 26 日周整理的 `ad408e8c` 接续，核对当时只在本地的官网分支 `d4bd4f9c`、新增任务记录和相关 PR。共享检出为干净的 `dev@0ad17bd1`。重新读取项目规范、交接及发布记录并 fetch 后，在独立记忆分支以 `origin/dev@df119e05` 为基线。对照的 `origin/main` 为 `047b4bb3`。来源任务未登记会话 ID 的，保留其 `thread: null`，按文件、提交和 PR 定位。

## 结论与依据

| 版本 | 已核对的提交与来源报告 | 仍受哪些验证限制 |
| --- | --- | --- |
| p33 · `2dcfd3e0` | 上周的 12 个提交已随 #115/#116 进入 dev 和 main。ADR 0042 与 EntropyIO 文档链接交付后，原来在 p32 失败的 `terminal:check` 通过。官网随后发布浅色首页与新版市场展示，来源报告官网单测 97 项、产物测试 56 项通过。 | 真实日本 IP、邮件客户端和实际投递缺少验收证据。[发布记录](2026-10-27-cloudfront-release-p33-and-website.md) |
| p34 · `2047ee8d` | #118/#119 交付日语终端。发布时首次资源上传因代理中断，重跑补齐 11 个文件，核对发布标记一致。 | 母语审校、真实账户和真机走查仍待做。[发布记录](2026-10-28-cloudfront-release-p34.md) |
| p35 · `cdb47637` | #121/#122 交付 `?lang=` 首访选语言。来源用无头 Chromium 在桌面与手机视口验证日语免责弹窗、参数清理和 UTM 保留。 | 回访者受旧 Service Worker 控制的行为是后续问题。p35 的记录文件位于 #134，可用 `git show b726adb7:docs/work-memory/sessions/2026-10-28-cloudfront-release-p35-link-language.md` 读取。 |
| p36 · `047b4bb3` | #129 集成六组 P1 和五组 P2，#131/#132 继续修复审查确认的问题。#133 晋升的代码树与 `26c06d02`、`01e1e5b5` 完全一致。发布记录报告主网 15/15、测试网 16/16，CSP 33 步中 2 步跳过、0 违规。 | 来源全量 Vitest 有 711 个文件通过、1 个跳过、2 个失败，分别给出夹带未跟踪目录、沙盒端口绑定的环境说明。在 main 上未重跑全量测试。真实签名、成交、金库存取和真机逐项验收仍缺。[发布记录](2026-11-02-cloudfront-release-p36.md) |

**官网市场数据。** 查询时间为 2026-11-02 01:00:24 UTC。自上周整理以来，`Website Market Snapshot` 五次定时运行均在市场比对步骤失败。10 月 28 日的 head 为 `2047ee8d`，确认了失败步骤，未取得可核对的诊断正文。10 月 29 日至 11 月 1 日四次均在 `cdb47637`，日志分别报告配置仍列 `xyz:JIO` 为 Pre-IPO，而接口返回的分类为 `stocks`。所查 dev 和 p36 中的 `PRE_IPO_DOCS` 仍有该条目。上周的预计分类变化已有检查证据。这些运行并非对 p36 重新执行的检查。[首个失败](https://github.com/zora4523-bot/gatu-app/actions/runs/40679943241) · [最近一次失败](https://github.com/zora4523-bot/gatu-app/actions/runs/41303949745)

**下单与账户。** p36 已包含只减仓触发单的 always-place 改单、交易延迟保护开关、休眠后的服务器重新取样，以及缺价非默认报价币余额行估值为零的修复。已在有关来源补注新版行为与提交。订单簿点击保留订单类型、盘口和下单单位联动、选择器读取实时 mid、现货显示名与移动成交筛选见第二组审查。资金新路径仍单独跟踪，Across 在来源任务中已搁置。[L1 过期约定](../../adr/0045-l1-action-expiry.md) · [第二组审查](2026-11-01-audit-group2.md) · [Across 记录](2026-10-31-across-shelved-and-open-issues.md)

**两个容易混淆的 CI 结果。** #124 在 `46bcc1fb` 上的两片浏览器回归失败。来源定位为平仓夹具缺少地区钩子替身，修复 `21ca05c5` 经 #129 进入 p36。#130 的晋升覆盖规则在 p36 晋升之后才合入 dev，首次实际晋升的权限、跳过行为及计费仍待验证。p36 发布构建总量余 368 字节，发布前预检余 87 字节，两次测量使用不同构建配置。[资金安全](2026-10-30-p1-funds-safety.md) · [晋升覆盖](2026-10-31-promotion-ci-coverage.md)

**记忆同步。** #135 已将 10 月 12、19、26 日的原记忆提交带入 dev，#136 更正了 #132 已随 p36 发布。上述三份原记忆提交不在所查 main，10 月 12 日文档此前移植的 `c9169980` 在两条远端分支都可达。10 月 5 日的 `42f2bd23` 仍不在两条分支。上周缺少出处的日本与官网两份来源现已有实际提交和阶段补记。[四条分支同步记录](2026-11-02-local-record-branches-sync.md)

### GitHub 查询边界

显式查询 `zora4523-bot/gatu-app`，时间为 **2026-11-02 00:59:25 至 00:59:28 UTC**。下表记录查询时实际 head 的检查集合。表中短 SHA 已在本地解析，完整 SHA、检查名和结论在本机归档。#134 是这次查询返回的唯一开放 PR。

| PR | 实际 head | 目标 / 状态 | 检查结果 |
| --- | --- | --- | --- |
| [#115](https://github.com/zora4523-bot/gatu-app/pull/115) | `6858ffba` | dev / 已合并 | 7 SUCCESS |
| [#116](https://github.com/zora4523-bot/gatu-app/pull/116) | `c2d57946` | main / 已合并 | 8 SUCCESS、1 SKIPPED |
| [#117](https://github.com/zora4523-bot/gatu-app/pull/117) | `abba9978` | dev / 已合并 | 无检查项 |
| [#118](https://github.com/zora4523-bot/gatu-app/pull/118) | `621f36cd` | dev / 已合并 | 7 SUCCESS |
| [#119](https://github.com/zora4523-bot/gatu-app/pull/119) | `f18e144a` | main / 已合并 | 8 SUCCESS |
| [#120](https://github.com/zora4523-bot/gatu-app/pull/120) | `0193793c` | dev / 已合并 | 无检查项 |
| [#121](https://github.com/zora4523-bot/gatu-app/pull/121) | `160a5c6a` | dev / 已合并 | 6 SUCCESS |
| [#122](https://github.com/zora4523-bot/gatu-app/pull/122) | `d99c2bc9` | main / 已合并 | 7 SUCCESS |
| [#123](https://github.com/zora4523-bot/gatu-app/pull/123) | `b22d2ff2` | dev / 已合并 | 6 SUCCESS |
| [#124](https://github.com/zora4523-bot/gatu-app/pull/124) | `46bcc1fb` | dev / 已合并 | 4 SUCCESS、2 FAILURE |
| [#125](https://github.com/zora4523-bot/gatu-app/pull/125) | `c56dcf4a` | dev / 已合并 | 6 SUCCESS |
| [#126](https://github.com/zora4523-bot/gatu-app/pull/126) | `690069fa` | dev / 已合并 | 7 SUCCESS |
| [#127](https://github.com/zora4523-bot/gatu-app/pull/127) | `01a547f0` | dev / 已合并 | 6 SUCCESS |
| [#128](https://github.com/zora4523-bot/gatu-app/pull/128) | `65f765e8` | dev / 已合并 | 6 SUCCESS |
| [#129](https://github.com/zora4523-bot/gatu-app/pull/129) | `44d95ef9` | dev / 已合并 | 7 SUCCESS、1 SKIPPED |
| [#130](https://github.com/zora4523-bot/gatu-app/pull/130) | `15cc87d3` | dev / 已合并 | 7 SUCCESS、4 SKIPPED |
| [#131](https://github.com/zora4523-bot/gatu-app/pull/131) | `695080a6` | dev / 已合并 | 7 SUCCESS |
| [#132](https://github.com/zora4523-bot/gatu-app/pull/132) | `01e1e5b5` | dev / 已合并 | 7 SUCCESS、1 SKIPPED |
| [#133](https://github.com/zora4523-bot/gatu-app/pull/133) | `26c06d02` | main / 已合并 | 8 SUCCESS |
| [#134](https://github.com/zora4523-bot/gatu-app/pull/134) | `b726adb7` | dev / 开放 | 4 SUCCESS、2 SKIPPED |
| [#135](https://github.com/zora4523-bot/gatu-app/pull/135) | `8cdc427e` | dev / 已合并 | 无检查项 |
| [#136](https://github.com/zora4523-bot/gatu-app/pull/136) | `4549e75d` | dev / 已合并 | 无检查项 |
| [#137](https://github.com/zora4523-bot/gatu-app/pull/137) | `c19a1b45` | dev / 已合并 | 无检查项 |
| [#138](https://github.com/zora4523-bot/gatu-app/pull/138) | `8b3cfde9` | dev / 已合并 | 无检查项 |

#132 的 PR 汇总显示 1 项跳过。2026-11-02T01:05:55+00:00 按同一 head `01e1e5b5` 查询全部 check runs，返回 7 项成功、2 项跳过。两项跳过均名为 `claude`，运行 ID 分别为 `124869918561` 和 `124869917439`，与来源记录的计数相符。[第二组审查](2026-11-01-audit-group2.md)

#134 的 `b726adb7` 尚不在所查 dev 或 main。该 PR 处理语言链接的网络优先与缓存回退，并修复测试模拟清理的竞态。来源报告 `0aa53f58` 后两组测试各连续通过 30 轮。该 head 的 PR 检查及 Node 模拟用例都未覆盖真实浏览器下已安装旧 Service Worker 的首次回访。[PR #134](https://github.com/zora4523-bot/gatu-app/pull/134)

## 验证与限制

在 `df119e05` 的独立工作树补正 21 份历史记录，新增本周记录并生成 234 份记录的索引。`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8 通过）及 `git diff --check` 均通过。另逐份比对原正文和来源标识，核对了新增的 Markdown 相对链接。

本次验证了 Git 祖先关系、三个 p36 相关树对象一致，以及 CI 与实际 head 的对应关系。读取了定时任务失败步骤、四次可用的相关诊断和当前官网的分类配置，并用当前 ADR 与实现复核上述会失效的摘要。生产运行、应用测试及外部产品对照沿用来源报告，本轮只运行记忆检查。

归档只取已关联的本项目 Codex 会话。主检出的 `.worklog/2026-11-02/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-H30XRx/` 固定源边界为 216262394 字节，保留 2451 个允许事件，末事件时间为 00:59:45.941 UTC。已验证导出字段白名单与 events SHA-256 `c59601249628207992e56d17d959a67345347c745f8ce0b0044fd64aeafb7ea9`。同级 `weekly-review/` 保存筛选后的 PR、运行、提交和本次检查结果。证据目录受 Git 忽略。

## 后续与替代关系

1. 官网任务需按部署方资料核对 JIO 分类，更新 Pre-IPO 配置和已提交快照，在修正后的同一提交重跑 `markets:snapshot --check`。本次发布证据只证明 p33 时官网检查通过。
2. 语言链接需在已有旧 Service Worker 的浏览器核对首访、离线和服务端错误时的回退，尤其是 iOS Safari。#134 的合并与发布状态按实际 head 跟踪。
3. p36 仍缺真实钱包、真机和逐项线上验收。P2/P3 原计数属于 10 月 30 日发现时的快照，接手时先查各组补记及未完成项。
