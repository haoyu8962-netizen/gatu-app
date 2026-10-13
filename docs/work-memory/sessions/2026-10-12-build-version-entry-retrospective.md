<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-build-version-entry-retrospective",
  "date": "2026-10-12",
  "title": "版本号入口调整的事后补记：设置内可复制，行情加载页脚保留简写",
  "kind": "retrospective",
  "status": "recorded",
  "topics": [
    "docs-governance",
    "static-hosting"
  ],
  "summary": "依据 PR #101、69038bb6 与 1539a009 补记缺失任务记录：设置 About 显示并复制构建版本，默认页脚移除版本号，行情加载模式保留简写。已合入所查 dev，不在 p30 的 main；只核对源码与 PR 检查，原对话、局部测试输出和真机验收未取得。",
  "thread": null,
  "baseCommit": "2eeec75d",
  "commits": [
    "69038bb67b892d0f1e2be18a34d69c6622b290e6",
    "1539a00970c9bcfa23c34b28c6edee69a8b44049"
  ],
  "sources": [
    {
      "path": "apps/terminal/src/config/app.ts"
    },
    {
      "path": "apps/terminal/src/components/trade/components/global-settings-modal.tsx"
    },
    {
      "path": "apps/terminal/src/components/trade/footer/footer-bar.tsx"
    },
    {
      "path": "apps/terminal/src/components/trade/footer/footer-bar-view.tsx"
    },
    {
      "path": "apps/terminal/src/lib/tests/global-settings-modal.test.tsx"
    },
    {
      "path": "apps/terminal/src/lib/tests/footer-bar.test.tsx"
    },
    {
      "path": "CHANGELOG.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/101"
    }
  ],
  "supersedes": []
}
-->
# 版本号入口调整的事后补记：设置内可复制，行情加载页脚保留简写

## 背景与范围

本条由 2026-10-12 周整理事后补写。PR #101 两个业务提交在当前 dev 可达，但没有对应独立任务记录。原用户对话、任务标识及本地验证输出未取得，保留 thread: null；不根据作者或提交日期重建原需求。基线 2eeec75d 由首个实现提交的父提交核对，后续关联见[本周整理](2026-10-12-weekly-memory-review.md)。

## 结论与依据

- 69038bb6 在设置的 About / Version 行显示 APP_RELEASE_LABEL，并通过既有复制 Hook 复制 APP_VERSION、APP_RELEASE_ID 与完整 APP_BUILD_COMMIT。简写从发布号末尾提取 p 序号，开发环境显示 dev；发布号不匹配时保留原号。完整发布号只在需要时作为提示显示。
- 同一提交去掉默认页脚中的版本号；1539a009 随后仅为 market-loading 模式恢复构建简写。不能把初次“从页脚移除”解释为所有模式都隐藏。
- 设置入口使用共享 GlobalSettingsModal，代码没有用桌面专属分支包裹 About 行；这说明该实现由共享面板提供，不是移动端已经实际验收的证据。
- 测试源码新增设置显示与复制内容断言，并区分默认和加载页脚的版本号行为；CHANGELOG 与手册也已跟随代码调整。本轮不修改实现。

## 验证与限制

本轮在 b98f2fe8 的隔离记忆工作树只读核对上述两个提交的差异和当前文件。

GitHub 显式指定 zora4523-bot/gatu-app，于 2026-10-12T01:03:34.452178+00:00 至 2026-10-12T01:03:40.206404+00:00 查询：PR #101 已合入 dev，实际 head 为 1539a00970c9bcfa23c34b28c6edee69a8b44049，检查集合返回 6 SUCCESS。这只说明该 head 的检查状态；没有逐条阅读测试日志，不声称每个新测试都由 CI 运行。

Git 祖先核对：两个提交都在所查 dev b98f2fe8，不在所查 main ff11eee5，所以 p30 来源发布不包含这项改动。本轮未运行应用测试、类型检查、生产构建、浏览器或剪贴板交互，未发布。

## 后续与替代关系

- 双端实际显示、复制行为和发布后的版本标签仍需在对应版本验收。
- 将来主分支或发布状态变化时追加来源，不把本次的 CI 成功当成发布授权。
- 不替代早先页脚时钟、启动渲染或布局记录。
