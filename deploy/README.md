# 部署:单台 EC2 + Caddy

gatu 是 TanStack Start + Nitro 的 **SSR 应用**,必须有常驻 Node 进程运行
`apps/terminal/.output/server/index.mjs`(`node-server` preset 产物,自包含)。
本目录提供一台 EC2 上的完整部署:

```
Internet → Caddy :443 (自动 Let's Encrypt TLS, app.gatu.ai)
         → 反代 127.0.0.1:3000
         → systemd gatu.service → node .output/server/index.mjs
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

# pnpm（锁大版本，匹配 lockfile）
sudo npm i -g pnpm@10

# Caddy（官方 apt 源）
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

## 3. 建服务用户 + 目录

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin gatu
sudo mkdir -p /opt/gatu/repo /opt/gatu/shared
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
sudo systemctl enable gatu          # 开机自启（先不 start，等首次构建出 .output）
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

脚本会:同步代码 → 注入 `.env.local` → `pnpm install` → 构建 → `systemctl restart gatu` → 健康检查。
末行打印 `OK — gatu serving on 127.0.0.1:3000 (commit …)` 即成功。

## 10. 验证

```bash
curl -I https://app.gatu.ai          # 期望 200，且证书有效
sudo systemctl status gatu --no-pager
```

浏览器打开 `https://app.gatu.ai`:能连钱包(Privy)、看行情、下单表单可见。

---

## 日常运维

```bash
# 更新上线（拉最新 main、重建、重启）
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh main

# 实时日志 / 最近日志
journalctl -u gatu -f
journalctl -u gatu -n 100 --no-pager

# 重启 / 停止
sudo systemctl restart gatu
sudo systemctl stop gatu

# 回滚到上一个提交
sudo -u gatu git -C /opt/gatu/repo reset --hard <good-commit>
sudo -u gatu bash /opt/gatu/repo/deploy/deploy.sh
```

> 更新时构建期间旧进程继续服务,只有 `restart` 那几秒短暂中断。

---

## 可选加固

### CloudFront(CDN,可选)
Caddy 已直接对外可用。若要全球加速/抗量,在 Caddy 前再挂一层 CloudFront:
源站指向 `app.gatu.ai`,转发 `Host` 头,对 `/assets/*`、`/charting_library/*` 走长缓存,其余 SSR 路径不缓存(或极短 TTL)。

### CSP(默认未开)
这是 web3 + Privy + WalletConnect + TradingView + Hyperliquid WebSocket 的混合页面,
CSP 极易配错导致白屏。建议**上线稳定后**在 `Caddyfile` 的 `header` 块里**逐步**加,
先用 `Content-Security-Policy-Report-Only` 观察违规,再切正式。涉及放行:Privy/WalletConnect 域、
`wss://api.hyperliquid.xyz`、`https://app.hyperliquid.xyz`(图标/charting)、内联脚本(SSR 注入了
启动脚本,需 `nonce` 或 hash)。不要直接抄通用模板。

### 备选 B:本地/CI 构建,只传产物(EC2 可降到 t3.small)
因为 `.output` 自包含,无需在 EC2 上构建:

```bash
# 本地（已设好 VITE_* 的 apps/terminal/.env.local）
NITRO_PRESET=node-server pnpm build
rsync -az --delete apps/terminal/.output/ gatu@<host>:/opt/gatu/repo/apps/terminal/.output/
ssh gatu@<host> 'sudo systemctl restart gatu'
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
