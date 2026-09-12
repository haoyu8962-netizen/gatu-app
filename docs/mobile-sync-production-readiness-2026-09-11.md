> 历史原文快照，归档于 2026-09-12。来源：`git show 1b71e15b224b432a117f8cb553697ede2ef1c2f6:docs/mobile-sync-production-readiness.md`。以下正文按来源保留；其中发布门槛已被[当前生产发布流程](mobile-sync-production-readiness.md)替代，实测结果只属于当时版本。归档用于恢复旧修复计划指向的观察和测试证据，不是新的发布要求。

# 移动配对票据：生产发布核查与准入要求

核查日期：2026-09-11。代码基线：`353f3a4f`。本文补充[修复计划](mobile-sync-ticket-remediation-plan.md)，记录规划基线和发布要求；实现及自动化结果见第 7 节。当前仍不具备启用配对所需的真机与生产证据。

后续状态：对 `cef99af3` 的复审确认入口封锁、验收身份和监听约束仍有缺口，详见[发布防护修复计划](mobile-sync-release-hardening-plan.md)。当前 Caddy 的标准路径 503 不能独自授权 legacy 回滚；本文第 5 节只能在对应保护修复并验收后执行。

## 1. 官方资料与当前实现如何对齐

| 依据 | 本次确认 | 实施约束 |
| --- | --- | --- |
| [Hyperliquid QR 指南](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/connect-mobile-via-qr-code) | 桌面钱包签名生成 QR，手机通过 Link Desktop Wallet 扫描 | 保留桌面 master 批准和手机导入的分工；指南未公开票据存储、密码格式或重启恢复算法 |
| [API wallets / nonces](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) | master 批准 Agent，查询用 owner 地址；同名批准可替换旧 Agent，注销后的地址不宜复用 | Info 对账使用 owner；失败重试不自动批准；测试使用独立 owner/Agent，不替换生产 Agent |
| [TanStack Start Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)、[Nitro Node](https://nitro.build/deploy/runtimes/node) | Vite/Nitro 产物通过 Node 启动，支持反向代理；cluster 是另一种部署形态 | 测试真实 `.output/server/index.mjs`；本方案只允许单进程，不能改成 cluster/PM2 多 worker 后继续依赖 Map |
| [Vite 7 环境变量](https://v7.vite.dev/guide/env-and-mode)、[发布后的旧资源处理](https://v7.vite.dev/guide/build#load-error-handling) | 构建变量静态嵌入；旧页面可能继续请求旧 chunk，HTML 缓存策略影响更新 | 使用锁定的 Vite 7 文档，保留 immutable release 和旧 hashed assets；刷新提示不能等同于已升级客户端 |
| [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、[respond](https://caddyserver.com/docs/caddyfile/directives/respond) | 可在代理前直接拒绝路径；代理后 IP 取决于可信转发配置 | 首次协议切换可先封锁票据入口；保留当前覆盖 X-Forwarded-For/X-Real-IP 的约束；若加 CDN，重新验证信任链 |
| [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) | 摄像头依赖安全上下文和授权；用户也可能一直不回应权限提示 | HTTPS、权限拒绝、无摄像头、权限悬而未决、取消清理均需验收；桌面模拟不等于真机通过 |
| [sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) | 按 origin/标签页隔离，刷新可保留；有 opener 时可能复制初始内容 | consumerId 不是硬件设备身份；测试同标签页刷新、独立上下文和新标签页，不能假定所有新窗口都有新 consumerId |

本地版本为 `vite@7.3.0`、`nitro@3.0.260311-beta`、`@nktkas/hyperliquid@0.33.3`。当前 Nitro 安装源码确有 `node-server` preset；保留部署脚本的 `NITRO_PRESET=node-server`，不根据新版文档中的命名直接改配置或升级依赖。

本次 Exchange 页面抓取未能重新定位 `valid_until` 的正文，Markdown 入口也未能成功读取；不据此推断功能已移除。本地 SDK 的 approveAgent schema 明确处理该后缀，extraAgents 类型提供 `validUntil`。发布前仍须用测试网验证实际批准期限及远端匹配；本次不把最大期限或完整响应字段重新标成已由官方页面确认。

## 2. 官方终端的实际调试记录

使用独立、无登录状态的 Chromium 上下文访问 `https://app.hyperliquid-testnet.xyz/trade`，未使用用户现有会话、未签名、未下单。只记录公开交互，不保存凭证。

| 场景 | 本次观察 | 证据边界 |
| --- | --- | --- |
| 桌面访客点击 Connect | Email、Default Wallet、WalletConnect、OKX、Coinbase；未出现 Link Desktop Wallet | 当前访客状态，不代表所有已连接钱包的界面 |
| 390 × 844，仅改变 viewport，重新加载 | Connect 中仍未出现 Link Desktop Wallet | 仅布局断点不能覆盖官方移动识别 |
| 390 × 844，Android Mobile UA、mobile/touch，重新加载 | Connect 出现 Link Desktop Wallet、Email、WalletConnect | 本次为模拟设备，不是 Android 真机 |
| 点击 Link Desktop Wallet | 出现 Scan QR Code 与桌面生成 QR 的提示 | 与官方 QR 指南一致；没有解读其内部协议 |
| 注入 getUserMedia 的 NotAllowedError 后进入扫描 | 观察到两次摄像头请求、零个活动视频流；检查时仍显示扫描提示和 Loading 图像，未见明确拒绝说明 | 是合成拒绝，不是系统权限弹窗测试；不能照搬为本项目的错误处理标准 |

检查结束后重新加载以清除注入，并关闭调试页。本次未测试真实 QR、摄像头拍摄、owner 批准、官方后台状态或官方服务重启。项目仍应保留用户主动扫描失败的明确反馈、取消路径和资源清理，不因参考官方界面而删掉这些保护。

## 3. 修复前发布流程的缺口

| 编号 | 仓库证据与交叉验证 | 发布要求 |
| --- | --- | --- |
| R1 自动回滚可能回到旧协议 | [deploy.sh](../deploy/deploy.sh) 在 restart 和 health 失败时均回退 previous_release；现有 bootstrap 测试验证的是旧 guard 恢复，没有票据协议下限检查 | 两条失败分支、人工回滚和回滚后探针都必须遵守安全版本下限；第一版切换前先建立入口封锁或已验证的安全基线 |
| R2 两个 origin 共用构建 | [Caddyfile](../deploy/Caddyfile) 共用 127.0.0.1:3000；[mobile-pairing.ts](../apps/terminal/src/config/mobile-pairing.ts) 只解析两个全局构建开关 | 不能声称可单独给 testnet.gatu.ai 开启；先在独立暂存实例/HTTPS origin 验证，再对生产共享 release 决策。按网络放量需另行实现明确的网络级 gate |
| R3 已有健康检查不检查票据 | deploy 的 Node/edge 检查覆盖资源、版本、图表和 referral；[build-meta.json](../apps/terminal/src/routes/build-meta[.]json.ts) 没有票据协议/开关信息 | 新增协议能力与开关记录，并在 Node 和两个公网 origin 验证真实票据响应；普通页面 200 不能视为配对通过 |
| R4 环境校验不覆盖配对决策 | [env validator](../deploy/validate-production-env.mjs) 未校验配对开关；实际用合成配置传入 TRUE/ambiguous 仍退出 0；[CI](../.github/workflows/production-build.yml) 未包含票据核心测试/四组合构建验收 | 增加配对变量解析、有效开关摘要、release 期望值核对；加入关闭/开启构建与票据集成测试。当前 resolver 对错误值仍关闭，这里是发布意图未被检查，不是错误值能够开启权限 |
| R5 capability 文件不能直接追加 | [gatu.service](../deploy/gatu.service) 要求 `.gatu-release-capabilities` 精确为 17 字节的 `referral-join-v1\n`；bootstrap 测试会拒绝畸形内容 | 推荐独立的配对 release manifest，不改现有 referral 文件格式；若改 launcher，必须连同单元、安装验证及 Linux 测试一起交付 |
| R6 真机准入过时且未完成 | [旧真机清单](mobile-phone-access-device-validation.md) 仍要求配对码、手机连接 owner 和自建 WalletConnect scanner；[验证器](../scripts/validate-mobile-phone-access-device-validation.js) 固化这些旧期望 | 更新清单、验证器、测试和证据模板；既有 11 行均 Not run，不能通过 `--allow-incomplete` 或删必需行来宣称验收完成 |

以上是发布方案缺口，不表示线上已经发生攻击或该主机当前启用了配对。未连接生产主机确认实际 Caddy、systemd、运行进程、开关或外部代理。

## 4. 必须交付的发布能力

### 安全基线、身份与回滚

为每个新 immutable release 增加独立的配对 manifest，例如 `.gatu-mobile-sync.json`，记录 schema 版本、commit/release、ticket API v2、拒绝旧登记的能力、实际编译的两个 gate 和单进程 store 模式。它不包含请求、ID、钱包地址或密钥。构建生成，不手工给旧产物补标记；公开 build metadata 可附加相同的非敏感能力摘要。

manifest 只是产物声明，必须与相应产物的 HTTP 验收和哈希/发行记录绑定。部署前验证目标和回滚候选身份、文件完整性及配对能力；两个失败分支均不能直接采用任意 previous_release。优先固定一份通过验收、配对关闭的 v2 基线，release 清理不能删掉它。解除入口封锁后，禁止回滚到 markerless 或旧 register 仍可成功的版本。

首次升级尚无安全候选时，推荐先在受版本管理的 canonical Caddy 配置中暂停票据路径，返回 503、no-store、no-referrer、Retry-After。封锁覆盖实际可路由的路径及尾斜杠变体，不影响行情、既有 Agent 的使用和用户主动撤销。通过 Caddy validate/adapt 与真实 HTTP 确认不会落到 SSR 200，也不能由旁路端口绕开；Node 仅监听 loopback。

入口封锁必须独立于应用回滚保留；若首次升级失败而恢复旧应用，仍保持封锁并将发布标为失败。仓库 Caddyfile 与已安装文件必须一致，不能用未记录的手改绕过部署检查。解除封锁前必须已经拥有安全基线；没有基线且无法验证入口封锁时，不切换应用。

### 构建与自动化

- 用仓库锁定的 pnpm、frozen lockfile、与 CI 一致的 Node 环境构建。保留现有 chunk cycle、bundle budget、i18n 和图表产物检查，不通过改依赖版本规避失败。
- CI 至少把真实关闭、双开两份生产产物分别启动并测 HTTP；四种配置均验证实际编译语义，包含仅 IMPORT 和仅 CREATE 的负面测试。隔离构建目录和浏览器 fixture cache，不能覆盖正在运行的应用构建。
- 生产 env 校验应输出 create/import 的实际布尔值；缺失按既有关闭语义处理，显式值限定为已记录的空值/false/true，拒绝拼写或引号歧义。CREATE=true 且 IMPORT 未开作为无效发布意图拒绝，resolver 仍须保持失败关闭。
- 开关来自 `/opt/gatu/shared/.env.local`，修改后重新构建；`.env.runtime` 里的 VITE 变量不能作为关闭证据。导入单开不能为 API v2 从旧进程恢复票据，不是跨版本兼容桥梁。
- 当前部署在主机上从 origin/main 重新构建，并非直接提升 CI 二进制。必须记录主机生成的 commit、release、构建配置和产物哈希，并对最终产物做探针；不能把同一源码 SHA 的 CI 通过等同于主机二进制已验收。

### HTTP 与浏览器验收

| 检查面 | 必需结果 |
| --- | --- |
| Node 直连与 HTTPS edge | 使用正确的 Host/Origin/可信转发设置，验证实际请求 origin 一致；关闭返回 503；合法同源旧 register 返回 400；错误来源拒绝，不能因全是 403 而误判 gate 正确 |
| 开启后的合成票据 | 每 origin 少量 issue → A=204 → A 重试=204 → B=409；另一 origin 使用该 ID 为 410。只在内存中持有合成 ID，不在流水线输出响应体 |
| 真正重启 | 停止旧进程并等待退出，同 origin 启动新进程；A/B 旧 ID=410、旧 register=400；新 issue 正常。包含首次响应丢失/持久化失败链，不只清空 mock store |
| 客户端失败关闭 | 错误 200 HTML/JSON、202、重定向、超时、503、错误 issue schema 不持久化/激活；正确 204 才进入既有 epoch 流程 |
| 代理限流 | 保留独立 issue/consume 限额；伪造转发头不能创造新限流桶；超过配额为 429，缺失可信 IP 为 503；生产 smoke 不进行压力测试 |
| 缓存与版本 | 配对页面、票据响应和 build metadata 不缓存；保留旧 hashed assets；真实旧 bundle 在新服务端失败关闭，双端用户主动刷新后恢复，不刷新正在签名的页面 |
| PWA 与存储 | [现有 SW](../apps/terminal/public/sw.js) 不接管 POST/导航；不得新增票据缓存或离线成功。覆盖浏览器到 PWA、新窗口、存储拒绝与同标签页刷新；跨上下文不承诺恢复 |
| HTTPS 与摄像头 | 保留 camera=(self)；确认 edge 未追加更严格冲突的 Permissions-Policy/CSP。真实拒绝、未回应、取消、后台恢复均不留活动视频流、不自动批准 Agent |

初始 smoke 总请求数保持在每 IP 的现有限额以内，重试有界。边缘临时封锁期间只期望 503，不能把它当作 handler 的旧 register=400 验证；后者先在 Node/暂存检查，解除封锁后再从两个公网 origin 检查。

### 真机与 Hyperliquid 测试网证据

更新旧 RD/TW 映射，至少覆盖 iOS Safari、Android Chrome、iOS Chrome、已安装 PWA，以及明确支持或明确拒绝的钱包内浏览器。每个必需场景记录设备/系统/浏览器版本、commit/release、origin/env、两个 gate、结果及脱敏证据。

验收实际流程是：桌面精确 owner 主动批准 Mobile Agent，远端名称/地址/期限匹配后获取票据并展示 QR，手机解析、复核并主动导入。手机不再输入配对码或先连接 master；也不新增与 Privy 平行的钱包目录。保留外部钱包和 email 的各自签名合同；普通 email 交易不能因配对测试新增 Agent 批准。

先使用独立测试网 owner 和测试 Agent；暂存若访问主网必须用隔离 Agent 名称，不能复用生产 slot。批准成功需用 owner 查询 Info 验证远端实际状态；取消、未知结果和失败不能视为成功。票据签发/消费、刷新和恢复检查均不得签名。完成后由测试 owner 明确撤销，并复核失效；不以主网下单或资金转移作为票据验收手段。

证据只记录结果和必要的非敏感版本信息，不保存 QR 截图、fragment、私钥、解密材料、完整签名或含它们的 HAR。不得通过延长密钥存储时间来提高测试可重复性。

## 5. 推荐发布顺序

| 阶段 | 动作 | 进入下一阶段的条件 |
| --- | --- | --- |
| P0 暂存验收 | 完成发布工具、新协议自动化和关闭产物验收；在独立 HTTPS 实例验证失败回滚，同时推进开启产物及真机检查 | 关闭基线相关测试有真实结果；Linux 专属测试无跳过；开启产物和真机证据可继续准备 |
| P1 首次入口保护 | 安装已验证、受版本管理的票据路径封锁，两个生产 origin 均为 503；其它终端路由正常 | 没有可绕过的直连入口；封锁不会被应用自动回滚撤销 |
| P2 发布关闭基线 | 一次部署完整 API/client v2，CREATE/IMPORT 均关闭，重启清空旧 Map；验证身份、Node 关闭响应与双 origin 一致 | 固定安全回滚 release；旧 register 不能在 handler 成功；既有会话不被删除 |
| P3 解除入口保护 | 通过 canonical Caddy 更新解除临时封锁；此时应用仍关闭配对，运行端到端负面探针 | 两 origin 旧 register=400、v2 issue/consume=503；安全回滚候选就绪 |
| P4 发布开启版本 | 开启产物及全部必需真机证据通过后，从相同修复代码构建双开产物，经最终产物验收后原子发布、重启并运行合成 smoke | Node、两个 origin 的 commit/release/能力相符；A/B 语义正确；无新增签名或会话回归 |
| P5 观察或回滚 | 观察发布窗口的响应、拒绝分类、延迟和进程重启；异常即关闭入口并回到固定关闭基线 | 回滚后复查身份、503/400 契约及已有终端功能，不能只看 systemctl active |

每次重新部署/restart 都会使尚未导入的旧票据失效，这是本方案选择的行为；不承诺配对无中断或零停机。P2 是安全基线发布，P4 才是用户功能开启；二者均携带完整协议，不能只上线半套客户端。完整真机验收未完成时，可以在关闭基线相关验证通过后推进 P1–P3，以尽早关闭旧缺口，但配对必须继续关闭，不得进入 P4。

监控只聚合 operation、状态码、有限拒绝原因、延迟、release、进程重启次数和 store 容量；不使用 syncId/consumerId/IP/owner 作为指标标签。现有 Caddy access log 可能包含请求元数据，实施时核对日志采集链，禁止 body/fragment/密钥；不增加原始请求日志。完整 QR 被复制后的风险仍属于独立协议任务，不能列为此次发布已解决。

## 6. 规划阶段的验证基线

已运行：

```bash
node --test deploy/deploy-bootstrap.test.mjs \
  deploy/deploy-health-check.test.mjs \
  deploy/validate-caddy-forwarded-headers.test.mjs \
  deploy/validate-production-env.test.mjs
node scripts/validate-mobile-phone-access-device-validation.js
```

部署测试共 98 项：96 通过，0 失败，2 项因 macOS 跳过（Linux systemd parser、跨 exec 的 flock）。这证明现有脚本基线，未覆盖本文要求的新票据发布能力。

真机验证器按预期退出 1：RD-1–RD-8、TW-1–TW-3 共 11 行仍为 Not run；其旧流程语义也需要更新。这是既有证据缺口，不是本次文档修改造成的失败。

本次另完成官方文档核对、锁定依赖源码核对及第 2 节的浏览器检查。没有运行完整生产构建、真实 Caddy/Nitro 新协议集成、Linux systemd/flock、物理设备/钱包签名或生产操作。当时结论是“发布规划已补齐，实施与准入证据待完成”，不能写成“已可安全启用生产”。

附加的发布配置复现只调用实际 validator 读取临时合成文件，没有网络请求或真实凭证；错误配对值仍通过校验，支持 R4 的结论。两份规划文档的本地链接、标题锚点与 Markdown 代码围栏在提交前检查。


## 7. 实施交付与本地验收

T0–T5 的代码、发布工具和文档已交付；详细范围、交叉验证、命令及限制见[实施与验证记录](mobile-sync-implementation-verification.md)。四种开关组合已在实际 Node 产物上验收，并追加最终关闭产物与真实启动 guard 的复验。生产构建发现的成功响应隐私头覆盖问题也已修复。

第 3 节是修复前的证据基线，不再描述当前代码状态。当前 canonical Caddy 保持独立票据封锁；新的发布流程要求产物证明、配置一致性、安全回滚基线及 Node/双 origin 探针。真机矩阵已按 Agent QR/Privy 流程更新，但 11 行仍为 Not run。Linux 专属检查、真实 HTTPS 暂存和生产部署未执行，不能据本地通过宣称已经具备生产启用资格。
