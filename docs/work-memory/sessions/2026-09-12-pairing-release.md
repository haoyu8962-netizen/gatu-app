<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-12-pairing-release",
  "date": "2026-09-12",
  "title": "移动配对：常规发布自动门控与可选真机晋级",
  "kind": "retrospective",
  "status": "recorded",
  "topics": [
    "pairing-release"
  ],
  "summary": "普通部署允许配对开关开启；自动边缘门控与可选 promote 真机验收是不同路径。",
  "thread": {
    "id": "01a09457-b938-7862-8278-681459added6",
    "title": "解释 Sairn 服务配置不匹配"
  },
  "baseCommit": "422ea8a6",
  "commits": [
    "3b635411",
    "422ea8a6"
  ],
  "sources": [
    {
      "url": "https://github.com/zora4523-bot/gatu-app/blob/5d3935721f070075c5d976d61a3c27d12b5dc607/docs/mobile-sync-production-readiness.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/blob/5d3935721f070075c5d976d61a3c27d12b5dc607/deploy/README.md"
    },
    {
      "path": "docs/mobile-phone-access-device-validation.md"
    }
  ],
  "supersedes": []
}
-->
# 移动配对：常规发布自动门控与可选真机晋级

## 背景与范围

用户质疑配对发布必须先关闭开关、再提交真机证明的流程。相关任务于 `3b635411` 调整常规发布路径；`422ea8a6` 将其同步进 PR 分支。记录日期为事后整理日期，不把提交时间推断成部署发生时间。

## 结论与依据

- 常规 deploy.sh main 可以保留 CREATE/IMPORT 两开关为 true；不再强制要求关闭基线或先提交真机证明。
- 每次发布/回滚先关闭 Caddy 配对 marker，验证新 Node 进程与相关 origin 后，以正确权限原子写入 marker。外部探测失败时关闭入口并回滚。
- 可选 prepare/promote 流程仍要求同一产物对应的完整真机条目；普通部署取消的前置条件不能误删此流程的验证。
- 精确 owner、Agent 对账、法律/地区以及签名守卫保持独立，部署入口变化不能绕过它们。

## 验证与限制

来源任务报告 179 项部署回归及 13 项真实 Caddy/Nitro 检查通过；该任务有 3 项 Linux 专用检查和真机验收未执行。这些是来源任务报告的历史结果，本次未重新执行，且没有部署生产。对应报告当时“尚未推送”后来已由 422ea8a6 同步 PR 的事实更新。

## 后续与替代关系

“普通部署必须关闭配对并先有真机证明”的旧前置要求已失效；当前专题规范明确了范围。以后出现文档冲突时按具体发布路径核对，不能整体恢复旧限制或整体删除可选晋级验收。
