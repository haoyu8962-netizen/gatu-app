# 移动配对票据 v2：实施与验证

2026-09-11。本次完成修复代码和发布工具；**尚未通过生产启用准入**。本地使用 macOS arm64、Node 24.15.0、锁定 pnpm 10.21.0；CI 保持 Ubuntu / Node 22.15.0。验证产物来自当前工作树，不是可直接提升到生产的发行包。

后续复审更正：`cef99af3` 仍存在 Caddy 反斜杠路径绕过、仓库内真机证据的 commit 循环和 NITRO_HOST 校验缺口。下列通过记录只覆盖当时的测试集合，不能证明入口封锁或发布准入完整；重新复现、影响边界和任务拆解见[发布防护修复计划](mobile-sync-release-hardening-plan.md)。

当前发布防护修复与新增验证见[后续实施记录](mobile-sync-release-hardening-verification.md)。

## 已交付

- 服务端签发 128-bit CSPRNG ID；严格 v2 schema；旧 register 一律拒绝，客户端不能指定签发 ID。store 按 origin 隔离，首次消费 60 秒，原记录内同消费者重试，保留期到期或进程重启后拒绝。
- 服务端和 UI 共用编译 gate。默认关闭；CREATE 只有在 IMPORT 同时开启时生效。256 字节输入、容量限制、可信来源、独立限流与隐私响应头保留。
- 桌面先签发、再加密，将服务端 ID 纳入现有 GCM AAD。前后均复核身份、lease、可见性和期限。手机在 consume 前捕获 epoch，仅 204 后进入保存/激活/复核；拒绝票据清除当前草稿，网络失败保留有界重试。
- 新增双方刷新提示及六语言目录。票据错误保存语义状态，在渲染时通过 `Trans` 翻译；语言切换不替换按钮/告警节点，不修改草稿或触发消费。
- `build-meta.json` 暴露非敏感协议和编译 gate。独立 `.gatu-mobile-sync.json` 绑定实际 HTTP/重启验收、发行身份、产物文件清单和 SHA-256；生产流程还把实际启动 guard 纳入校验，保留原 17 字节 referral capability。
- 发布前拒绝不匹配的 flags、非 loopback HOST、缺少安全基线且入口未封锁的切换。固定关闭基线优先用于两条自动失败路径和文档中的人工回滚；清理历史 release 时保留当前目录和该基线。
- 当前 canonical Caddy 独立封锁票据路径。保留封锁期间只允许发布双关产物。启用前必须验证关闭基线，再通过受审查的配置变更解除封锁；真机验证器要求全部 11 行证据匹配发行 commit，不能以 `--allow-incomplete` 放行。
- CI 增加四组合真实生产构建/HTTP/重启验收、Caddy HTTP 测试、协议及发布回归，并在 job summary 记录验收身份和哈希。旧 PRD、真机模板、onboarding/email 文档和部署手册已同步。

## 交叉验证结果

| 检查 | 结果 |
| --- | --- |
| 票据、扫码、手机/桌面接线、wallet-session、Privy、onboarding、email 钱包 | 14 个 Vitest 文件，219 项通过 |
| 补充 core 与安全文档测试 | 20 项通过；其中 core 与上行覆盖重叠，不重复计总数 |
| 类型及规范 | terminal typecheck、修改的源代码 Biome、`bash -n`、diff whitespace 检查通过 |
| 发布、配置、清理/回滚、设备验证器与真实 Caddy | 130 项：128 通过、0 失败；2 项仅 Linux 支持，macOS 跳过 |
| 四种编译 gate | 双开、仅 CREATE、仅 IMPORT、双关均完成独立生产构建和实际 Node HTTP/重启检查；chunk cycle 和 bundle budget 均通过 |
| 最终关闭版本 | 在补齐错误提示的响应式翻译后重新构建，并按 `attest-env` 加载真实 referral guard 完成最终产物复验与身份/哈希校验 |
| 真机 | 验证器正常拒绝：RD-1–RD-8、TW-1–TW-3 共 11 行仍为 Not run；结构验证通过不代表验收通过 |

四组合的实际服务端结果：

| CREATE / IMPORT | v2 issue | 未知 ID 的 v2 consume | 旧 register |
| --- | --- | --- | --- |
| false / false | 503 | 503 | 400 |
| true / false | 503 | 503 | 400 |
| false / true | 503 | 410 | 400 |
| true / true | 200 + 严格 v2 元数据 | 410 | 400 |

双开产物验证同 origin 的 A/B 并发只有一个 204、另一方 409，胜者重试 204；跨 origin 消费该 ID 为 410。真实停止并等待旧 Node 进程退出、同端口启动新进程后，原 A/B 均为 410；旧 register 为 400，新签发可用，旧 ID 仍失效。额外链验证首次消费 204 后丢弃响应再重启；本地写入失败的回滚由路由回归交叉覆盖。

真实旧客户端模块来自 `4639917c`，以锁定工具链转译为 [测试 fixture](../deploy/fixtures/README.md)，在关闭及开启产物上均失败关闭。运行时把 VITE flags 改为相反值后，实际 HTTP 行为仍由编译值决定。

生产产物测试发现并修复了一个额外问题：成功签发时，Nitro 全局 `Referrer-Policy` 会覆盖 handler 的 `no-referrer`。已为票据路由及其子路径加入明确规则，成功和拒绝响应均重新验收。Node 探针使用原生 HTTP 保留 Host/转发协议，避免将探针自身的 403 误当作 gate 生效。

Caddy 2.11.4 的官方发布包经校验和验证后运行实际 HTTP 测试。使用 canonical 路由，仅把 listener、上游和日志改为隔离的本地测试资源；两个 Host 的大小写、编码、重复/尾斜杠、查询参数变体均在代理前返回 503，旧上游未收到请求；普通终端路径仍可达，伪造的 X-Forwarded-For / X-Real-IP 被覆盖。匹配和响应规则对照 [Caddy 官方 matcher 文档](https://caddyserver.com/docs/caddyfile/matchers#path_regexp) 与 [respond 文档](https://caddyserver.com/docs/caddyfile/directives/respond)。本地 HTTP 不替代生产 HTTPS 验收。

## 复验入口

```bash
pnpm --filter @gatu/terminal typecheck
pnpm --dir apps/terminal exec vitest run mobile-sync mobile-agent-sync-route mobile-agent-sync-modal mobile-agent-qr-scanner mobile-pairing-feature wallet-session privy-config trading-onboarding-gate use-email-embedded-wallet
CADDY_BINARY=/path/to/caddy node --test deploy/deploy-bootstrap.test.mjs deploy/deploy-health-check.test.mjs deploy/validate-production-env.test.mjs deploy/validate-caddy-forwarded-headers.test.mjs deploy/mobile-sync-release.test.mjs deploy/mobile-sync-caddy.test.mjs scripts/validate-mobile-phone-access-device-validation.test.js
VITE_MOBILE_PAIRING_CREATE_ENABLED=false VITE_MOBILE_PAIRING_IMPORT_ENABLED=false NITRO_PRESET=node-server pnpm --filter @gatu/terminal build
node deploy/mobile-sync-release.mjs attest apps/terminal/.output false false
node scripts/validate-mobile-phone-access-device-validation.js
```

生产只使用干净 main 上的 `deploy.sh main`：它调用 `attest-env`，比对已验证配置与实际产物，重新生成主机发行证明，并执行 Node/双 origin 健康检查。不要拿本地或任意 CI `.output` 绕过发布脚本。每份已验证产物的根目录保留 `.gatu-mobile-sync.json`。

## 尚未完成的准入

- Linux systemd parser、跨 exec 的 flock，以及真实 Linux 主机的安装、切换、回滚；本地两项 skip 不算通过。
- 独立 HTTPS 暂存和两个生产 origin 的真实证书、代理链、无公开 Node 旁路及健康检查。未连接或修改生产主机。
- 全部物理设备/PWA/真实摄像头、旧页面完整刷新，以及独立 Hyperliquid 测试网 owner 的批准、远端有效期对账、导入和撤销。未签名、下单或转移资金。

继续按 [生产准入阶段](mobile-sync-production-readiness.md#5-推荐发布顺序) 推进。完整 QR 同时携带密文和解密材料，仍是 bearer credential；本次修复不解决完整 QR 被复制后的离线解密/重新封装，也不证明可以绕过 master 批准。该边界继续按[独立协议任务](mobile-sync-ticket-remediation-plan.md#7-独立后续任务真正限制-qr-凭证复制)处理。
