# 部署:单台 EC2 + Caddy

gatu 是 TanStack Start + Nitro 的 **SSR 应用**,必须有常驻 Node 进程运行
`apps/terminal/.output/server/index.mjs`(`node-server` preset 产物,自包含)。
本目录提供一台 EC2 上的完整部署:

```
Internet → Caddy :443 (自动 Let's Encrypt TLS, app.gatu.ai)
         → 反代 127.0.0.1:3000
         → systemd gatu.service → node /opt/gatu/current/server/index.mjs
```

> 行情 WebSocket、订单签名都由浏览器直连 Hyperliquid,**不经过本机**。
> 服务端只做首屏 SSR 渲染 + `getGeo`(IPdata 查询),负载很轻。

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
- **运行期** `IPDATA_API_KEY` / `PORT` / `HOST`:node 进程 `process.env` 读取,服务端私有。放 `/opt/gatu/shared/.env.runtime`,由 systemd 注入。

---

## 0. 前置

- DNS:`app.gatu.ai` 的 A 记录指向 EC2 的 Elastic IP。
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

# 允许 gatu 免密重启/查看自己的服务（deploy.sh 需要）
echo 'gatu ALL=(root) NOPASSWD: /usr/bin/systemctl restart gatu, /usr/bin/systemctl status gatu' | sudo tee /etc/sudoers.d/gatu
sudo chmod 440 /etc/sudoers.d/gatu
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
#   .env.local   → VITE_PRIVY_APP_ID（其余可留空）
#   .env.runtime → IPDATA_API_KEY（PORT/HOST 默认即可）
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
sudo cp /opt/gatu/repo/deploy/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo systemctl reload caddy         # Caddy 自动签发 app.gatu.ai 的证书
```

## 9. 首次部署

```bash
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main
```

脚本会:同步代码 → 注入 `.env.local` → `pnpm install` → 构建 → 复制 `.output` 到
`/opt/gatu/releases/<timestamp>-<commit>` → 合并上一版 `public/assets` 中的 hashed chunks →
原子切换 `/opt/gatu/current` → `systemctl restart gatu` → 健康检查。
末行打印 `OK — gatu serving on 127.0.0.1:3000 (commit …)` 即成功。

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
curl -fsS https://app.gatu.ai/build-meta.json # 期望 commit/release 与部署日志一致
asset="$(curl -fsS https://app.gatu.ai/builders-perp | grep -o '/assets/[^"]*\.js' | head -1)"
curl -I "https://app.gatu.ai${asset}" # 期望 200 且 content-type 为 JavaScript
sudo systemctl status gatu --no-pager
```

浏览器打开 `https://app.gatu.ai`:能连钱包(Privy)、看行情、下单表单可见。

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
> 都会失败并尝试回滚到上一个 release。它还会读取 `/build-meta.json`,确认线上 commit 与 release
> 就是刚发布的版本。

### 已有服务器从旧部署模式迁移

如果服务器之前的 `gatu.service` 仍使用 `/opt/gatu/repo/apps/terminal/.output`,先更新 systemd 单元:

```bash
sudo cp /opt/gatu/repo/deploy/gatu.service /etc/systemd/system/gatu.service
sudo systemctl daemon-reload
sudo -u gatu mkdir -p /opt/gatu/releases
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh test-pr102
```

`deploy.sh` 会拒绝继续运行旧 `WorkingDirectory`,避免再次原地覆盖运行中的 `.output`。

---

## 可选加固

### CloudFront(CDN,可选)
Caddy 已直接对外可用。若要全球加速/抗量,在 Caddy 前再挂一层 CloudFront:
源站指向 `app.gatu.ai`,转发 `Host` 头,仅对 `/assets/*` 走长缓存。当前 Charting Library v28
在 iPad WebKit 热缓存下可能无法完成初始化,因此 `/charting_library/*` 和
`/tradingview-theme.css` 必须每次重新验证,其余 SSR 路径不缓存(或极短 TTL)。

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
- [ ] `.env.runtime`:`IPDATA_API_KEY` 已填(并已**轮换**掉聊天里泄漏过的旧 key)
- [ ] Privy Dashboard:把 `app.gatu.ai` 加入 Allowed origins
- [ ] Builder 地址已充值 ≥100 USDC(否则 builder fee 下单会失败)
- [ ] DNS `app.gatu.ai` → Elastic IP,HTTPS 证书已签发
- [ ] `journalctl -u gatu` 无报错,`curl -I https://app.gatu.ai` 返回 200
