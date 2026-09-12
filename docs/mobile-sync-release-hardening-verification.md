# 移动配对发布防护实施记录

本文保留 2026-09-11 的历史实施与验收结果。2026-09-12 起，常规发布已允许直接开启配对，并使用自动 readiness 入口保护；旧的关闭基线和强制真机准入要求不再适用于常规发布。当前规则见 [生产发布流程](mobile-sync-production-readiness.md)，严格 prepare/promote 仍要求真实设备证明。

2026-09-11。对应 [R0–R5 修复计划](mobile-sync-release-hardening-plan.md)。代码与自动化流程已实施；未推送或部署，尚不满足真机/目标主机生产启用准入。

| 任务 | 实施与交叉验证 |
| --- | --- |
| R0/R1 路径封锁 | Caddy 匹配解码后的反斜杠分隔；临时票据封锁返回 503，永久歧义路径规则返回 400。独立测试路径表覆盖原始反斜杠、大小写 `%5c`、编码首字符与混合分隔。真实 Nitro 先以有效 JSON 签发、别名消费 204 证明路由可达，再验证 Caddy 拒绝。另用旧 handler 和上游调用计数证明封锁发生在旧登记执行之前；模拟移除临时封锁后，歧义路径仍拒绝、canonical 路径恢复。 |
| R1 回滚探针 | block/probe 使用原生 HTTP(S) 保留原始路径，不让 fetch URL 归一化掩盖反斜杠；首次基线、自动失败回滚和人工回滚沿用同一扩充探针。 |
| R2 监听 | 预检要求 HOST=127.0.0.1；非空 NITRO_HOST 必须相同，PORT/NITRO_PORT 仅缺省、空或 3000。systemd 每次启动（含 legacy）重验并归一端口。attest 检查调用环境后，以同一约束验证显式隔离端口；不再静默覆盖非法监听别名。精确 17 字节 capability、不可变 referral guard 和旧回滚语义保留。 |
| R3 外部证据 | 只从 shared/mobile-sync-evidence/<release>.md 读取；严格验证唯一身份表、完整 SHA、release、产物/配置摘要、API、gate 与全部 11 行。拒绝不完整/失败、重复/未知字段、错误身份和 symlink/越界路径。先固定字节快照再验证，发布记录绑定该证据 digest。真实临时 Git 仓库证明证据更新不改变 HEAD 或产物。 |
| R4 同产物发布 | prepare 完成唯一构建与 HTTP/重启校验，保存候选，不切换 current。promote 跳过安装和构建，重新验证 main、配置、证据、真实协议与候选字节，拒绝未声明的额外客户端文件（旧资源仅在发布复制阶段保留），复制相同 artifact；不覆盖 guard。缺少证据时真实 shell 发布函数失败且 current 不变；通过时 digest 不变。候选清理独立保留 current、基线及未发布候选。 |
| R5 CI/操作文档 | 保留四种编译 gate 矩阵，增加构建后真实 Caddy→Nitro 和 shell prepare/promote 测试。明确 TC-1 的桌面 owner 及导入后检查、TC-2 的手机测试员与故障操作员分工、同 HTTPS 暂存/Testnet 网络选择及外部证据安装。真机模板未填造 Pass。 |

## 验证结果与边界

本地为 macOS arm64、Node 24.15.0、pnpm 10.21.0、Caddy 2.11.4。完整相关 Node 测试：**156 项，153 通过，3 项 Linux 专用检查跳过**。三项是 systemd 解析、实际 flock 继承和真实生产端口绑定，已进入 Ubuntu CI；本地结果不能替代目标 Linux 检查。

```bash
CADDY_BINARY=/tmp/gatu-caddy-2.11.4/caddy \
MOBILE_SYNC_OUTPUT=/tmp/gatu-mobile-matrix-ms8vugj_/true-true \
node --test deploy/deploy-bootstrap.test.mjs deploy/deploy-health-check.test.mjs \
  deploy/validate-production-env.test.mjs deploy/validate-caddy-forwarded-headers.test.mjs \
  deploy/mobile-sync-release.test.mjs deploy/mobile-sync-caddy.test.mjs \
  deploy/mobile-sync-candidate.test.mjs scripts/validate-mobile-phone-access-device-validation.test.js
```

另外分别用既有 import-only 和双关实际 Nitro 产物执行候选测试，均 4/4 通过。测试用已有隔离产物验证新增发布工具，并没有为本次提交生成可生产提升的发行包；应用路由源码未在本任务改变。CI 对当前提交重新构建四个矩阵产物。shell 集成使用真实候选复制、证据验证、HTTP/重启与发布函数；平台相关 atomic mv 在 macOS 夹具中替换，安全基线预备使用测试桩，其实际逻辑另由回滚测试覆盖。

`bash -n`、Node 语法、workflow YAML 解析、`git diff --check` 通过。仓库 Biome 默认不覆盖 deploy/scripts，因此以相同规则的临时配置对改动 JS/MJS 格式化和检查。未修改业务 TypeScript、金融计算、签名或界面布局。

设备模板结构校验通过；严格校验仍因 **11 项 Not run** 拒绝启用。自动化中的 Pass 是临时目录内的合成夹具，不是真实设备证据。证据摘要只证明一致性，真实发生与结果由受控发行审核负责。

旧 handler 夹具 `deploy/fixtures/mobile-sync-legacy-server.mjs` 来自 `cef99af3` 父提交的 one-time-ticket-server.ts，经 TypeScript 5.7.2 仅擦除类型，内联原 60s/600s/60s 常量；仅被隔离回归测试引用，不部署、不公开监听。它用于证明代理独立保护旧 handler，不代表旧漏洞恢复为受支持协议。

## 官方依据与剩余准入

[Caddy path_regexp 官方说明](https://caddyserver.com/docs/caddyfile/matchers#path_regexp) 明确匹配 URI 解码后的路径；本修复同时用固定版本的真实代理确认语义。[Nitro Node runtime 文档](https://nitro.build/deploy/runtimes/node) 列出 HOST/NITRO_HOST 和 PORT/NITRO_PORT，项目实际产物的别名优先级与启动链已纳入检查。

生产仍需在受控环境安装并比对 canonical Caddy/systemd、先发布并固定双关基线、通过目标 Linux 与双 HTTPS origin 检查。启用配对前需要相同候选的全部真实手机/钱包验收，并按 [部署说明](../deploy/README.md#移动配对-v2-发布与自动入口保护) 提升同一产物。测试阶段不下单、不转账、不更换 owner、不跳过法律/地区/签名门禁。

## 发布重试修复补充

后续对抗测试发现两处恢复阻断：记录 chmod 0440 后目录移动失败，重试无法覆盖记录；发布后回滚，再提升同一候选被既有目录检查拒绝。修复将记录持久化改为先写完整临时文件并 `sync()`，再用同文件系统的 `link()` 创建最终名称；仅相同授权可幂等复用，冲突、残缺或 symlink 记录不覆盖。依据 [Node 文件系统 API](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromiseslinkexistingpath-newpath)，实际测试验证并发情况下的无覆盖行为。

复用 release 仍要求当前候选授权和审计记录完全一致，并验证已发布产物的 commit、release、gate、摘要、身份标记和实际文件。复用不重写产物、guard 或现有 carried assets。发布入口及切换前都执行校验，原服务重启、健康检查与安全基线回滚链保持不变。

新增验证：32 个并发相同记录写入、重复调用不改 inode/字节、冲突身份/配置/证据拒绝、残缺及 symlink 记录拒绝；复用时缺少记录、身份不符、产物篡改及 symlink release 拒绝。真实 Nitro shell 集成依次注入记录写前、写后、release rename、current 切换失败，验证故障解除后无需删除记录即可完成；回滚后再次提升保持服务器文件和记录 inode/字节不变，篡改既有服务器文件则在切换前拒绝。

应用路由、交易签名、钱包、金融计算及 UI 未修改。目标 Linux/systemd 和真实设备准入限制继续适用。

本轮使用双关实际产物运行上文完整部署测试命令（`MOBILE_SYNC_OUTPUT=apps/terminal/.output`）：158 项，155 通过，3 项 Linux 专用检查跳过。双开实际产物的候选测试 7/7 通过；两项记录/复用专项测试另验证严格 umask 下仍为 0440，以及 32 个冲突授权并发仅允许同一胜出授权。Biome（沿用仓库规则的临时配置）、Node 语法、`bash -n`、`git diff --check` 通过，设备模板仍为 11 项 Not run。未推送或部署。
