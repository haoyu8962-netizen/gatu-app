# 部署:单台 EC2 + Caddy 双域名

gatu 是 TanStack Start + Nitro 的 **SSR 应用**,必须有常驻 Node 进程运行
`apps/terminal/.output/server/index.mjs`(`node-server` preset 产物,自包含)。
本目录提供一台 EC2 上的完整部署:

```
Internet → Caddy :443 (自动 Let's Encrypt TLS, app.gatu.ai + testnet.gatu.ai)
         → 反代 127.0.0.1:3000
         → systemd gatu.service → shared referral URI guard → node /opt/gatu/current/server/index.mjs
```

> 行情 WebSocket、订单签名都由浏览器直连 Hyperliquid,**不经过本机**。
> 服务端负责首屏 SSR、`getGeo`(IPdata 查询)、脱敏客户端错误接收，以及移动配对 QR 的
> 60 秒一次性消费登记。移动配对登记只保存随机 `syncId`、随机设备 ID 和过期时间，
> 不接收或保存 Agent 私钥、QR 密钥、钱包地址。

`app.gatu.ai` 和 `testnet.gatu.ai` 共用同一 Caddy 站点、Node upstream 和 immutable release。
部署脚本分别检查两个公网 origin，并比对 `/build-meta.json` 中的 commit/release。
`testnet.gatu.ai` 全站由 Caddy 下发 `X-Robots-Tag: noindex, nofollow`。两个 origin 的
`/join` 和 `/join/**` 在 Nitro 与 Caddy 双层设为 `Cache-Control: no-store`、
`Referrer-Policy: no-referrer` 和 `X-Robots-Tag: noindex, nofollow`。

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
尚未消费的 QR 安全失效，用户需要重新生成；不会降级为允许导入。若未来扩成多进程、多实例
或多区域，必须先把该登记迁移到所有实例共享、支持原子 compare-and-set 且带 TTL 的存储，
并在迁移验证完成前保持移动配对两个 gate 关闭，不能使用各实例独立内存。

`/mobile-agent-sync-ticket` 会先验证同源、体积和完整 schema，再按 Caddy 覆盖写入的客户端
IP 分别限制 register/consume。Nitro 只监听 loopback；不要把 3000 端口直接暴露公网，也不要
删除 `Caddyfile` 中覆盖 `X-Forwarded-For` / `X-Real-IP` 的配置。若前置 CloudFront 或其他
代理，必须重新建立受信代理链并验证应用拿到的是终端客户端 IP，而不是可由请求方伪造的头。

本目录文件:

| 文件 | 用途 |
|---|---|
| `gatu.service` | systemd 服务单元(进程守护 + 崩溃自启) |
| `Caddyfile` | Caddy 反代 + 自动 HTTPS + 缓存/安全头 |
| `env.build.example` | 构建期 `VITE_*` 变量(打进客户端 bundle) |
| `env.runtime.example` | 运行期变量(`PORT` / `IPDATA_API_KEY`) |
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
- **规格**:`t3.large`(8GB,因为**在机器上构建**要 8GB heap)。若改用「本地构建只传产物」(见末尾备选 B),可降到 `t3.small`。
- **磁盘**:30GB gp3。
- **安全组**:入站 `22`(限你的 IP)、`80`、`443`。
- 绑定 Elastic IP,并让上面的 DNS 指向它。

## 2. 安装运行环境

```bash
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

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
#   .env.local   → VITE_PRIVY_APP_ID；移动配对放量时再把对应 gate 设为精确的 "true"
#   .env.runtime → IPDATA_API_KEY（PORT/HOST 默认即可）
#                  GATU_MAINNET_PUBLIC_BASE_URL / GATU_TESTNET_PUBLIC_BASE_URL 保持为
#                  对应的两个 exact public origin；修改域名时同步修改 deploy/Caddyfile
sudo -u gatu nano /opt/gatu/shared/.env.local
sudo -u gatu nano /opt/gatu/shared/.env.runtime
```

## 6. 加 swap(构建 OOM 兜底)

8GB heap 在 8GB 物理内存上构建可能 OOM,加 4GB swap 兜底:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

> 若构建仍 OOM:升 `t3.xlarge`(16GB),或改用备选 B。

## 7. 安装 systemd 服务

```bash
sudo cp /opt/gatu/repo/deploy/gatu.service /etc/systemd/system/gatu.service
sudo systemctl daemon-reload
sudo systemctl enable gatu          # 开机自启（先不 start，等首次 deploy 创建 /opt/gatu/current）
```

## 8. 安装 Caddy 配置

```bash
sudo /usr/bin/caddy validate --config /opt/gatu/repo/deploy/Caddyfile --adapter caddyfile
sudo /usr/bin/install -m 0644 /opt/gatu/repo/deploy/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo systemctl reload caddy         # Caddy 自动签发 app.gatu.ai 与 testnet.gatu.ai 的证书
```

## 9. 首次部署

```bash
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main
```

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

建议先开启 import gate，再开启 create gate，并在测试环境跑完桌面批准、手机导入和撤销回归后
按环境放量。create-only 会保持关闭，避免同名 Agent 替换现有手机后却无法导入。关闭任一开关都
需要重新构建和部署；它不是无需部署即可切换的远端 kill switch。无论开关状态如何，撤销已有
Mobile Agent 和已有 Agent 的远端对账都保持可用。

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

Circle CCTP 新入金使用按钱包路径和环境拆分的四个独立门禁：

- `VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true`：仅在 Arbitrum Sepolia 筹资 E2E 已验证授权、烧毁事件、Circle attestation/forward 和 HyperCore 到账恢复后开启。
- `VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED=true`：仅在上述测试网验收通过，并完成小额主网实际到账与恢复演练后开启。
- `VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=true`：仅在邮箱 embedded EOA 精确账户签名、`CctpExtensionV2` 确定性 nonce、Privy Smart Wallet/Paymaster 提交、success/skipped 事件分类、刷新恢复和最终 HyperCore 到账均已通过 Arbitrum Sepolia 筹资 E2E 后开启。
- `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`：仅在 sponsored 测试网验收通过，并完成白名单邮箱钱包小额主网到账、重试及恢复演练后开启。

四个开关默认都关闭，不得因 `usdcRouting` 返回 `cctp` 就自动视为发布授权。它们是构建期门禁而不是无需部署的远程 kill switch：关闭任意路径后必须重建发布，已加载旧 bundle 的标签页不会立即失效。

新入金政策为 CCTP-only。即使 Hyperliquid `usdcRouting.depositRoute`
返回 `bridge`，也必须暂停新入金，不得重新打开 Bridge2；已广播的旧 Bridge2 交易仍需保留历史和恢复对账。下线旧通道时先禁止所有新的手动/自动 Bridge2 请求，再等待在途记录排空；不得删除历史查询，也不得一并禁用独立的 legacy withdrawal `withdraw3`。

推荐发布顺序：

1. 四个门禁全部关闭发布，确认 Bridge2 新签名/提交已 fail closed，旧记录仍可恢复。
2. 仅开启 sponsored testnet，执行已消费 nonce、余额不足、Paymaster 拒绝、RPC 超时、刷新恢复和最终到账用例。
3. 在新 release 中仅对内部白名单打开 sponsored mainnet，使用小额 USDC 验证。
4. 对账为零差异且无 skipped-as-success 后再扩大流量；回滚时仅停止新 CCTP 提交，继续追踪已提交交易，绝不回退 Bridge2。

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

# 回滚到已有 release（不会重新构建）
sudo -u gatu ls -1 /opt/gatu/releases
sudo -u gatu ln -sfn /opt/gatu/releases/<release-dir> /opt/gatu/current.tmp
sudo -u gatu mv -Tf /opt/gatu/current.tmp /opt/gatu/current
sudo systemctl restart gatu
```

> 更新时构建期间旧进程继续服务,旧 release 目录不会被覆盖。新 release 会携带上一版 hashed assets,
> 所以刚发布后旧客户端仍能拉到上一版动态 chunk。只有 `restart` 那几秒短暂中断。
> `deploy.sh` 的健康检查不仅访问 SSR HTML,还会拉取 HTML 实际引用的入口 JS、`trade-terminal-page-*.js`,
> 以及交易页动态引用的 `mobile-terminal-*.js`;任何一个 hashed asset 返回 HTML/500/非 JavaScript
> 都会失败并尝试回滚到上一个 release。它还会在 Node 直连、`GATU_MAINNET_PUBLIC_BASE_URL`
> 和 `GATU_TESTNET_PUBLIC_BASE_URL`
> 指向的 Caddy 最终入口核对 TradingView 入口、`sameorigin.html`、入口引用的初始 JS/CSS bundles、
> MIME、唯一的重验证 Cache-Control，以及缺失 bundle 必须返回非 HTML 的 404。最后读取
> `/build-meta.json`,确认线上 commit 与 release 就是刚发布的版本；自动回滚后也会精确
> 核对上一个 release，不会把仍在响应的失败新版本误报为回滚成功。所有健康检查 HTTP
> 请求都有连接和总时限，网络异常不会让部署无限挂起。

### 已有服务器从旧部署模式迁移

旧服务器第一次运行新版 `deploy.sh` 时，如果已安装 Caddy 配置与仓库不一致，
脚本会在构建前 fail closed。用管理员账号执行:

```bash
sudo /usr/bin/caddy validate --config /opt/gatu/repo/deploy/Caddyfile --adapter caddyfile
sudo /usr/bin/install -m 0644 /opt/gatu/repo/deploy/Caddyfile /etc/caddy/Caddyfile
sudo /usr/bin/systemctl reload caddy
```

然后重新运行 `deploy.sh`。脚本故意不自动覆盖/reload Caddy：仓库归 `gatu` 可写，为它授予
root install/reload 会让被入侵的应用用户获得修改公网代理的能力，也无法与应用 release 做可靠的原子回滚。

如果服务器之前的 `gatu.service` 仍使用 `/opt/gatu/repo/apps/terminal/.output`,再更新 systemd 单元:

```bash
sudo cp /opt/gatu/repo/deploy/gatu.service /etc/systemd/system/gatu.service
sudo systemctl daemon-reload
sudo -u gatu mkdir -p /opt/gatu/releases
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh test-pr102
```

`deploy.sh` 会在第一次重启前把 Referral URI guard 原子安装到
`/opt/gatu/shared/referral-uri-guard.cjs`。更新并 `daemon-reload` 该 unit 后，不要在首次新版部署前单独重启
`gatu`；共享 guard 使随后回滚到尚未携带 `/join` 路由的旧 release 也能正常启动。

`deploy.sh` 会拒绝继续运行旧 `WorkingDirectory`,避免再次原地覆盖运行中的 `.output`。

---

## 可选加固

### CloudFront(CDN,可选)
Caddy 已直接对外可用。若要全球加速/抗量,在 Caddy 前再挂一层 CloudFront:
两个 distribution 分别指向 `app.gatu.ai` 与 `testnet.gatu.ai`，转发原始 `Host` 头，仅对
`/assets/*` 走长缓存。`/join/**` 必须 bypass cache 并保留 no-store/no-referrer/noindex。
当前 Charting Library v28
在 iPad WebKit 热缓存下可能无法完成初始化,因此 `/charting_library/*` 和
`/tradingview-theme.css` 必须每次重新验证,其余 SSR 路径不缓存(或极短 TTL)。

### TradingView vendor 升级约束

当前修复不升级 Charting Library v28 vendor。以后升级 vendor 时，不能直接用新文件覆盖
`/charting_library/`。发布前必须先改为带版本的 `library_path`(例如 `/charting_library/v32/`)，
原子发布新版完整目录，并至少保留当前线上旧版的完整目录，直到旧标签页排空。
不能只保留 `charting_library.js` 或少量初始 bundles；运行中的图表会按功能继续懒加载同版本其他
hashed bundles。完成版本化、双目录保留和移动端热缓存回归前，不得上线 vendor 升级。

### CSP(应用层已启用)

CSP 由 `apps/terminal/src/config/security-headers.ts` 定义,并通过
`apps/terminal/vite.config.ts` 的 Nitro `routeRules` 下发。主文档使用
`frame-ancestors 'none'`,TradingView 同源资源使用允许 `frame-ancestors 'self'` 的独立策略。
Caddy 只补充 HSTS 等代理层响应头,不要再添加第二份 CSP;浏览器会同时执行多份 CSP,
未经协调的重复策略会让钱包、Turnstile、TradingView iframe 或 SSR 启动过程白屏。

当前 `script-src` 包含 `'unsafe-inline'`,用于兼容 TanStack Start SSR 注入的启动脚本;
这会放宽对内联脚本注入的防护,属于已知限制,不应描述成严格 CSP。移除前必须把每请求 nonce
贯穿 TanStack Router 的 `ssr.nonce`、`HeadContent`/`Scripts`、内联样式和第三方认证流程,
并先在生产同等环境使用 `Content-Security-Policy-Report-Only`、钱包登录、下单、充值、桥和
TradingView 回归测试验证。不要直接从当前策略删除 `'unsafe-inline'`。

核对生产响应:

```bash
curl -sSI https://app.gatu.ai/ | grep -i '^content-security-policy:'
curl -sSI https://app.gatu.ai/charting_library/charting_library.js | grep -i '^content-security-policy:'
```

### 备选 B:本地/CI 构建,只传产物(EC2 可降到 t3.small)
因为 `.output` 自包含,无需在 EC2 上构建:

```bash
release="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)"
# 本地（已设好 VITE_* 的 apps/terminal/.env.local）
GATU_BUILD_SHA="$(git rev-parse HEAD)" GATU_RELEASE_ID="$release" NITRO_PRESET=node-server pnpm build
ssh gatu@<host> "mkdir -p /opt/gatu/releases/${release}"
rsync -az --delete apps/terminal/.output/ "gatu@<host>:/opt/gatu/releases/${release}/"
ssh gatu@<host> "ln -sfn /opt/gatu/releases/${release} /opt/gatu/current.tmp && mv -Tf /opt/gatu/current.tmp /opt/gatu/current && sudo systemctl restart gatu"
```

此时 EC2 上不需要 Node 构建内存、不需要 pnpm install,只需 Node 运行 + Caddy。

---

## 上线 Checklist

- [ ] `.env.local`:`VITE_PRIVY_APP_ID` 已填(生产 mainnet,`VITE_HYPERLIQUID_TESTNET` 留空)
- [ ] 移动配对 rollout 已决策；若启用，两个 `VITE_MOBILE_PAIRING_*_ENABLED` 均为精确的 `true`
- [ ] 启用移动配对时仍为单 Node 进程；若已横向扩容，一次性 QR 登记已迁移到共享原子 TTL 存储
- [ ] PM 激活和 LI.FI 新 bridge 两个独立 rollout 已决策；未批准的 gate 保持为空
- [ ] 若关闭 LI.FI 新 bridge，已停止启用版本的流量、盘点在途 route，并验证同标签页刷新恢复和双端新入口隐藏
- [ ] `.env.runtime`:`IPDATA_API_KEY` 已填(并已**轮换**掉聊天里泄漏过的旧 key)
- [ ] Privy Dashboard:把 `https://app.gatu.ai` 与 `https://testnet.gatu.ai` 都加入 Allowed origins
- [ ] Builder 地址已充值 ≥100 USDC(否则 builder fee 下单会失败)
- [ ] DNS `app.gatu.ai`、`testnet.gatu.ai` → Elastic IP,两张 HTTPS 证书已签发
- [ ] `journalctl -u gatu` 无报错,两个域名及两个 `/join/gatuappweb3` 直达均返回 200
- [ ] 主域始终解析为 Mainnet、Testnet 域始终解析为 Testnet，旧 localStorage 无法覆盖
