# 移动配对票据修复计划

状态：待实施。本文只记录方案、调研依据和验收任务，不表示修复已经完成。

调研日期：2026-09-10。计划基于本地 `e922a82c`；最初审计基于 `0c27aa14`。实施前重新检查相关文件和并发工作区改动。

## 1. 修复目标与边界

本轮交付目标：旧 `syncId` 在消费、过期或服务进程重启后，不能通过重新登记恢复可消费状态；同一有效票据只允许首次成功绑定的消费者继续幂等重试。

当前问题是票据生命周期缺陷。`one-time-ticket-server.ts` 接受客户端指定的 ID，登记与消费状态仅在进程内 `Map` 中。此前两个独立的真实 handler 调试脚本均得到：

```text
登记 200 → 消费者 A 消费 204 → 消费者 B 消费 409
替换 store 模拟重启 → B 消费 410 → 重新登记原 ID 200 → B 消费 204
```

[部署约定](../deploy/README.md)要求进程重启使旧 QR 安全失效。[现有测试](../apps/terminal/src/lib/tests/mobile-sync-one-time-ticket-server.test.ts)只覆盖向空 store 直接消费，未覆盖重新登记后的组合路径。

本轮不声称解决完整 QR 被复制后的 Agent 私钥泄露。当前 [sync-core.ts](../apps/terminal/src/lib/mobile-sync/sync-core.ts) 把 Agent 私钥放在密文中，同时把解密密钥放进同一 URL fragment；持有完整 QR 的人可以离线恢复私钥，甚至重新封装一个新 QR。更换票据存储或 ID 签发方不能消除这个事实。

`consumerId` 是客户端会话中的随机重试凭证，不是硬件设备证明。验收应使用“首次消费者”，避免承诺不可复制的设备绑定。P2 是本项目的工程优先级建议，不是外部规范给出的漏洞等级。

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
- 状态转换为 `issued → consumed(first consumer)`；未知或首次消费已过期返回 410，另一消费者返回 409，同一消费者在现有重试保留期内返回 204。
- 首次消费窗口仍为 60 秒。保留现有 10 分钟 envelope 生命周期及 1 分钟时钟容差对应的重试/失效记录保留期；幂等重试不能延长任何期限。
- 检查与首次消费者写入必须原子完成。当前 Map 临界区不插入 await；未来异步 store 必须使用事务/CAS。
- 服务重启后，旧 ID 永远不会因为客户端请求而再次被创建。新 issue 只发放独立随机 ID。丢失的签发响应视为孤立票据，等 TTL 清理；用户重试发放新票据。
- 保留现有同源、Sec-Fetch-Site、严格 schema、256 字节请求限制、可信代理 IP、独立签发/消费限流、store 和 bucket 上限、no-store/no-referrer。
- `issue` 遵守现有 createAndReveal gate，`consume` 遵守 importFromQr gate；服务端和客户端使用同一构建配置语义，不新增默认开启路径。关停时失败关闭，不仅隐藏 UI。

### 桌面与手机调用顺序

桌面：用户主动展示 QR → 复核匹配 owner、注册执行租约和远端 Agent → issue → 校验响应、剩余 TTL 和当前身份 → 使用服务端 ID 构建 AES-GCM envelope → 再校验页面可见性、身份和剩余 TTL → 展示 QR。

将 ID 作为必需输入传入 `createMobileAgentSyncUrl`，删除其生产代码中的本地 ID 自动生成回退。ID 已位于当前 GCM AAD 头部，保留认证绑定；修改它必须使原密文解密失败。票据 API 版本与 envelope 版本分别管理。

保留现有保守时钟算法：服务端返回的 TTL 扣除整个 RTT，再用 monotonic clock 计时；在完成加密和 QR 渲染后再次检查剩余窗口。页面隐藏/离开、owner/env/lease 变化或响应过晚时丢弃本次结果，不展示 QR。孤立票据自然过期，不引入未经授权的撤销接口。

手机：解析并清理 fragment → 检查 origin/env/envelope 期限 → 复核 `extraAgents` 中完整 Agent 信息 → v2 consume → 原有 epoch 校验、持久化与激活。失败维持关闭或执行现有回滚；禁止手机自动 issue 或补登记旧 ID。

创建票据、显示 QR、刷新和状态检查不签名，不重新批准 Agent，不批准 builder fee。保留 Privy 钱包目录、email owner 签名路径、Stay Connected 默认和存储范围。

### 协议切换

推荐同时把 QR envelope 升到 v3、import draft 升到 v2，明确区分由新签发流程创建的二维码。继续使用已验证的 AES-GCM 与同样的随机 ID 字节长度，不自行设计新密码算法。

新客户端拒绝旧 v2 QR，并只清理旧配对 draft；已经合法导入的 owner-scoped Agent 存储不应被清理或重新授权。旧前端调用旧 register/consume schema 时失败关闭，提示刷新/重新生成，不降级兼容。新票据 API 的安全性不能依赖 envelope 版本号，handler 必须单独拒绝旧登记入口。

## 4. 可执行任务与依赖

| 任务 | 修改范围 | 交付与验收 |
| --- | --- | --- |
| T1：补复现回归并替换服务端登记 | `one-time-ticket-server.ts`、`one-time-ticket-policy.ts`、route、对应 server 测试 | 固化重启→重登记复现；实现 issue、origin scope、原子 consume、gate；旧登记永不成功 |
| T2：客户端签发与 envelope 接线 | `one-time-ticket-client.ts`、`sync-core.ts`、`mobile-agent-sync-modal.tsx`、对应 client/core/modal 测试 | 必须先获得服务端 ID 再生成 QR；身份切换、页面隐藏、超时不会展示旧结果；展示不新增签名 |
| T3：手机导入与版本迁移 | `mobile-agent-sync.tsx`、`draft-storage.ts`、QR 分类/清理模块及相关测试 | 使用 v2 consume；v3 envelope/v2 draft；旧凭证 fail closed，既有有效 Agent 会话保持可用 |
| T4：真实 HTTP 与浏览器回归 | 票据 HTTP 集成测试、现有浏览器 fixture/Playwright 配置中必要的新增用例 | 两个 HTTP 客户端并发消费只有一方成功；真实子进程重启后旧票据拒绝；生产构建响应正确 |
| T5：发布、说明和旧 PRD 对齐 | `deploy/README.md`、必要的部署 gate 验证、`docs/mobile-phone-access-scanner-prd.md`、`docs/trading-onboarding.md`、`docs/email-trading-signing.md`、真机验证文档 | 文档区分票据有效期与 Agent 授权期限；标明旧 PRD 配对码/手机 owner 登录内容已过时；记录关闭、切换和回滚流程 |

T1 先完成；T2、T3 依赖 T1 的契约；T4、T5 在客户端接线后验收。T1–T3 应作为同一次兼容性切换发布，不部署半套协议。任务按以上顺序实现，不意味着自动创建新的 Codex 任务。

## 5. 验收矩阵

| 分类 | 必须通过的行为 |
| --- | --- |
| 根因复现 | 原旧 register 请求在消费前后、TTL 后、进程重启后均为 400；不能复活同一 ID |
| 生命周期 | 新签发可消费；未知 ID、首次消费过期和重启遗失 ID 拒绝；重启后新签发仍可正常使用 |
| 并发/重试 | A/B 同时消费只有一方成功；胜者响应丢失后用同一 consumerId 重试可恢复；败者、换 consumerId 继续被拒绝 |
| 服务故障 | RNG 失败/碰撞、store 满、无可信 IP、超限均失败关闭；重试不延长原期限 |
| Origin/输入 | mainnet/testnet 跨 origin 拒绝；缺失、跨源或不一致的浏览器来源元数据、额外字段、旧版本、非规范 ID、超大流拒绝；Origin 不作为身份证明，非浏览器客户端可以伪造该请求头 |
| 时钟与可见性 | RTT 较长、QR 渲染跨过期限、系统时钟前后跳、隐藏/恢复页面均不能展示超期结果；monotonic 倒计时不重置 |
| 身份与密码绑定 | owner/env/钱包/lease 改变时取消；篡改 ID、origin、env、密文不能通过；票据成功但远端 Agent 不匹配也不能激活 |
| 持久化 | consume 成功后写入失败/刷新可安全恢复或回滚；过期 draft 清理；既有 Agent 不被批量删除 |
| 协议兼容 | old client/new server、new client/old server、旧 QR 和旧 draft 均失败关闭；无隐式重登记或旧版 fallback |
| 签名回归 | 刷新/显示 QR/票据 issue/consume 没有签名；新 Agent 批准仍由精确 master；builder fee 和普通 email 交易保持原流程 |
| 移动与 i18n | 分别覆盖宽度、移动 UA、触控、standalone；语言切换不卸载面板、不丢输入/协议值；被动数据状态遵循现有移动规范 |
| 真实设备 | iOS Safari、Android Chrome、已安装 PWA：扫码、手动拒绝摄像头、后台恢复、刷新、过期、首次消费者重试 |

浏览器 fixture 必须使用独立 Vite cacheDir，且与应用 dev cache 互不嵌套，遵守 [runtime-guardrails.md](runtime-guardrails.md)。`HTTP 200`、modal 打开、mock 回调被调用都不能单独作为完成标准；核验最终状态和有无副作用。

规划阶段已重跑现有 ticket server、ticket client、sync core 和 feature gate 四个 Vitest 文件，32 项测试全部通过。它们不包含上述重启后重新登记的组合回归，因此这一结果只确认现有基线，不代表缺陷已修复。本文的本地 Markdown 链接和下列测试文件路径也已检查存在。

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
3. 一次部署新 handler、client、envelope 和 draft 版本；验证两 origin 均为同一修复后的 release。旧页面刷新后才能发起新配对。
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
