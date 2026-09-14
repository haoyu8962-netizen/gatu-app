# 部署:单台 EC2 + Caddy 双域名

gatu 是 TanStack Start + Nitro 应用，仍由常驻 Node 进程运行
`apps/terminal/.output/server/index.mjs`(`node-server` preset 产物,自包含)，但**运行时不再服务端渲染**：
导航请求由 Node 进程直接返回构建期产物（应用路由返回预渲染的 `_shell.html`，文档路由返回各自的
`index.html`），Node 只执行 `/api/*` 与移动配对处理器。见 [ADR 0005](../docs/adr/0005-spa-static-shell.md)。
本目录提供一台 EC2 上的完整部署:

```
Internet → Caddy :443 (自动 Let's Encrypt TLS, app.gatu.ai + testnet.gatu.ai)
         → 反代 127.0.0.1:3000
         → systemd gatu.service → /opt/gatu/current referral URI guard → node server/index.mjs
                                   ├─ 导航：public/_shell.html 或 public/<文档路由>/index.html
                                   └─ /api/*、/mobile-agent-sync-ticket：服务端处理器
```

> 行情 WebSocket、订单签名都由浏览器直连 Hyperliquid,**不经过本机**。
> 服务端负责返回静态壳与文档页、`/api/geo` 与 `/api/referral-geo`(IPdata 查询)、
> `/api/client-error-report` 脱敏客户端错误接收，以及移动配对 QR 的
> 60 秒首次消费票据。移动配对 store 只保存 origin、服务端随机 `syncId`、随机消费者 ID 和过期时间，
> 不接收或保存 Agent 私钥、QR 密钥、钱包地址。

### 静态壳运行模式

- `_shell.html` 与文档页 HTML 在 `pnpm build` 的预渲染阶段生成一次；运行时由
  `apps/terminal/src/lib/static-pages/request-middleware.ts` 在路由器之前返回，Nitro 的 route rules
  仍为这些响应附加 CSP 等安全头。`/join/*` 返回的壳会带上 `<meta name="gatu-route" content="referral-join">`
  标记，供本目录的发布健康检查识别 referral 深链能力。
- 进程从 `GATU_PUBLIC_DIR`、当前目录下的 `public/`、`.output/public/` 依次查找 `_shell.html`；
  `WorkingDirectory=/opt/gatu/current` 下无需额外配置。找不到壳时导航返回 503（fail closed），
  只有显式设置 `GATU_RUNTIME_SSR=true` 才回退到服务端渲染。
- `/_serverFn/*` 已无调用方，运行时返回 404。旧的 `/client-error-report` 路径保留为 `POST` 别名，
  直到没有旧版本客户端仍在浏览器中打开后再删除。
- 目标部署形态是 CloudFront + S3 + Lambda 全静态，不再需要本机 EC2 与 Caddy；组件、官方终端托管实践的调试结论、执行步骤与日常发布命令见 [cloudfront/README.md](cloudfront/README.md)。本文其余部分描述现有 EC2 部署，在切换完成并观察一个发布周期前仍然有效。
- `deploy.sh` 第 8 步在 Node 探针中新增 `verify_geo_provider`：以 `X-Forwarded-For: 8.8.8.8` 请求
  `http://127.0.0.1:3000/api/geo`，要求返回 200 且 `country` 为 `US`。这一步用生产密钥证明
  `/api/geo` 已挂载、可信代理链解析出客户端 IP、IPdata 密钥可用；密钥缺失或提供方故障会导致发布回滚。
  回滚到旧版本时不执行该探针（旧版本没有 `/api/geo`）。

`app.gatu.ai` 和 `testnet.gatu.ai` 共用同一 Caddy 站点、Node upstream 和 immutable release。
部署脚本分别检查两个公网 origin，并比对 `/build-meta.json` 中的 commit/release。
`testnet.gatu.ai` 全站由 Caddy 下发 `X-Robots-Tag: noindex, nofollow`。两个 origin 的
`/join` 和 `/join/**` 在 Nitro 与 Caddy 双层设为 `Cache-Control: no-store`、
`Referrer-Policy: no-referrer` 和 `X-Robots-Tag: noindex, nofollow`。

`/trade`、`/perp`、`/spot`、`/builders-perp` 及其子路由的导航响应由 Caddy 按请求 Host 下发唯一的 Hyperliquid HTTP API
`Link: rel=preconnect`：主网只指向 `api.hyperliquid.xyz`，测试网只指向
`api.hyperliquid-testnet.xyz`。两个 origin 共用的应用 HTML 不得写死 API preconnect；法律、文档和
其他非交易路由也不得提前连接该 API。该提示旨在预热首次无凭证 `/info` 请求使用的 HTTP origin
连接；提示本身不发送 HTTP 请求或钱包数据，但会在 JavaScript 发起请求前向所选 Hyperliquid origin
暴露客户端 IP/TLS 握手。它不代表 WebSocket 已预热，也不得包含钱包地址、签名或业务请求体。
部署健康检查会同时验证正确网络和非交易路由隔离。

### Privy 与双 origin Agent 隔离

- Privy Dashboard 的 Allowed origins 必须同时精确包含 `https://app.gatu.ai` 和
  `https://testnet.gatu.ai`，不要使用泛域名代替。
- 两个域名是不同 browser origin，`localStorage` / `sessionStorage` / Privy 会话不共享。
  Agent 记录还按 `env + owner` 命名。不得在域名之间复制 Agent 私钥、存储项或钱包会话；
  每个 origin 都要独立完成精确 owner/environment 校验。
- 共用 Node upstream 不会合并浏览器 Agent 状态，Caddy 也不会改写 Hyperliquid 网络。
  开放流量前必须分别确认 `app.gatu.ai` 使用 Mainnet、`testnet.gatu.ai` 使用 Testnet；
  host/environment 不一致时必须 fail closed，不得继续 Agent 注册或资金操作。

移动配对的一次性消费依赖当前拓扑中的**单个常驻 Node 进程**完成原子判定。进程重启会让
所有旧 QR 票据安全失效，用户需要重新生成；不会降级为允许导入。若未来扩成多进程、多实例
或多区域，必须先把该票据协调迁移到所有实例共享、支持原子 compare-and-set 且带 TTL 的存储，
并在迁移验证完成前保持移动配对两个 gate 关闭，不能使用各实例独立内存。

`/mobile-agent-sync-ticket` 会先验证同源、体积和完整 schema，再按 Caddy 覆盖写入的客户端
IP 分别限制 register/consume。Nitro 只监听 loopback；不要把 3000 端口直接暴露公网，也不要
删除 `Caddyfile` 中覆盖 `X-Forwarded-For` / `X-Real-IP` 的单条 set 配置，也不得为同名头
同时添加 `header_up -...`：Caddy 会聚合头操作并在 set 之后执行 delete。若前置 CloudFront 或其他
代理，必须重新建立受信代理链并验证应用拿到的是终端客户端 IP，而不是可由请求方伪造的头。

本目录文件:

| 文件 | 用途 |
|---|---|
| `gatu.service` | systemd 服务单元(进程守护 + 崩溃自启) |
| `Caddyfile` | Caddy 反代 + 自动 HTTPS + 缓存/安全头 |
| `validate-caddy-forwarded-headers.mjs` | 拒绝客户端 IP 转发头的 set/delete 冲突、追加或重复配置 |
| `env.build.example` | 构建期 `VITE_*` 变量(打进客户端 bundle) |
| `env.runtime.example` | 运行期变量(`PORT` / `IPDATA_API_KEY`) |
| `validate-production-env.mjs` | 生产共享环境、CCTP rollout 与 canonical origin 构建前门禁 |
| `deploy.sh` | 更新/构建/重启/健康检查一条龙 |

---

## ⚠️ 两类环境变量(最容易踩坑)

- **构建期** `VITE_*`:被 Vite **打进客户端 bundle**(公开)。在 build 的机器上就要设好,改值要**重新 build**。放 `/opt/gatu/shared/.env.local`。
- **运行期** `IPDATA_API_KEY` / `PORT` / `HOST` / `GATU_*_PUBLIC_BASE_URL`:node 进程和部署健康检查读取。
  放 `/opt/gatu/shared/.env.runtime`,由 systemd 注入；两个 public base URL 不是密钥。

---

## 0. 前置

- DNS:`app.gatu.ai` 和 `testnet.gatu.ai` 的 A 记录（使用 IPv6 时还包括 AAAA）
  均指向同一 EC2 公网地址。
- 一个 GitHub **只读 Deploy Key**(仓库私有,见第 4 步)。

## 1. 开 EC2

- **AMI**:Ubuntu 24.04 LTS。
- **规格**:`t3.large`(8GB,因为**在机器上构建**要 8GB heap)。
- **磁盘**:30GB gp3。
- **安全组**:入站 `22`(限你的 IP)、`80`、`443`。
- 绑定 Elastic IP,并让上面的 DNS 指向它。

## 2. 安装运行环境

```bash
# Node 22.15+ LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git zstd
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 15)) process.exit(1)'

# pnpm（锁精确版本，匹配 packageManager 与 lockfile）
sudo corepack enable
sudo corepack prepare pnpm@10.21.0 --activate
pnpm --version # should print 10.21.0

# Caddy（官方 apt 源）
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

## 3. 建服务用户 + 目录

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin gatu
sudo mkdir -p /opt/gatu/repo /opt/gatu/shared /opt/gatu/releases
sudo chown -R gatu:gatu /opt/gatu

# 只允许 deploy.sh 重启/查看应用服务。Caddy 配置由管理员手工验证和安装；
# 不要让可写仓库文件获得持久的 root install/reload 权限。
echo 'gatu ALL=(root) NOPASSWD: /usr/bin/systemctl restart gatu, /usr/bin/systemctl status gatu --no-pager' | sudo tee /etc/sudoers.d/gatu
sudo chmod 440 /etc/sudoers.d/gatu
sudo visudo -cf /etc/sudoers.d/gatu
```

## 4. 拉取私有仓库(Deploy Key)

```bash
sudo -u gatu ssh-keygen -t ed25519 -N "" -f /opt/gatu/shared/deploy_key -C "gatu-ec2-deploy"
sudo -u gatu cat /opt/gatu/shared/deploy_key.pub
# → 把这段公钥加到 GitHub 仓库 Settings → Deploy keys（只读，不勾 write）

# 让 git 用这把 key
sudo -u gatu tee /opt/gatu/shared/ssh_config >/dev/null <<'EOF'
Host github.com
  IdentityFile /opt/gatu/shared/deploy_key
  IdentitiesOnly yes
EOF

sudo -u gatu git -c core.sshCommand="ssh -F /opt/gatu/shared/ssh_config" \
  clone git@github.com:zora4523-bot/gatu-app.git /opt/gatu/repo
sudo -u gatu git -C /opt/gatu/repo config core.sshCommand "ssh -F /opt/gatu/shared/ssh_config"
```

## 5. 配置环境变量

```bash
sudo -u gatu cp /opt/gatu/repo/deploy/env.build.example   /opt/gatu/shared/.env.local
sudo -u gatu cp /opt/gatu/repo/deploy/env.runtime.example /opt/gatu/shared/.env.runtime
sudo chmod 600 /opt/gatu/shared/.env.local /opt/gatu/shared/.env.runtime
# 编辑这两个文件填入真实值：
#   .env.local   → VITE_PRIVY_APP_ID；保留 VITE_HYPERLIQUID_AGENT_NAME=gatu；
#                  主网 External CCTP 固定开启；Sponsored、测试网和移动配对
#                  仅在启用时把对应 gate 设为精确的 "true"
#   .env.runtime → IPDATA_API_KEY（HOST=127.0.0.1；PORT 缺省或 3000）
#                  GATU_MAINNET_PUBLIC_BASE_URL / GATU_TESTNET_PUBLIC_BASE_URL 保持为
#                  对应的两个 exact public origin；修改域名时同步修改 deploy/Caddyfile
sudo -u gatu nano /opt/gatu/shared/.env.local
sudo -u gatu nano /opt/gatu/shared/.env.runtime
```

主网 External CCTP 是固定能力，不再由构建变量关闭。生产 CCTP 只支持两种显式发布模式；
`GATU_CCTP_MAINNET_RELEASE_MODE` 必须与 Sponsored 主网构建开关严格一致：

| 发布模式 | External | Sponsored gate |
|---|---:|---:|
| `external-only` | 固定开启 | 留空 |
| `both` | 固定开启 | `true` |

External 会对所有符合条件的外部钱包用户开放直接 CCTP 路径。Sponsored 是全量构建开关，不是白名单
或分组开关；`both` 会同时对符合条件的邮箱钱包用户开放 Sponsored 路径。两条路径仍必须在弹窗内
显式确认金额与 Circle 费用后才会签名和广播。

开启 Sponsored 路径前建议完成以下生产验收：

1. ZeroDev 的 Arbitrum One 策略关闭 `Sponsor all transactions`。
2. Contract Policy 只允许 Circle 主网 `CctpExtensionV2`
   `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB` 的 `batchSponsorDepositForBurn`，selector 为
   `0x300fb2a3`。
3. 按生产容量设置请求次数、单笔 Gas、累计 Gas 和 Gas Price 限额，并配置监控和预警；不得直接照搬测试网限额。
4. 在不对普通用户开放的受控 production-candidate 环境中，使用同一 commit 和将要发布的
   `both` bundle 完成一次小额主网 E2E，核对 source receipt、唯一 success event、
   Circle forward、HyperCore 到账、刷新恢复与零重复提交。若无法隔离流量，不得把全量开关宣称为
   “白名单 canary”；应先增加真正的运行时白名单或流量隔离。

外部钱包路径也建议先完成 Arbitrum Sepolia 筹资 E2E，再使用将要发布的同一 commit 和 bundle
完成小额主网真实到账与恢复演练。这些真实资金 E2E 是上线验收建议；部署验证器只能校验模式与开关的一致性，
不会也不能从代码中证明某次链上验收已完成。

当前主机若要同时开放外部钱包和邮箱 Smart Wallet，在共享配置中使用 `both`：

```dotenv
# /opt/gatu/shared/.env.local
VITE_HYPERLIQUID_TESTNET=
VITE_HYPERLIQUID_AGENT_NAME=gatu
VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true

# /opt/gatu/shared/.env.runtime
GATU_MAINNET_PUBLIC_BASE_URL=https://app.gatu.ai
GATU_TESTNET_PUBLIC_BASE_URL=https://testnet.gatu.ai
GATU_CCTP_MAINNET_RELEASE_MODE=both
```

旧主机可以继续保留 `VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED=true`；它只作为兼容确认值，应用不再
读取它，也不能用空值或 `false` 关闭主网 External。新配置不再声明该变量。
`env.build.example` 仍把 Sponsored、测试网和其他资金 gate 保持为空，不得把 `true` 提交为模板默认值。
`VITE_HYPERLIQUID_AGENT_NAME=gatu` 是生产浏览器 Agent 的固定 named slot；本地开发默认使用
`gatu-dev`。任何连接主网的预览或预发布 bundle 必须配置独立且不超过 16 字符的名称，不能复用
`gatu`，否则 Hyperliquid 会注销同名生产 Agent。
`GATU_CCTP_MAINNET_RELEASE_MODE` 是部署确认值，不会进入客户端 bundle：`deploy.sh` 在安装依赖或构建前
核对它与 Sponsored 主网 gate。任何重复变量、引号/注释造成的含糊布尔值、模式与开关组合不匹配，
或非 canonical public origin 都会 fail-fast。Sponsored 可通过清空其 gate 并切换为 `external-only` 停止。
主网 External 没有环境变量停用入口；异常时仍由 fresh CCTP route、地区、owner signer、Circle fee/allowance、
余额、receipt 与恢复守卫 fail closed。如需产品级紧急停用，必须发布经过审查的代码变更，同时继续对账在途记录，
且不得回退 Bridge2。

`deploy.sh` 会在构建前清除调用 shell 里继承的所有 `VITE_*`，防止它们以高于 dotenv 的优先级覆盖
`/opt/gatu/shared/.env.local`。它还会拒绝 `apps/terminal/.env`、`.env.production` 或
`.env.production.local` 这些可以覆盖共享文件的额外 Vite 配置。因此共享文件是生产 bundle 的唯一 `VITE_*` 来源。

两个公网 origin 共用一个 bundle，因此不能把 `VITE_HYPERLIQUID_TESTNET=true` 写入生产共享文件。浏览器运行时会把
`app.gatu.ai` 固定到 Mainnet、`testnet.gatu.ai` 固定到 Testnet，并忽略这两个 canonical hostname 上的
localStorage 选网值。CCTP 再根据已绑定的运行时网络只读取对应 mainnet/testnet gate；主网发布模式不会
代替或改写 testnet origin 独立的 gate。部署验证器还会拒绝非精确两个 canonical origin 的 runtime 配置。

## 6. 加 swap(构建 OOM 兜底)

8GB heap 在 8GB 物理内存上构建可能 OOM,加 4GB swap 兜底:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

> 若构建仍 OOM:升 `t3.xlarge`(16GB)。不要绕过 canonical `deploy.sh main` 手工发布产物。

## 7. 安装 systemd 服务

```bash
sudo install -m 0644 /opt/gatu/repo/deploy/gatu.service /etc/systemd/system/gatu.service
sudo systemctl daemon-reload
sudo systemctl show gatu.service --property=NeedDaemonReload --property=WorkingDirectory --property=ExecStart
sudo systemctl enable gatu          # 开机自启（先不 start，等首次 deploy 创建 /opt/gatu/current）
```

## 8. 安装 Caddy 配置

```bash
sudo -u gatu /usr/bin/node /opt/gatu/repo/deploy/validate-caddy-forwarded-headers.mjs /opt/gatu/repo/deploy/Caddyfile /usr/bin/caddy
sudo /usr/bin/caddy validate --config /opt/gatu/repo/deploy/Caddyfile --adapter caddyfile
sudo /usr/bin/install -m 0644 /opt/gatu/repo/deploy/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo systemctl reload caddy         # Caddy 自动签发 app.gatu.ai 与 testnet.gatu.ai 的证书
```

## 9. 首次部署

```bash
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main
```

生产脚本只接受省略参数或显式 `main`；其他分支会在 fetch/reset 前以退出码 64 拒绝。同步后若仓库仍有
任何 nonignored untracked 文件，脚本只报告并 fail closed，不会自动删除文件。

脚本会:同步代码 → 验证仓库与已安装 `Caddyfile` 完全一致 → 注入 `.env.local` → `pnpm install` → 构建 → 复制 `.output` 到
`/opt/gatu/releases/<timestamp>-<commit>` → 合并上一版 `public/assets` 中的 hashed chunks →
原子切换 `/opt/gatu/current` → `systemctl restart gatu` → Node 直连和 Caddy 公网入口双重健康检查。
末行打印两个公网 origin、同一 commit/release 与本机 Node 健康检查均通过后才算成功。

构建时脚本会注入完整 Git commit 和 release ID。产物根目录的 `/build-meta.json` 会公开
`version`、`commit`、`release`、`builtAt`;健康检查会核对它们与本次部署完全一致,避免服务
实际仍在运行旧 release 却被误判为成功。

> 重要:不要让 systemd 直接从 `/opt/gatu/repo/apps/terminal/.output` 运行。该目录会在构建时被覆盖,
> 旧 Node 进程内存中的 SSR manifest 可能继续引用旧 hash,而磁盘静态资源已变成新 hash,从而导致
> `Failed to fetch dynamically imported module: /assets/mobile-terminal-*.js`。`/opt/gatu/current`
> release symlink 是为了避免这种 server manifest / assets 不一致。
>
> 另外,`/assets/*` 是 content-hashed + immutable 长缓存。用户可能在新版本发布后仍持有上一版
> `trade-terminal-page-*.js`,再切到移动端时才请求上一版 `mobile-terminal-*.js`。因此 deploy
> 会把上一版 hashed assets 带入新版 release,让旧客户端懒加载不会 404/HTML fallback。

## 10. 验证

```bash
curl -I https://app.gatu.ai          # 期望 200，且证书有效
curl -I https://testnet.gatu.ai      # 期望 200，且全站 noindex
curl -I https://app.gatu.ai/join/gatuappweb3
curl -I https://testnet.gatu.ai/join/gatuappweb3
curl -fsS https://app.gatu.ai/build-meta.json # 期望 commit/release 与部署日志一致
asset="$(curl -fsS https://app.gatu.ai/builders-perp | grep -o '/assets/[^"]*\.js' | head -1)"
curl -I "https://app.gatu.ai${asset}" # 期望 200 且 content-type 为 JavaScript
curl -sSI https://app.gatu.ai/charting_library/charting_library.js | grep -iE '^(HTTP/|cache-control:|content-type:)'
# 期望只有一个 Cache-Control: public, max-age=0, must-revalidate，MIME 为 JavaScript
curl -sS -o /dev/null -w '%{http_code}\n' https://app.gatu.ai/charting_library/bundles/__missing__.js
# 期望 404，不能是 200 HTML/SSR fallback
sudo systemctl status gatu --no-pager
```

浏览器打开 `https://app.gatu.ai`:能连钱包(Privy)、看行情、下单表单可见。

客户端运行时错误只会 POST 到同源 `/client-error-report`；应用层仅接受 4 KiB 以内的固定枚举/栈位置
摘要，不接收原始 message、完整 URL、查询参数、钱包地址或密钥。Node 进程内的 60 次/分钟限流只是
单实例兜底，不是分布式防护。生产入口必须另外为该路径配置 CDN/WAF 的分布式请求频率与请求体大小限制，
并禁止边缘层记录请求 body；多实例发布不能依赖进程内计数器。

移动配对的两个构建期开关默认关闭:

- `VITE_MOBILE_PAIRING_CREATE_ENABLED=true`:允许桌面创建、批准并揭示 QR，但仅在 import gate 也开启时生效。
- `VITE_MOBILE_PAIRING_IMPORT_ENABLED=true`:允许手机扫码并导入。

生产 validator 允许缺失、空值、`false`、`true`，拒绝大小写/引号歧义及 CREATE=true、IMPORT 未开的发布配置。
两 origin 共用编译开关，不能按主网/测试网分别启用。常规部署支持直接双开；可按下文选择独立 HTTPS 暂存和真机验收流程。
仅 import 不恢复旧进程票据，也不作为跨版本兼容桥梁。修改开关必须重新构建；撤销已有 Mobile Agent 和远端对账保持可用。

### 移动配对 v2 发布与自动入口保护

保留 `/opt/gatu/shared/.env.local` 中两个配对开关为 `true`，常规发布使用同一条命令：

```bash
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main
```

不再要求先部署关闭配对的版本，也不要求常规发布提供外部真机证明。脚本仍校验环境、精确 main SHA、候选身份、配置摘要、产物文件与 SHA-256，并在发布前启动实际 Nitro 产物验证 API v2、拒绝旧 register、同源隔离、消费重试、并发及真实进程重启。正常发布记录 `publicationMode=deploy`、`evidenceSha256=null`；自动化通过不代表真机验收通过。

首次使用新流程时，先按第 7 节安装仓库的 `gatu.service`，再按第 8 节 validate、安装并 reload 仓库的 Caddyfile。系统安装文件仍必须与仓库完全一致。

Caddy 不再永久封锁票据，而是检查 `/opt/gatu/mobile-sync-edge-ready`。该文件不存在时，票据路径及大小写、编码、重复/尾斜杠、反斜杠变体返回 503、no-store、no-referrer 和 Retry-After: 60。文件仅由部署脚本管理，不放在公开资源目录，不要手工创建。`/opt/gatu` 必须允许 Caddy 遍历（通常为 0755），文件由脚本以 0644 原子写入；不要放宽 shared 环境文件的权限。Caddy 文件匹配行为见[官方说明](https://caddyserver.com/docs/caddyfile/matchers#file)。

发布时：

1. 构建并校验最终候选，生产旧进程继续运行。
2. 切换 current 前删除 readiness 文件，实际验证两个 HTTPS origin 的票据路径均封锁。
3. 原子切换已验证产物，重启 gatu，检查应用健康及两个 origin 的版本一致性。
4. 对正在运行的新进程执行两个 origin 的 Node 票据探针；通过后自动创建 readiness 文件，开放 Caddy 入口。
5. 验证两个公网 origin 的实际票据协议。失败立即删除 readiness 文件并进入回滚；成功固定已验证 v2 回滚版本。

这避免了 current 已切换、新进程尚未启动期间把票据请求送给旧进程。无需在开启配对后再次手动修改或 reload Caddy。已开放时，`@ambiguous_path` 仍拒绝字面反斜杠和 `%5c` 路径并返回 400；转发 IP 的覆盖规则保持不变。`.env.runtime` 的 `HOST` 必须为 `127.0.0.1`，Node 端口仍固定为 3000，不能绕过 Caddy 对外暴露。

`/opt/gatu/shared/mobile-sync-safe-release` 固定最近一次健康检查通过的 v2 release，可为开启或关闭配对的版本；清理保留该目录。自动和人工回滚均先关闭并验证 edge，再切换版本。已验证的 v2 回滚版本通过 Node 探针后自动重开入口；首次升级若只能恢复 legacy，则保持票据封锁。不要为旧产物手写 manifest，不要绕过脚本直接切换 symlink。

部署中断可能使配对入口保持关闭；重新运行部署可恢复。回滚或重启会清空进程内票据，尚未导入的二维码需要重新生成。普通钱包/邮箱登录、已激活 Agent 及撤销管理不由 readiness 文件控制。

### 可选的同产物真机验收发布

需要上线前审核设备结果时，继续使用严格的两阶段流程：

```bash
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main prepare
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main promote <candidate-id>
```

`prepare` 构建一次并完成实际 HTTP/重启验收，保存 `/opt/gatu/shared/mobile-sync-candidates/<id>/artifact` 与 `candidate.json`；不切换 current、不重启生产、不更改入口 readiness。将同一 artifact 复制到隔离 HTTPS 暂存主机，使用 Privy 允许的域名和隔离 Testnet owner；不要重新编译或更改 gate、guard、元信息。桌面与手机使用同一 origin，核对实际网络并遵守既有签名、法律和地区限制。

审核真实 11 行记录后，将[证据模板](../docs/mobile-phone-access-device-validation.md)填入外部 `/opt/gatu/shared/mobile-sync-evidence/<id>.md`，通过受控部署权限安装为普通只读文件（如 root:gatu、0440，目录 0750）。完整 SHA、release、产物与配置摘要、API 和编译 gate 必须来自 candidate.json。不得把模拟结果填写为真机 Pass。

`promote` 不安装依赖、不重建；任一配对开关开启时仍严格验证全部外部设备记录，并记录 `publicationMode=promote` 和证据摘要。它与常规部署共享入口开关、最终产物协议校验、原子切换及回滚逻辑。两种模式的发布记录不可互换。代码、配置、guard 或候选内容改变时，必须重新准备候选和验收。

记录保存在 `shared/mobile-sync-publications/<id>.json`，不是上线成功证明。中断后可重试相同 promote 命令；已有记录必须与当前授权全部字段一致，不覆盖记录或已发布产物。候选清理独立保留 current、基线及未发布候选。SHA-256 证明产物一致性，不证明设备测试实际发生。

当前发布规则与验证范围见[生产发布说明](../docs/mobile-sync-production-readiness.md)。

其余两个高风险能力也使用彼此独立、默认关闭的构建期开关:

- `VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED=true`:允许从非 PM 模式新激活 Portfolio Margin。关闭时已有
  PM 用户仍可使用当前模式或切回其他模式。
- `VITE_LIFI_BRIDGE_CREATE_ENABLED=true`:允许通过 LI.FI 创建新的跨链 route。关闭时标准 Hyperliquid
  出金 `withdraw3` 和已广播 Bridge2/LI.FI 记录的追踪不受影响；新 Bridge2 入金已由
  CCTP-only 政策独立停用，该开关不得重新打开。对于已经提交跨链交易的 LI.FI route，客户端会把
  `updateRouteHook` 返回的 latest route 去除签名、typed data、transaction request 和 calldata 后，
  临时保存在当前标签页的 `sessionStorage`。即使 LI.FI SDK 在广播后把 source process 标为 `FAILED`，
  只要仍有合法 `txHash` 或 `taskId`，客户端也会保留恢复记录；恢复时先把该标识规范成只追踪既有交易
  的输入，不会把原始 `FAILED` process 直接交给重试路径，也不会在关闭新 route 的 gate 后重新签名或
  发送源链交易。用户必须显式点击 Resume tracking 才开始对账；没有广播标识的 route 在 gate 关闭后
  不提供 Retry。同一标签页刷新或加载新部署后，只有连接精确相同的钱包，且 source chain、返回的 wallet
  client chain、route/step ID、tool、源 token/金额、HyperCore 目标链、目标地址和 USDC 目标资产均与
  已批准 route 的 fingerprint 一致时才允许追踪。关闭标签页或浏览器后 `sessionStorage` 不再存在，因此
  不承诺本地恢复，也不要把它当作长期交易历史；应使用链上浏览器/LI.FI Explorer 继续核对。如果提交后
  浏览器无法写入恢复记录，执行页会明确要求保持当前标签页打开并移除 Close 操作，直到当前追踪完成。
这些变量只接受精确的 `true`，关闭任意能力都需要重新构建和部署。不要把它们当作远端实时 kill switch。
已经加载旧构建的浏览器标签页不会被构建期开关立即关闭。关闭 LI.FI 新 route 时，应先停止对启用版本的
流量并留出在途 route 排空窗口，再发布关闭版本；发布后用同一标签页刷新验证 committed route 的恢复入口，
并确认新标签页、桌面账户入口和移动账户入口均不再显示新 Bridge 入口。

Circle CCTP 新入金把主网 External 作为固定能力，并保留三个按钱包路径和环境拆分的独立门禁：

- `VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true`：仅在 Arbitrum Sepolia 筹资 E2E 已验证授权、烧毁事件、Circle attestation/forward 和 HyperCore 到账恢复后开启。
- 主网 External 无构建开关，始终使用 Circle 官方 `CctpExtension.batchDepositForBurnWithAuth` 直接路径；小额主网实际到账与恢复演练仍是运维验收建议，不是功能门禁。
- `VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=true`：仅在邮箱 embedded EOA 精确账户签名、`CctpExtensionV2` 确定性 nonce、Privy Smart Wallet/Paymaster 提交、success/skipped 事件分类、刷新恢复和最终 HyperCore 到账均已通过 Arbitrum Sepolia 筹资 E2E 后开启。
- `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`：仅在 sponsored 测试网验收通过、ZeroDev 主网策略按上述合约/方法收紧并设好生产容量限额，且受控 production-candidate 小额主网到账、重试及恢复演练完成后开启。

其余三个开关的源码默认值都是关闭，不得因 `usdcRouting` 返回 `cctp` 就自动视为 Sponsored 或测试网发布授权。
它们是构建期全量门禁，不是用户白名单或无需部署的远程 kill switch：关闭任意受控路径后必须重建发布，
已加载旧 bundle 的标签页不会立即失效。主网 External 仍要求 fresh `usdcRouting=cctp`，但该响应是执行安全守卫，
不是可选的发布授权。

新入金政策为 CCTP-only。即使 Hyperliquid `usdcRouting.depositRoute`
返回 `bridge`，也必须暂停新入金，不得重新打开 Bridge2；已广播的旧 Bridge2 交易仍需保留历史和恢复对账。下线旧通道时先禁止所有新的手动/自动 Bridge2 请求，再等待在途记录排空；不得删除历史查询，也不得一并禁用独立的 legacy withdrawal `withdraw3`。

推荐发布顺序（这是运维验收建议，不是部署验证器的隐式链上证明）：

1. 发布主网 External 基线，确认非 CCTP route 与 Bridge2 新签名/提交均 fail closed，旧记录仍可恢复。
2. 分别开启 External testnet 和 Sponsored testnet 做筹资 E2E；Sponsored 额外覆盖已消费 nonce、余额不足、
   Paymaster 拒绝、RPC 超时、刷新恢复和最终到账用例。
3. 对计划开放的每条路径，在受控、非公开的 production-candidate 环境中使用小额 USDC 完成主网 E2E；
   Sponsored 还应先收紧 ZeroDev 主网 Contract Policy 并设定生产容量限额。当前代码没有内部白名单，
   不得把全量开关当作白名单 canary。
4. 根据是否开放 Sponsored 选择 `external-only` 或 `both`。模式必须与 Sponsored 主网 gate 严格对应；
   回滚时停止相应的新 CCTP 提交，继续追踪已提交交易，绝不回退 Bridge2。

---

## 日常运维

```bash
# 更新上线（拉最新 main、重建、发布新 release、重启）
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main

# 实时日志 / 最近日志
journalctl -u gatu -f
journalctl -u gatu -n 100 --no-pager

# 重启 / 停止
sudo systemctl restart gatu
sudo systemctl stop gatu

# 人工回滚：以 gatu 用户执行；选择已固定的双关 v2 基线
cd /opt/gatu/repo
exec 9>/opt/gatu/shared/deploy.lock
flock -n 9 || exit 1
source deploy/deploy.sh
verify_caddy_config
rollback_to_release "$(readlink -f /opt/gatu/shared/mobile-sync-safe-release)"
health_check 3000 "$rollback_expected_commit" "$rollback_expected_release"
edge_health_check https://app.gatu.ai "$rollback_expected_commit" "$rollback_expected_release"
edge_health_check https://testnet.gatu.ai "$rollback_expected_commit" "$rollback_expected_release" true
verify_mobile_sync_rollback_health "$previous_release" 3000
```

> 更新时构建期间旧进程继续服务,旧 release 目录不会被覆盖。新 release 会携带上一版 hashed assets,
> 所以刚发布后旧客户端仍能拉到上一版动态 chunk。只有 `restart` 那几秒短暂中断。
> `deploy.sh` 先等待 SSR HTML 就绪,然后拉取 HTML 实际引用的入口 JS。交易终端是组件级懒加载,
> 因此检查会从当前 HTML 的 module script/modulepreload 出发,有界遍历真实 ESM import 图,
> 并验证首个可达层中唯一的当前代 `trade-terminal-page-*.js`。它不会扫描 release 目录中为旧标签页保留的历史 hash;
> fresh build 的 bundle budget 门禁负责禁止产物内出现多份同名页面 chunk。任何检查过程中读取的 hashed asset
> 返回 HTML/500/非 JavaScript,或图越界、首个可达层解析出多代交易 chunk,
> 都会失败并尝试按配对协议下限回滚。它还会在 Node 直连、`GATU_MAINNET_PUBLIC_BASE_URL`
> 和 `GATU_TESTNET_PUBLIC_BASE_URL`
> 指向的 Caddy 最终入口核对 TradingView 入口、`sameorigin.html`、入口引用的初始 JS/CSS bundles、
> MIME、唯一的重验证 Cache-Control，以及缺失 bundle 必须返回非 HTML 的 404。最后读取
> `/build-meta.json`,确认线上 commit 与 release 就是刚发布的版本；自动回滚后也会精确
> 核对所选安全 release，不会把仍在响应的失败新版本误报为回滚成功。所有健康检查 HTTP
> 请求都有连接和总时限，网络异常不会让部署无限挂起。
> 对畸形 Referral URI 的检查分两层：Node 直连必须由应用 guard 返回带安全响应头的 404；
> 公网 Caddy 入口固定使用 HTTP/1.1，并必须在进入路由前返回 400。HTTP/2 协议中止、DNS/TLS
> 错误或其他没有有效 HTTP 状态码的传输失败都不会被当成“已安全拒绝”。

`deploy.sh` 会在 fetch/reset 之前非阻塞获取 `/opt/gatu/shared/deploy.lock`，并让同步后的
canonical 部署进程继承同一锁描述符。即使外层调用 shell 被终止，仍在运行的构建子树
也不会提前释放锁。并发部署会以退出码 75 快速失败，不会同时写 `.output` 或切换
`current`。同步到远端的精确 commit 后，脚本总会通过 `exec` 重新载入仓库中的 canonical
`deploy.sh`，避免当前 Bash 进程继续执行 reset 前的旧函数。

### 已有服务器从旧部署模式迁移

只在本部署变更已经合并且目标 commit 可从 `origin/main` 获取后执行迁移；共享生产主机不得长期部署 PR 分支。
从尚未包含上述互斥/re-exec 逻辑的旧 `deploy.sh` 迁移时，旧 Bash 进程无法在
`git reset` 后自动学会新逻辑。先暂停 CI、cron 和其他手工部署触发器，确认没有部署进程后，
仅首次用 `gatu` 用户显式同步并从新文件启动；在最后一条命令完成前不要恢复其他触发器：

```bash
sudo -u gatu git -C /opt/gatu/repo fetch --prune origin
sudo -u gatu git -C /opt/gatu/repo reset --hard origin/main
sudo -u gatu /bin/bash -n /opt/gatu/repo/deploy/deploy.sh
sudo -u gatu /bin/bash /opt/gatu/repo/deploy/deploy.sh main
```

之后只需执行最后一条部署命令；脚本会自行加锁、精确同步并重新载入新版本。

旧服务器第一次运行新版 `deploy.sh` 时，如果已安装 Caddy 配置与仓库不一致，
脚本会在构建前 fail closed。用管理员账号执行:

```bash
sudo -u gatu /usr/bin/node /opt/gatu/repo/deploy/validate-caddy-forwarded-headers.mjs /opt/gatu/repo/deploy/Caddyfile /usr/bin/caddy
sudo /usr/bin/caddy validate --config /opt/gatu/repo/deploy/Caddyfile --adapter caddyfile
sudo /usr/bin/install -m 0644 /opt/gatu/repo/deploy/Caddyfile /etc/caddy/Caddyfile
sudo /usr/bin/systemctl reload caddy
```

然后重新运行 `deploy.sh`。脚本故意不自动覆盖/reload Caddy：仓库归 `gatu` 可写，为它授予
root install/reload 会让被入侵的应用用户获得修改公网代理的能力，也无法与应用 release 做可靠的原子回滚。

如果同时看到 `WARN ... Unnecessary header_up X-Forwarded-For` 和
`ERROR: installed Caddyfile does not match ...`，真正的阻断是已安装文件与仓库文件的逐字节比较失败，
不是这个警告。保留仓库中覆盖客户端 IP 的配置，不要为了消除警告而删除它或跳过校验。
该检查位于第 2 步，尚未进入构建与 release 切换。上面的 validate、install、reload 必须依次成功，
然后执行 `sudo -u gatu /bin/bash /opt/gatu/repo/deploy/deploy.sh main` 重试；出现新的错误时按新的检查处理，
不能把安装配置完成当作应用部署完成。

如果服务器之前的 `gatu.service` 仍使用 `/opt/gatu/repo/apps/terminal/.output`,再更新 systemd 单元:

```bash
sudo install -m 0644 /opt/gatu/repo/deploy/gatu.service /etc/systemd/system/gatu.service
sudo systemctl daemon-reload
sudo systemctl show gatu.service --property=NeedDaemonReload --property=WorkingDirectory --property=ExecStart
sudo -u gatu mkdir -p /opt/gatu/releases
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main
```

canonical release 在原子切换 `current` 前写入 commit/release identity、内容精确为 `referral-join-v1\n` 的
capability 文件和 `referral-uri-guard.cjs`。systemd 从当前 release 相对加载 guard，所以发布和回滚会一起切换
server 与 guard。只要出现任一 identity/capability marker，缺失或畸形 capability、缺失 guard 都会使启动 fail closed。
三个 marker 全部缺失的旧 release 才走不 preload guard 的一次性 legacy rollback 兼容路径；canonical 新 release
不能通过省略 capability 绕过 guard。更新并 `daemon-reload` unit 后，不要在首次新版部署前单独重启 `gatu`。

`deploy.sh` 同时比较已安装 unit，并读取 systemd 已加载的 `FragmentPath`、`DropInPaths`、
`NeedDaemonReload`、`WorkingDirectory` 和 `ExecStart`。旧工作目录、未 reload、drop-in 或 shared guard
ExecStart 都会在构建前 fail closed，避免再次原地覆盖运行中的 `.output`。

---

## 可选加固

### CloudFront(CDN,可选)
Caddy 已直接对外可用。若要全球加速/抗量,在 Caddy 前再挂一层 CloudFront:
两个 distribution 分别指向 `app.gatu.ai` 与 `testnet.gatu.ai`，转发原始 `Host` 头，仅对
`/assets/*` 走长缓存。`/join/**` 必须 bypass cache 并保留 no-store/no-referrer/noindex。
当前 Charting Library v28
在 iPad WebKit 热缓存下可能无法完成初始化，这一条在 Caddy 时代的处理是让 `/charting_library/*` 与
`/tradingview-theme.css` 每次重新验证。CloudFront 目标改为：文件名带内容哈希的 `bundles/*` 与按
`?v=<commit>` 版本化的入口 `charting_library.js` immutable，`sameorigin.html` 与主题样式仍每次重新验证，
`sync` 从不删除旧版文件（[ADR 0006](../docs/adr/0006-startup-preloads-and-edge-caching.md)）。该警告没有留下可复现
的证据记录，因此 DNS 切换前仍要在 iPad WebKit 上做一次热缓存图表初始化回归；若复现，把入口与
bundle 改回重新验证只需改 `deploy/cloudfront/deploy.mjs` 的 `objectCacheControl` 并执行 `reupload`。

### TradingView vendor 升级约束

当前修复不升级 Charting Library v28 vendor。以后升级 vendor 时，不能直接用新文件覆盖
`/charting_library/`。发布前必须先改为带版本的 `library_path`(例如 `/charting_library/v32/`)，
原子发布新版完整目录，并至少保留当前线上旧版的完整目录，直到旧标签页排空。
不能只保留 `charting_library.js` 或少量初始 bundles；运行中的图表会按功能继续懒加载同版本其他
hashed bundles。完成版本化、双目录保留和移动端热缓存回归前，不得上线 vendor 升级。

### CSP(应用层已启用)

CSP 由 `apps/terminal/src/config/security-headers.ts` 定义,并通过
`apps/terminal/vite.config.ts` 的 Nitro `routeRules` 下发。CloudFront 目标由 viewer-response 函数下发同一策略，
并把更严的候选策略作为 `Content-Security-Policy-Report-Only` 送到独立的报告接收器（[ADR 0007](../docs/adr/0007-csp-report-only-hardening.md)）；候选策略的 `script-src` 已不含 `'unsafe-inline'`，改为预渲染页内联脚本的哈希，由发布流程在边缘填入（[内联脚本哈希计划](../docs/csp-inline-script-hashes-plan.md)），Nitro 目标不参与。主文档使用
`frame-ancestors 'none'`,TradingView 同源资源使用允许 `frame-ancestors 'self'` 的独立策略。
Caddy 只补充 HSTS 等代理层响应头,不要再添加第二份 CSP;浏览器会同时执行多份 CSP,
未经协调的重复策略会让钱包、Turnstile、TradingView iframe 或 SSR 启动过程白屏。

Nitro 目标的 `script-src` 仍包含 `'unsafe-inline'`，用于兼容 TanStack Start 注入的启动脚本；
这会放宽对内联脚本注入的防护，属于已知限制，不应描述成严格 CSP，EC2 退役时随 `routeRules` 一并消失。
CloudFront 目标自 2026-09-14 起改为按预渲染页内联脚本的哈希强制（`edge-config.json` 的
`cspScriptHashes: enforce`，撤回改为 `report-only` 即可），每次发布必须先发布函数再上传 HTML，
并跑 `apps/terminal/tests/browser/csp-coverage.mjs`。不要直接从 Nitro 策略删除 `'unsafe-inline'`。

核对生产响应:

```bash
curl -sSI https://app.gatu.ai/ | grep -i '^content-security-policy:'
curl -sSI https://app.gatu.ai/charting_library/charting_library.js | grep -i '^content-security-policy:'
```

### 产物上传部署尚未支持生产

不要把任意本地/CI checkout 的 `.output` 直接 rsync 后切换 `current`。该路径会绕过 main provenance、
release identity/capability、上一版 hashed assets、TradingView manifest、systemd/Caddy preflight、双 origin
健康检查和自动回滚。只有未来提供并验证等价的签名产物发布器后，才能把它作为生产入口；当前正常生产发布
唯一入口是合并后的 `main` 配合 `deploy.sh main`。

---

## 上线 Checklist

- [ ] `.env.local`:`VITE_PRIVY_APP_ID` 已填，`VITE_HYPERLIQUID_AGENT_NAME=gatu`，生产 mainnet 的 `VITE_HYPERLIQUID_TESTNET` 留空
- [ ] 主网 External CCTP 固定开启；已在 `external-only`、`both` 中选择是否开放 Sponsored，且 Sponsored gate 与 `.env.runtime` 的 `GATU_CCTP_MAINNET_RELEASE_MODE` 严格对应
- [ ] 若开启 Sponsored，ZeroDev Arbitrum One 已关闭 Sponsor All，Contract Policy 只允许 `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB` / `batchSponsorDepositForBurn` (`0x300fb2a3`)，并已设定经过容量评估的 Request、单笔/累计 Gas 与 Gas Price 限额、监控和预警
- [ ] 建议对每条已开启的 CCTP 路径完成受控 production-candidate 小额主网 E2E；这是真实资金上线验收，不是部署验证器的隐式禁用条件
- [ ] `node deploy/validate-production-env.mjs /opt/gatu/shared/.env.local /opt/gatu/shared/.env.runtime apps/terminal` 通过
- [ ] 关闭 v2 基线、独立入口封锁和 manifest 已验证；启用前完成同 commit 的 11 行真机证据及 Linux/HTTPS 准入
- [ ] 启用移动配对时仍为单 Node 进程；若已横向扩容，一次性 QR 票据已迁移到共享原子 TTL 存储
- [ ] PM 激活和 LI.FI 新 bridge 两个独立 rollout 已决策；未批准的 gate 保持为空
- [ ] 若关闭 LI.FI 新 bridge，已停止启用版本的流量、盘点在途 route，并验证同标签页刷新恢复和双端新入口隐藏
- [ ] `.env.runtime`:`IPDATA_API_KEY` 已填(并已**轮换**掉聊天里泄漏过的旧 key)
- [ ] Privy Dashboard:把 `https://app.gatu.ai` 与 `https://testnet.gatu.ai` 都加入 Allowed origins
- [ ] Builder 地址已充值 ≥100 USDC(否则 builder fee 下单会失败)
- [ ] DNS `app.gatu.ai`、`testnet.gatu.ai` → Elastic IP,两张 HTTPS 证书已签发
- [ ] `journalctl -u gatu` 无报错,两个域名及两个 `/join/gatuappweb3` 直达均返回 200
- [ ] 主域始终解析为 Mainnet、Testnet 域始终解析为 Testnet，旧 localStorage 无法覆盖
