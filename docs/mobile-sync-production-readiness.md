# 移动配对票据：生产发布流程

更新：2026-09-12。常规部署允许直接开启配对；原先“必须先关闭基线、完成外部真机证明再开启”的发布限制已调整。自动化协议校验、精确 owner 签名、Agent 对账、法律/地区限制及失败关闭的应用行为不变。

## 常规发布

在 `/opt/gatu/shared/.env.local` 保持 CREATE/IMPORT 两个配对开关为 `true`，安装仓库的 systemd 与 Caddy 配置后，执行 `sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main`。具体配置安装命令见 [部署手册](../deploy/README.md)。主网与测试网共享编译开关，不支持分别启用。

脚本构建唯一候选并验证配置、身份、产物 SHA-256、真实 Nitro HTTP 和重启后的票据语义。常规发布不要求设备证明文件；审计记录中的 `publicationMode=deploy` 与 `evidenceSha256=null` 明确表示未使用外部设备证明，不能标为真机通过。

## 自动入口保护

Caddy 使用 `/opt/gatu/mobile-sync-edge-ready` 控制票据入口，缺失即封锁。部署脚本在任何 release switch 或 rollback 前删除该文件，并从两个公网 origin 验证封锁有效。新进程启动后，先验证应用身份、版本及两个 origin 的 Node 协议，再以 0644 原子创建文件，随后验证两个公网 origin 的票据行为；失败立即封锁并回滚。

该文件在公开目录之外，内容仅为已验证 release 路径，不含凭证。`/opt/gatu` 必须允许 Caddy 遍历；shared 环境文件仍保持私密。不要手工创建 readiness 文件或直接切换 current。文件存在性匹配无需 Caddy reload；[Caddy 官方 matcher 说明](https://caddyserver.com/docs/caddyfile/matchers#file)描述了其工作方式。

入口关闭时覆盖标准路径、大小写、编码、重复/尾斜杠及反斜杠变体；入口开放时保留反斜杠路径 400 保护。覆盖而不追加 X-Forwarded-For/X-Real-IP；Node 仅监听 127.0.0.1:3000。首次升级可以直接双开，但只有新进程通过协议验收后，Caddy 才放行。

## 回滚与中断恢复

`mobile-sync-safe-release` 保留最近一次健康检查通过的 v2 版本，可为双开或关闭版本。回滚先关闭入口，优先选择通过身份与字节校验的固定 v2 版本；其 Node 探针通过后才重开。首次升级若只能回到 legacy，则票据入口保持 503。发布中断后重跑部署；不要补造 manifest 或 readiness 文件。

应用重启会清空内存票据，尚未导入的二维码必须重新生成。已激活的 Agent、撤销操作、普通邮箱和外部钱包登录不受入口文件控制。

## 可选严格发布与设备结果

`deploy.sh main prepare` 保留不切换生产的候选准备行为。将同一产物部署到独立 HTTPS 暂存，使用隔离 Testnet owner 完成 [设备矩阵](mobile-phone-access-device-validation.md)，将真实记录保存为候选对应的外部只读文件，再执行 `deploy.sh main promote <candidate-id>`。

`promote` 在任一配对开关开启时仍要求完整、匹配的 11 行真实设备证据；不重新构建，不改写 guard 或候选。记录 `publicationMode=promote` 与证据摘要。不能用自动化、模拟摄像头或 `--allow-incomplete` 代替真机测试。

## 验证边界

自动化验证真实 Node/Caddy 票据响应、旧 register 拒绝、A 重试 204/B 冲突 409、origin 隔离、重启失效、转发 IP、入口开关和发布/回滚顺序。它不执行钱包签名或交易，不代表 iOS/Android 真机、摄像头授权、PWA 和钱包批准已验收。仓库设备模板保留 Not run，已有历史验证文档记录各自当时的执行结果，不能作为当前候选的外部证明。
