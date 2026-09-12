<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-12-pr22-merge-validation",
  "date": "2026-09-12",
  "title": "PR #22 合并前校验：清理成交旧提示与重复订单标签",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "pr-review",
    "market-recovery",
    "order-entry"
  ],
  "summary": "核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "e2affd06",
  "commits": [],
  "sources": [
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/22"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/actions/runs/34685891058"
    },
    {
      "path": "apps/terminal/src/components/trade/orderbook/trades-panel.tsx"
    },
    {
      "path": "apps/terminal/src/lib/tests/trades-panel.test.tsx"
    },
    {
      "path": "docs/mobile-data-presentation.md"
    },
    {
      "path": "apps/terminal/src/config/trade.ts"
    },
    {
      "path": "apps/terminal/src/lib/tests/i18n-hot-switch.test.tsx"
    }
  ],
  "supersedes": []
}
-->
# PR #22 合并前校验：清理成交旧提示与重复订单标签

## 背景与范围

用户要求“合并到主分支”。起始提交为 `e2affd06`，工作区干净。PR #22 的目标为 main，GitHub 判断无合并冲突，但生产检查尚未通过。合并前检查范围包括最新 head、CI 原因及必要的小范围修复，不执行生产部署或真实交易。

## 结论与依据

在生产 run `34685891058` 中读取四个失败 job 的完整日志：

- false/false：构建在渲染阶段被 Killed，exit 137，并收到 runner shutdown；未得到完整预算结果。
- false/true：runner shutdown，构建在渲染阶段收到 SIGTERM；没有得到该配置的完整预算验证结果。
- true/false：编译及循环依赖检查通过，trade-terminal-page 为 123,212 gzip bytes，比 123,207 上限多 5 bytes。
- true/true：编译及循环依赖检查通过，trade-terminal-page 为 123,216 gzip bytes，比上限多 9 bytes。

最近成交组件仍保留 `quietErrors=false` 的旧错误提示分支。仓库生产调用点全部使用 true 或默认 true，现有规范也要求双端被动恢复保持静默，因此删除这个无调用入口的开关和提示 JSX，并同步调用点与六种翻译目录。订阅状态、首帧、市场身份、新鲜度、成交记录和真实空态的判断保留；不改包预算、分包配置或订阅数量。

测试辅助入口改为真正切换 compact 布局，使移动错误/恢复用例实际覆盖紧凑组件，而不是只重复设置原本默认 true 的开关。

第一次本地 true/true 构建在清理成交分支后仍有 123,258 gzip bytes，超限 51 bytes。继续将高级订单菜单和确认摘要重复的八类订单翻译描述移入 `config/trade.ts`，由调用处的翻译函数解析。仅共用惰性消息描述，保持原有 Market/Limit 上下文、协议值和语言订阅，不增加依赖或放宽预算。

语言回归测试暴露过期夹具：账户概览新增只读储备查询后，mock 缺少 `useInfo`；统一账户维持保证金文案已改为 `Perps Maintenance Margin`；源契约仍引用 `6140b378` 删除的 `asset-select.tsx`。修正这些夹具并补充英→中→英切换后的订单标签、同一 DOM 节点和复选框状态检查，未因此改动账户实现。

## 验证与限制

本地相关 Vitest 通过：成交面板、成交计算/行及被动状态契约 45 项；确认摘要 24 项；语言热切换 7 项；语言源契约 79 项。Terminal TypeScript、全部 9 个修改源码/测试文件的 Biome、工作记忆索引校验与 8 项脚本测试通过。提交时前端产物为 123,162 gzip bytes，本地完整构建仍在生成服务器产物，最终结果补入 PR 描述与本地证据。远端完整四配置及浏览器验证必须绑定修复提交，不继承 e026baa0 或 e2affd06 的通过结果。

本地日志为 `/tmp/gatu-pr22-merge-failed-job.log`、`/tmp/gatu-pr22-merge-false-false.log`、`/tmp/gatu-pr22-merge-true-false.log`、`/tmp/gatu-pr22-merge-true-true.log`；两次本地构建输出为 `/tmp/gatu-pr22-merge-build.log` 和 `/tmp/gatu-pr22-merge-build-final.log`。这些是本机临时证据，持久来源为上方 GitHub run。可观察事件已通过 `memory:capture` 保存到 Git 忽略的 `.worklog/2026-09-12/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-hnVpoH`，不包含内部推理或工具原始载荷。源码改动未放松主动操作反馈或交易守卫。

## 后续与替代关系

对早期 PR 审查记录的追加核对：四个红色 job 不代表四个相同代码错误，需区分构建中断与真正的包预算超限。原始失败事实保留。

修复提交推送后等待当前 head 的完整 CI。仅在对应检查通过且仍无冲突时合并；最终合并提交和时间以 GitHub PR 状态及本地合并结果证据为准。
