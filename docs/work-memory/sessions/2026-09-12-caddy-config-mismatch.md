<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-12-caddy-config-mismatch",
  "date": "2026-09-12",
  "title": "部署第 2 步：已安装 Caddy 配置与仓库不一致",
  "kind": "task",
  "status": "recorded",
  "topics": ["pairing-release"],
  "summary": "Caddy 转发头警告不是中止原因；管理员依次验证、安装、reload 仓库配置后重跑部署，服务器恢复尚待验证。",
  "thread": null,
  "baseCommit": "42349cb1",
  "commits": [],
  "sources": [
    { "path": "deploy/deploy.sh" },
    { "path": "deploy/Caddyfile" },
    { "path": "deploy/README.md" }
  ],
  "supersedes": []
}
-->
# 部署第 2 步：已安装 Caddy 配置与仓库不一致

## 背景与范围

用户提供服务器部署日志：同步到合并提交 `177c68c9` 后，第 2 步先报告转发头校验通过，
随后输出 `WARN ... Unnecessary header_up X-Forwarded-For`，再因
`ERROR: installed Caddyfile does not match /opt/gatu/repo/deploy/Caddyfile` 退出。
以上服务器状态来自用户日志，本任务未连接服务器；本地核对基线为 `42349cb1`，工作区开始时干净。
本记录是本次诊断摘要，不是完整会话导出；未核对原始任务标题，thread 保留 null。

## 结论与依据

- `verify_caddy_config` 先运行转发头验证与 `caddy adapt`，再以 `cmp -s` 比较仓库与系统安装文件。
  日志到达不一致分支，说明本次明确阻断发生在文件比较，而非前面的警告。
- 主流程在第 2 步调用该检查，第 3 步才注入环境，第 5 步才构建；本次尝试尚未进入新 release 切换。
  不据此宣称旧服务健康，服务器实时状态未检查。
- 按部署手册以管理员权限依次执行 Caddy validate、install、systemctl reload，成功后以 gatu 用户重跑 main 部署。
  不更改配对开关、手动创建 readiness 文件或删除覆盖客户端 IP 的配置。
- 保留管理员安装边界，不为省略一次初始化操作而授予应用用户修改公网代理的权限。

## 验证与限制

只读核对了部署脚本的报错分支、调用顺序、仓库 Caddyfile、当前手册和既有配对发布记录。
补充手册对警告与文件不一致错误的区分。工作记录及索引完成后运行 `pnpm memory:index`、
`pnpm memory:check`、`pnpm memory:test` 和 `git diff --check`；具体结果在收尾追加。
未执行服务器 validate/install/reload，未重跑远程部署，未验证公网或真实钱包流程。

本地收尾结果：索引生成及校验通过，8 项工作记忆测试通过（0 失败、0 跳过），
`git diff --check` 通过。仅修改部署手册、此任务记录及生成索引，未修改部署脚本或 Caddy 配置。

## 后续与替代关系

服务器上三条管理员命令成功后，重新运行部署并观察是否通过第 2 步。
后续阶段可能有独立错误；本记录不宣称部署完成，不替代现有发布与回滚契约。
