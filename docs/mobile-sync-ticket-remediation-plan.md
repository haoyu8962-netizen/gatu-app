# 移动配对票据修复计划

状态：待实施。本文只记录方案、调研依据和验收任务，不表示修复已经完成。

调研日期：2026-09-10；复审日期：2026-09-11。最初审计基于 `0c27aa14`，原计划基于 `e922a82c`。本次复审检查计划提交 `5844e4b8` 及其业务代码，逐项核验 Grok 4.6 对抗审查意见，并补充真实 HTTP 重启复现。实施前重新检查相关文件和并发工作区改动。

## 1. 修复目标与边界

本轮交付目标：旧 `syncId` 在消费、过期或服务进程重启后，不能通过重新登记恢复可消费状态；同一有效票据只允许首次成功绑定的消费者继续幂等重试。

当前问题是票据生命周期缺陷。[one-time-ticket-server.ts](../apps/terminal/src/lib/mobile-sync/one-time-ticket-server.ts) 接受客户端指定的 ID，登记与消费状态仅在进程内 `Map` 中。此前两个独立 handler 调试脚本已复现；本次进一步将原 handler 无修改打包，通过本地 HTTP 适配器运行于子进程，终止后在同一 origin 启动新进程，得到：

```text
登记 200 → A 消费 204 → A 重试 204 → B 消费 409
真实子进程重启 → A 重试 410 → B 消费 410
重新登记原 ID 200 → B 消费 204
```

[部署约定](../deploy/README.md)要求进程重启使旧 QR 安全失效。[现有测试](../apps/terminal/src/lib/tests/mobile-sync-one-time-ticket-server.test.ts)只覆盖向空 store 直接消费，未覆盖重新登记后的组合路径。

本次运行确认进程 PID 不同且 origin 相同，时钟注入推进 90 秒。它验证了实际 handler 的进程内状态丢失及重登记行为；适配器不包含 Nitro、Caddy 或生产部署，不能代替 T4 的生产构建验收。

本轮不声称解决完整 QR 被复制后的 Agent 私钥泄露。当前 [sync-core.ts](../apps/terminal/src/lib/mobile-sync/sync-core.ts) 把 Agent 私钥放在密文中，同时把解密密钥放进同一 URL fragment；持有完整 QR 的人可以离线恢复私钥，甚至重新封装一个新 QR。更换票据存储或 ID 签发方不能消除这个事实。

`consumerId` 是客户端会话中的随机重试凭证，不是硬件设备证明。验收应使用“首次消费者”，避免承诺不可复制的设备绑定。P2 是本项目的工程优先级建议，不是外部规范给出的漏洞等级。

### 对抗意见的复审裁定

| 意见 | 代码与交叉验证 | 裁定与处理 |
| --- | --- | --- |
| 重启后旧票据可被复活 | 上述真实 HTTP 链与 store 实现一致 | 确认存在，T1 删除客户端登记 ID 的能力；这是生命周期缺陷，尚无证据证明可以绕过 master 的 Agent 批准 |
| G1：重启失效与同一消费者重试相互矛盾，计划未覆盖根因 | 原计划已包含重启失效和重登记回归；现有 store 在原进程返回 A=204/B=409，重启后均为 410 | “未覆盖根因”的结论不成立；接受措辞改进，明确幂等重试以原记录仍在、未过保留期为条件，补完整状态表和故障链 |
| G2：QR/draft 升版非必要，API 与加密版本耦合 | [sync-core.ts](../apps/terminal/src/lib/mobile-sync/sync-core.ts) 已把 ID 绑定进 GCM AAD；当前票据请求没有版本字段，API 可单独升级；[draft-storage.ts](../apps/terminal/src/lib/mobile-sync/draft-storage.ts) 的存储形状无需改变 | 接受缩小迁移范围的建议，不采纳“API 无法独立升版”的判断；只升级票据 API，保留 envelope v2、现有 AAD/plaintext v2 和 draft v1，不将密码内部版本强行拆开 |
| G3：先 consume 再捕获 epoch 会产生竞态 | [手机导入路由](../apps/terminal/src/routes/mobile-agent-sync.tsx) 实际先 capture epoch，再 consume、按 epoch 持久化/激活/复核；现有路由回归覆盖失效和回滚 | 当前代码不存在所指的顺序错误；修正计划简写，防止实施时倒置已有顺序 |
| G4：构建期 gate 可能被误写成运行时配置 | 原计划已经要求同一构建配置；进一步检查发现 [feature resolver](../apps/terminal/src/config/mobile-pairing.ts) 默认关闭，但当前 handler/route 未读取 gate，实际 handler 仍接受上述登记/消费 | 接受补充构建负面测试，不认定原计划遗漏此原则；现有服务端缺少关闭约束则确实存在，T1 接入同一配置、T4 验证 HTTP；未据此推断线上开关状态 |
| C1：客户端把任意 2xx 当作已消费 | 调用实际 [ticket client](../apps/terminal/src/lib/mobile-sync/one-time-ticket-client.ts) 并注入 fetch 响应，204、HTML 200、202 均得到 accepted | 确认解析过宽；T2 仅接受 204。错误代理/路由返回 200 时可误放行票据步骤，但未观察到生产代理确实如此，不能称为已复现的完整交易越权 |
| C2：旧页面会提示刷新升级 | 实际 client 把 400 映射为 unavailable，手机路由显示检查连接并重试 | 原计划的兼容体验承诺不成立；旧 JS 不会因服务端升级获得新文案，发布说明必须要求双端完整刷新及重新配对 |
| 恢复建议：任何失败后都可用原 Agent 免签生成新 QR | [桌面弹窗](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx) 在 QR 成功显示后清除 [内存恢复记录](../apps/terminal/src/lib/mobile-sync/desktop-approval-recovery.ts)；重新展示要求仍有 approved-unrevealed 记录 | 不采纳无条件承诺；仅已有有效恢复记录可走免签展示。记录已清除或页面刷新后，重新建立连接可能需要用户明确批准新的 Agent |

G1–G4 对应外部模型意见，C1/C2 为本地独立交叉检查。所有裁定以当前代码、运行结果和官方依据为准，模型的严重度与措辞不直接作为事实。

## 2. 官方依据与实测证据

### 官方协议与开发文档

| 来源 | 已确认的规则 | 对本计划的约束 |
| --- | --- | --- |
| [Hyperliquid：手机扫码连接](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/connect-mobile-via-qr-code) | 桌面连接钱包并签名，手机通过 Link Desktop Wallet 扫码 | 保留桌面 owner 授权和手机导入分工；文档没有说明其内部票据存储或重启策略 |
| [Hyperliquid：API wallets / nonces](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) | master 批准 Agent；nonce 按 signer 追踪；注销后的 Agent 地址不宜复用 | 票据 ID 与交易 nonce 分开；重新展示二维码不能自动重批 Agent；新授权使用新 Agent key |
| [Hyperliquid：Approve an API wallet](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#approve-an-api-wallet) | approveAgent 带网络、Agent 地址、名称、nonce 和签名；名称支持 valid_until 到期时间 | 继续核对远端 Agent 地址、名称和期限；不能用票据 204 代替链上授权 |
| [官方 Python SDK：approve_agent](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/hyperliquid/exchange.py) 与 [sign_agent](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/hyperliquid/utils/signing.py) | approve_agent 调用 owner 的 sign_agent，后者使用 user-signed EIP-712 | 保留现有 SDK 的签名方案，不手写或复用 L1 交易签名作为批准签名 |
| [Hyperliquid：签名调试](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing) | 建议使用 SDK，并对照官方 Python 实现检查签名差异 | 调试签名使用一次性测试材料；真实密钥、签名、fragment 不进入日志或报告 |
| [TanStack Start：Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) | HTTP 路由由 server.handlers 处理，可独立配置服务端 middleware | 强制校验放在 handler/store 边界，不能依赖页面 beforeLoad 或隐藏按钮 |
| [Vite：Env Variables and Modes](https://vite.dev/guide/env-and-mode) | `import.meta.env` 在构建时静态替换，`VITE_*` 是字符串配置 | 复用现有构建开关；不能假定部署后修改 Node 的 `process.env` 能改变已构建的 gate |
| [OWASP：恢复凭证](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) 与 [RFC 6749 §4.1.2](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1.2) | 对相应凭证要求安全随机、过期和单次使用/拒绝重复兑换 | 仅作为安全设计类比；本协议不因此自动成为 OAuth 或密码恢复协议 |

本地安装的 `@nktkas/hyperliquid@0.33.3` 中，`approveAgent` 调用 `executeUserSignedAction`；`extraAgents` 向 `info` 发送 owner 地址查询。前者与官方 Python SDK 交叉一致。`extraAgents` 的具体响应字段来自当前 SDK 类型和项目已有验证，不能冒充已由上述公开协议页面完整定义。

API 分类：批准/撤销属于 **Exchange**；授权状态复核属于 **Info**；本项目票据接口不是 Hyperliquid Exchange API。此修复不引入新的行情 Subscription。

### 官方终端实际调试

使用应用内浏览器完成公开 UI 检查。全程未签名、未发送交易、未生成或导出 Agent key，未修改用户的登录状态。观察记录不保存账户标识、余额或凭证。

| 场景 | 实际观察 | 可以得出的结论 |
| --- | --- | --- |
| 主网 `/trade`，现有 email 会话 | 账户菜单提供 MFA 和断开连接；本次观察未见桌面连接入口 | 不把某个登录方式下的 UI 套用到所有钱包会话 |
| 官方测试网 `/trade`，访客，390 × 844，仅改变视口 | Connect 显示 Email 和多种钱包选项，本次未显示 Link Desktop Wallet | 仅改视口不足以覆盖移动识别 |
| 同一测试网页面，390 × 844，Android Mobile UA + 触控模拟 | Connect 出现 Link Desktop Wallet、Email 和 WalletConnect | 需分别测试布局条件、移动 UA/触控条件 |
| 点击 Link Desktop Wallet | 出现 Scan QR Code 和从桌面生成二维码的提示 | 手机扫描入口与官方 onboarding 文档一致 |

这是 Chromium 的移动模拟，不是 iOS Safari 或 Android 真机验收。未完成摄像头授权、真实扫码、owner 批准、导入或官方服务重启测试，不能据此推断官方终端采用某种加密协议、单次消费算法或数据库。临时视口已恢复，调试标签页已关闭。

## 3. 本轮选定方案

采用“服务端签发新随机票据，禁止重新登记客户端 ID”。当前单 Node 进程继续使用有上限的内存 store；重启丢失票据后拒绝消费，符合现有部署约定。本轮不为该小范围修复新增数据库或 Redis。

选择理由：删除重新登记旧 ID 的入口，直接消除复现链条；保持服务端不接收 Agent 私钥、QR 密钥或钱包地址。匿名签发只创建短期配对票据，不赋予钱包交易权限，不需要为公共查询和遥测路由添加统一登录门禁。

### HTTP 与状态契约

保留 `POST /mobile-agent-sync-ticket`，升级到明确的票据 API v2：

```json
{ "version": 2, "operation": "issue" }
```

成功返回 HTTP 200：

```json
{ "version": 2, "syncId": "<server-generated-id>", "serverNowMs": 100000, "expiresAtMs": 160000 }
```

消费请求：

```json
{ "version": 2, "operation": "consume", "syncId": "<issued-id>", "consumerId": "<session-retry-id>" }
```

- `issue` 不接受 `syncId`、过期时间或其它额外字段；旧 `register` 请求返回 400。不存在兼容登记或自动迁移旧 ID 的后门。
- 服务端使用 CSPRNG 生成 16 字节随机 ID，编码为规范的 22 字符 base64url；碰撞时有限重试，失败关闭。随机 ID 不能由时间戳、owner、IP 或 consumerId 推导。
- store 按经过同源校验的请求 origin 与 ID 隔离；主网和测试网不能跨 origin 消费。这个隔离不替代现有 QR issuerOrigin/env 检查。
- 状态转换为 `issued → consumed(first consumer)`。以服务端签发时刻 `issuedAtMs` 为唯一票据计时起点：首次消费截止为 `issuedAtMs + 60_000`，记录保留截止为 `issuedAtMs + 660_000`；截止时刻本身已经失效，重试不续期。
- 660 秒沿用现有 10 分钟 envelope 生命周期加 1 分钟时钟容差的记录保留长度，不从首次消费或重试重新计算。envelope 仍有自己的期限；签发与加密时刻不同，客户端必须同时满足各项适用期限，不能把服务端可重试等同于 QR 仍有效。
- 检查与首次消费者写入必须原子完成。当前 Map 临界区不插入 await；未来异步 store 必须使用事务/CAS。
- 服务重启后，旧 ID 永远不会因为客户端请求而再次被创建。新 issue 只发放独立随机 ID。丢失的签发响应视为孤立票据，等 TTL 清理；用户重试发放新票据。
- 保留现有同源、Sec-Fetch-Site、严格 schema、256 字节请求限制、可信代理 IP、独立签发/消费限流、store 和 bucket 上限、no-store/no-referrer。
- 消费客户端只有收到 HTTP 204 才返回 accepted；200/202 等其它 2xx、重定向、网络错误均不得进入持久化/激活。issue 只接受 HTTP 200、JSON 和精确的响应 schema：version=2、规范 ID、非负安全整数时间戳、`0 < expiresAtMs - serverNowMs <= 60_000`，拒绝额外字段。

以下状态表假定请求已通过同源、schema、gate、可信 IP 和限流检查：

| 服务端状态 | A 请求 | B 请求 | 后续状态 |
| --- | --- | --- | --- |
| 未消费且未到首次截止时间 | 先到者返回 204 | 先到者返回 204 | 原子绑定唯一首次 consumerId；另一方随后为 409 |
| 已由 A 消费，记录仍在且未到保留截止时间 | 204，包括超过最初 60 秒后的重试 | 409 | 原期限不变 |
| 未消费但已到首次截止时间 | 410 | 410 | 不允许恢复为 issued |
| 未知 ID、记录已清理或进程重启丢失 | 410 | 410 | 无法通过 consume 恢复记录 |

旧 register 在通过前置来源/体积/内容类型检查后，由 schema 拒绝为 400，不受票据是否存在影响。未知记录不会因为曾经成功消费而得到特殊恢复待遇。存储失败或响应丢失后的同一消费者重试只在原记录还存在且客户端验证仍通过时有效；重启丢失则必须重新配对。

### 服务端关闭约束

handler 使用 [mobile-pairing.ts](../apps/terminal/src/config/mobile-pairing.ts) 的 `MOBILE_PAIRING_FEATURES`；不另写一套运行时环境变量解释逻辑。`issue` 需要 `createAndReveal`（CREATE 与 IMPORT 同时开启），`consume` 需要 `importFromQr`。完成输入校验后、访问票据 store 前检查 gate；关闭时返回 503、`Retry-After: 60` 和 no-store，不签发、不消费。旧 register 仍因无效 schema 返回 400。

构建测试必须覆盖默认全关、仅 CREATE、仅 IMPORT、两者全开，并运行构建产物验证 HTTP：全关构建不能被启动时设置 `VITE_*=true` 打开；全开构建也不能被解释成需要启动时再次设置这些变量。关闭操作需要重新构建和部署；既有 Agent 状态查看及用户主动撤销入口保持可用。

### 桌面与手机调用顺序

桌面：用户主动展示 QR → 复核匹配 owner、注册执行租约和远端 Agent → issue → 校验响应、剩余 TTL 和当前身份 → 使用服务端 ID 构建 AES-GCM envelope → 再校验页面可见性、身份和剩余 TTL → 展示 QR。

将 ID 作为必需输入传入 `createMobileAgentSyncUrl`，删除其生产代码中的本地 ID 自动生成回退。ID 已位于当前 GCM AAD 头部，保留认证绑定；修改它必须使原密文解密失败。票据 API 版本与 envelope 版本分别管理。

保留现有保守时钟算法：服务端返回的 TTL 扣除整个 RTT，再用 monotonic clock 计时；在完成加密和 QR 渲染后再次检查剩余窗口。页面隐藏/离开、owner/env/lease 变化或响应过晚时丢弃本次结果，不展示 QR。孤立票据自然过期，不引入未经授权的撤销接口。

手机：解析并清理 fragment → 检查 origin/env/envelope 期限 → 复核 `extraAgents` 中完整 Agent 信息 → 捕获并检查 registration epoch → 获取/确认 sessionStorage 中的 consumerId，建立回滚上下文 → v2 consume，严格要求 204 → 检查取消状态 → 按原 epoch 持久化 → 按原 epoch 激活 → 再次验证 epoch/Agent。失败维持关闭或执行现有回滚；禁止手机自动 issue 或补登记旧 ID。保留已有 epoch-aware API，不能在网络请求后重新捕获一个新 epoch 来接受过时结果。

创建票据、显示 QR、刷新和状态检查不签名，不重新批准 Agent，不批准 builder fee。保留 Privy 钱包目录、email owner 签名路径、Stay Connected 默认和存储范围。

免签重新展示仅适用于内存中仍存在、未过期、匹配 owner/env/lease 且远端验证通过的 approved-unrevealed 恢复记录。QR 成功显示后该记录按现有约定清除；不能承诺刷新或重启后总能免签重建 QR，也不能为恢复而延长私钥保留时间或新增持久化副本。需要重新建立 Agent 时，必须走用户主动操作和精确 owner 批准，并说明同名 Agent 替换影响；不静默复用已注销的 Agent 地址。

### 协议切换

本轮保留 envelope v2、现有 AAD/plaintext v2、draft v1 及其存储 key。服务端生成同样长度的 ID，再通过必需参数传入既有加密流程即可；没有必要仅为标记签发来源改变密码格式。票据 API 独立升级为 v2，也不要求将现有密文内部相关版本字段拆成多个独立版本。

T1–T3 同次部署并重启单 Node 实例，丢弃旧内存票据，禁止导入或重建旧记录。旧 QR/draft 可以通过现有格式解析，但其旧 ID 在新 store 中不存在，用户提交导入时返回 410；不得自动签发替代票据。安全性由新签发/消费契约和原有远端授权校验保证，不依赖 QR 版本号。

过期或格式错误的 draft 继续按现有规则清理；确认票据 409/410 后只清理本次导入的 draft 和内存解密材料，要求重新扫码。普通网络失败保留未过期 draft 和 consumerId 以允许条件成立时重试，不因协议发布批量清理已合法导入的 owner-scoped Agent，也不重新授权既有会话。

旧前端调用新服务端时会因旧 schema 返回 400，实际旧手机 UI 仍会显示“检查连接并重试”；服务端无法替换缓存 JS 的文案。发布说明明确要求双端完整刷新后重新配对。新客户端可对不兼容响应给出刷新提示，对 409/410 提示重新配对，不能对旧 bundle 承诺该体验。新客户端访问旧服务端也必须拒绝，不降级为 register。

## 4. 可执行任务与依赖

| 任务 | 修改范围 | 交付与验收 |
| --- | --- | --- |
| T1：补复现回归并替换服务端登记 | `one-time-ticket-server.ts`、`one-time-ticket-policy.ts`、route、对应 server 测试 | 固化重启→重登记复现；实现 issue、origin scope、原子 consume、gate；旧登记永不成功 |
| T2：客户端签发与 envelope 接线 | `one-time-ticket-client.ts`、`sync-core.ts`、`mobile-agent-sync-modal.tsx`、对应 client/core/modal 测试 | 必须先获得服务端 ID 再生成 QR；consume 仅接受 204，issue 严格解析；身份切换、隐藏、超时不会展示旧结果；展示不新增签名 |
| T3：手机导入与兼容失败处理 | `mobile-agent-sync.tsx`、必要的 draft 清理逻辑、相关测试与翻译 | 使用 v2 consume；保留 envelope v2/draft v1；保留 consume 前 capture epoch 及完整回滚；拒绝旧票据并给出准确恢复路径，既有 Agent 会话保持可用 |
| T4：真实 HTTP 与浏览器回归 | 票据 HTTP 集成测试、现有浏览器 fixture/Playwright 配置中必要的新增用例 | 并发、重试、重启后重登记完整链；四种 gate 的构建产物；异常 2xx 不激活；真实旧 bundle 的迁移体验 |
| T5：发布、说明和旧 PRD 对齐 | `deploy/README.md`、必要的部署 gate 验证、`docs/mobile-phone-access-scanner-prd.md`、`docs/trading-onboarding.md`、`docs/email-trading-signing.md`、真机验证文档 | 文档区分票据有效期与 Agent 授权期限；标明旧 PRD 配对码/手机 owner 登录内容已过时；记录关闭、切换和回滚流程 |

T1 先完成；T2、T3 依赖 T1 的契约；T4、T5 在客户端接线后验收。T1–T3 应作为同一次兼容性切换发布，不部署半套协议。任务按以上顺序实现，不意味着自动创建新的 Codex 任务。

## 5. 验收矩阵

| 分类 | 必须通过的行为 |
| --- | --- |
| 根因复现 | 合法同源的旧 register 在消费前后、TTL 后、重启后均为 400；完整链：A 消费成功但响应丢失/本地写入失败 → 真实进程重启 → A/B 消费旧 ID 均为 410 → register 旧 ID 为 400 → issue 新 ID 可用，旧 ID 仍为 410 |
| 生命周期 | 新签发可消费；未知 ID、首次消费过期和重启遗失 ID 拒绝；重启后新签发仍可正常使用 |
| 并发/重试 | A/B 同时消费只有一方成功；原进程与记录仍有效时胜者重试为 204，另一方为 409；过首次 60 秒但已消费的记录仍可幂等重试，到签发后 660 秒均为 410；客户端其它期限仍需通过 |
| 响应语义 | consume 的 200 HTML、200 JSON、202、重定向、503 和网络中断均不写入/激活 Agent，仅 204 通过；issue 非 200、字段缺失/多余、非规范 ID、无效时间均不生成 QR |
| 服务端开关 | 默认关闭和仅 CREATE 的构建均不 issue/consume；仅 IMPORT 可 consume、不可 issue；双开可按契约工作；运行时改 VITE 变量不能改变构建结果；关闭不妨碍既有 Agent 查看/主动撤销 |
| 服务故障 | RNG 失败/碰撞、store 满、无可信 IP、超限均失败关闭；重试不延长原期限 |
| Origin/输入 | mainnet/testnet 跨 origin 拒绝；缺失、跨源或不一致的浏览器来源元数据、额外字段、旧版本、非规范 ID、超大流拒绝；Origin 不作为身份证明，非浏览器客户端可以伪造该请求头 |
| 时钟与可见性 | RTT 较长、QR 渲染跨过期限、系统时钟前后跳、隐藏/恢复页面均不能展示超期结果；monotonic 倒计时不重置 |
| 身份与密码绑定 | owner/env/钱包/lease 改变时取消；capture epoch 失败时不调用 consume，consume 请求中 epoch 失效时不持久化/激活；篡改 ID、origin、env、密文不能通过；远端 Agent 不匹配时不能消费或激活 |
| 持久化 | consume 成功后写入失败/刷新可安全恢复或回滚；过期 draft 清理；既有 Agent 不被批量删除 |
| 协议兼容 | old client/new server 与 new client/old server 均拒绝；旧 QR/draft 格式仍可解析但无有效服务端记录不得激活；实际旧 bundle 的 400 文案保持原样，验证双端完整刷新后的新配对；无隐式重登记或旧版 fallback |
| 恢复边界 | 有效 approved-unrevealed 记录可经复核免签展示；成功显示后记录清除，刷新/过期后不宣称可恢复、不自动批准、不延长私钥存留；重新建立 Agent 必须由用户明确触发 |
| 签名回归 | 刷新/显示 QR/票据 issue/consume 没有签名；新 Agent 批准仍由精确 master；builder fee 和普通 email 交易保持原流程 |
| 移动与 i18n | 分别覆盖宽度、移动 UA、触控、standalone；语言切换不卸载面板、不丢输入/协议值；被动数据状态遵循现有移动规范 |
| 真实设备 | iOS Safari、Android Chrome、已安装 PWA：扫码、手动拒绝摄像头、后台恢复、刷新、过期、首次消费者重试 |

浏览器 fixture 必须使用独立 Vite cacheDir，且与应用 dev cache 互不嵌套，遵守 [runtime-guardrails.md](runtime-guardrails.md)。`HTTP 200`、modal 打开、mock 回调被调用都不能单独作为完成标准；核验最终状态和有无副作用。

原规划阶段的 ticket server、ticket client、sync core、feature gate 四个 Vitest 文件共 32 项通过。本次复审另外运行 mobile-agent-sync route/modal 两个文件，55 项通过，并完成第 1 节的真实 handler HTTP 子进程重启复现及实际 client 的响应注入检查。现有测试通过只确认当前基线；复现结果仍显示缺陷存在，不能记作修复通过。

尚未完成新契约的生产构建、Nitro/Caddy HTTP 集成和真机验收；它们属于实施任务。提交前已检查本文 13 个本地 Markdown 链接与下列 11 个测试文件路径，均存在。

实施验证命令按实际改动补齐：

```bash
pnpm exec biome check <changed-TypeScript-files>
pnpm --filter @gatu/terminal typecheck
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/mobile-sync-one-time-ticket-server.test.ts \
  src/lib/tests/mobile-sync-one-time-ticket-client.test.ts \
  src/lib/tests/mobile-sync-core.test.ts \
  src/lib/tests/mobile-agent-sync-modal.test.tsx \
  src/lib/tests/mobile-agent-sync-route.test.tsx \
  src/lib/tests/mobile-agent-remote-verification.test.ts \
  src/lib/tests/mobile-pairing-feature-gate.test.ts \
  src/lib/tests/mobile-sync-draft-storage.test.ts \
  src/lib/tests/mobile-sync-draft-expiry.test.ts \
  src/lib/tests/mobile-sync-bootstrap-fragment.test.ts \
  src/lib/tests/use-explicit-agent-approval.test.tsx
node --test deploy/validate-caddy-forwarded-headers.test.mjs
pnpm build
```

新增的真实 HTTP 重启测试和浏览器用例需在实施时给出可复用命令。fixture 使用一次性合成密钥，禁止复制用户生产凭证。测试网真实批准需要独立测试 owner 和 Agent，确认成功后用 Info 核验；不以真实主网下单来证明票据修复。摄像头、真实钱包和签名验收目前尚未执行，需按真机清单留证。

## 6. 发布与回滚

1. 在暂存环境完成单 Node 生产构建及真实 HTTP 重启测试；配对两个 gate 保持默认关闭，测试构建显式开启。
2. 对齐关闭配对 gate 的构建与运行实例，确认关闭不触发额外签名；已有交易会话保持原有可用性。
3. 一次部署新 handler 与 client，重启实例并确认旧内存票据清空，保留 envelope/draft 格式；验证两 origin 均为同一修复后的 release。发布提示要求旧页面双端完整刷新后重新配对，不能承诺旧 JS 自动显示升级提示。
4. 按已完成的浏览器/真机证据开启既有 gate；记录发行版本与验证结果，不能把“计划中的测试”标为已通过。
5. 回滚使用仍包含旧登记拒绝逻辑的安全构建，并关闭配对 gate。仅关闭旧构建的 UI 开关不能修复仍可调用的旧 register API；不得回滚为公开暴露旧登记入口的版本。

当前计划继续限定单常驻 Node。横向扩容、serverless 或多区域启用配对之前，必须另行交付所有实例共享的原子 TTL store 和全局失效策略；粘性会话不足以证明跨实例一次性。此条件同样适用于仓库现有的可选 Vercel 发布配置。

## 7. 独立后续任务：真正限制 QR 凭证复制

如果产品目标包括“QR 过期/被消费后，即使有人保存完整截图，也不能取得或继续使用 Agent 私钥”，需要新的配对协议。该目标不能由 T1–T5 宣称完成。

推荐先进行威胁模型与协议原型评审：手机本地生成自己的 Agent key，仅通过短期配对会话交换公钥；桌面验证目标会话与设备确认信息，并由精确 owner 批准该公钥。私钥始终留在手机，不装进桌面 QR。服务端只协调短期会话，仍不托管交易私钥。

必须解决抢先扫码、接收方公钥替换、中继篡改、用户确认所绑定的公钥/网络/会话、丢包恢复、取消/重启和同名 Agent 替换风险。不能直接把未经验证的手机公钥交给 owner 自动签名。若采用端到端加密中继，需选用成熟协议/库并独立评审，不自行拼装密码协议。

这个方向是工程设计建议，官方 onboarding 页面只证明交互步骤，并未证明其内部采用上述方案。正式实现前需验证双向会话设计、具体密码构件和测试网端到端结果。Agent 已泄露后的撤销仍需单独完成 owner 授权和远端状态确认；本轮票据修复不自动撤销或复用旧 Agent。

## 8. 完成判定

T1–T5 的代码、协议迁移、根因回归、真实 HTTP 重启、浏览器验证与发布说明齐备，才可称“票据重放缺口已修复”。完整 QR 泄露后的安全性继续按第 7 节单独评估。当前文档的提交只表示规划完成。
