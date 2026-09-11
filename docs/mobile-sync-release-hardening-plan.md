# 移动配对发布防护：复审与修复任务

日期：2026-09-11。复审代码：`cef99af3abc4f098dce9dc6fd3038c3136318bf5`。状态：**R0–R5 的代码、测试和流程文档已实施，真机与目标 Linux/HTTPS 上线验收仍待执行**。未部署。以下问题表保留修复前的证据；当前实施结果见[发布防护实施记录](mobile-sync-release-hardening-verification.md)。

本计划修正[上一轮实施记录](mobile-sync-implementation-verification.md)中关于入口封锁和发布准入充分性的结论。票据 v2 的核心修复仍有效；修复前的 Caddy 封锁不能作为允许旧版本回滚的充分依据。P1/P2 是本项目的修复优先级，不是外部机构的漏洞评级。

## 1. 三项问题的复审结论

| 编号 | 结论与证据 | 影响边界 |
| --- | --- | --- |
| F1 / P1 | **成立：代理封锁可绕过。** [Caddyfile](../deploy/Caddyfile) 第 13 行只接受普通斜杠分隔。真实 Caddy 2.11.4 → 双开 Nitro 产物中，标准路径为 503，末尾反斜杠及 `%5c` 路径返回有效票据 JSON，同源消费为 204 | 破坏首次迁移及旧应用回滚时的独立入口保护。不是 v2 重新登记漏洞；双关 v2 handler 仍拒绝操作。未在生产或完整旧版 Nitro 产物上复现旧登记复活 |
| F2 / P1 | **成立：验收证据与发布 HEAD 形成循环。** [release helper](../deploy/mobile-sync-release.mjs) 第 376–383 行固定使用仓库内默认证据和当前完整 SHA；[验证器](../scripts/validate-mobile-phone-access-device-validation.js) 第 167 行精确比较。候选 A 的证据提交后得到 B，发布 B 时 11 行 mismatch | 阻断后续合规启用；双关基线不走真机证据分支。验证器虽支持 `--file`，生产调用没有传入外部证据路径，不能以手动调用验证器替代生产链修复 |
| F3 / P2 | **成立：监听配置校验不完整。** [env validator](../deploy/validate-production-env.mjs) 第 98 行只约束 HOST。HOST 为 loopback、NITRO_HOST 为 `0.0.0.0` 或 `::` 的配置均通过；实际产物优先取 NITRO_HOST | 需要冲突配置才触发；公网旁路还要求端口可达。未设置 NITRO_HOST 时 HOST 正常生效，不能声称当前生产已经暴露。attest 同时强制覆盖两者，掩盖了与真实启动环境的差异 |

### 本轮重新执行的交叉验证

重新启动隔离进程、重新生成合成票据，未只引用旧报告。Caddy 使用 canonical 配置，测试中仅改 loopback listener、TLS、日志和上游；无生产访问。Nitro 使用上一轮双开产物，该产物早于最终翻译补充，但票据及路由源码、依赖锁文件此后未变；这不等同于对当前提交完成生产发行认证。

| 请求或检查 | 本轮结果 |
| --- | --- |
| 标准票据路径，经 Caddy issue / consume | 503 / 503 |
| 末尾字面反斜杠，经 Caddy issue | 200、application/json、有效 v2 票据 |
| 末尾 `%5c`，经 Caddy issue / 同源 consume | 有效票据 200 / 204 |
| 同一票据，经 Caddy 换另一 Host/Origin consume | 410，未证实 Origin 隔离失效 |
| 双重编码首字符路径 | 200 HTML 回退，**不算成功签发或绕过票据校验** |
| HOST=127.0.0.1，NITRO_HOST 缺失 / 0.0.0.0 / :: | 验证器均退出 0；产物选择值分别为 127.0.0.1 / 0.0.0.0 / :: |
| 新临时 Git 仓库：提交 A 的合成证据后得到 B | 工作树干净；同一证据校验 A 退出 0，校验 B 退出 1、11 行 mismatch |

Git 夹具的 Pass 是流程测试数据，不是真机结果。监听复核使用实际验证器、实际产物的环境表达式及现有 systemd 启动链，未打开公网 listener。临时脚本不替代后续仓库中的回归测试；R0 必须将这些反例固化。

### 官方依据与被排除的意见

- [Caddy path_regexp](https://caddyserver.com/docs/caddyfile/matchers#path_regexp) 已对 URI 解码后的路径匹配。因此 F1 不能归因为“Caddy 完全不解码”，也不能仅再加一次 URL 解码。须处理 Caddy 与后端对反斜杠等分隔符的解释差异，避免无限递归解码或把查询字符串当路径。
- [Nitro Node 环境变量](https://nitro.build/deploy/runtimes/node) 同时支持 NITRO_HOST/HOST、NITRO_PORT/PORT；本地锁定产物的表达式为 `process.env.NITRO_HOST || process.env.HOST`，不是推测。保留现有锁定 preset，不因最新文档的命名变化升级 Nitro。
- [Git commit-tree](https://git-scm.com/docs/git-commit-tree) 说明提交由 tree、父提交和提交元数据构成；仓库内记录当前提交身份会改变下一次提交。F2 的判断还经过真实 Git/验证器组合复现，不依赖模型结论。
- “IMPORT=true 时关闭基线被拒绝”不是 P1 缺陷：仅 import 仍是开启能力，现有[部署手册](../deploy/README.md)明确要求首次双关。仅提前诊断配置冲突，不放松证据门槛。
- TC-1 的 Owner 检查位置不清晰：手机导入前面板没有 Owner，须说明桌面批准、Info 对账和导入结果各自验证什么。TC-2 可由真机与受控服务故障注入协作完成，并非不可执行；需要标明操作角色和记录来源。
- 未证实 v2 并发双消费、重启复活、204 前写入或新的 master 授权绕过。完整 QR 的 bearer 复制风险仍是[独立协议任务](mobile-sync-ticket-remediation-plan.md#7-独立后续任务真正限制-qr-凭证复制)，不混入本轮修复。

## 2. 可实施的修复任务

所有任务当前均为 **待实施**。R0 → R1/R2 可先完成关闭基线保护；R3 → R4 解决启用链；R5 按两条发布路径分别验收。任务可拆为独立、带测试的 Conventional Commit，不要求一次改动全部交易终端。

### R0：固化反例与独立测试判据（P1）

范围：[Caddy 集成测试](../deploy/mobile-sync-caddy.test.mjs)、[发布测试](../deploy/mobile-sync-release.test.mjs)、[env 测试](../deploy/validate-production-env.test.mjs)、[设备验证器测试](../scripts/validate-mobile-phone-access-device-validation.test.js)。

1. 在修复前用固定源码/产物记录 F1–F3 的失败，再以同一输入验证修复后结果。新增断言应能让未修复基线失败，不能只断言源码包含某段字符串。
2. 路径测试既覆盖原始 HTTP 字节，也检查应用是否实际执行：成功 issue 必须为严格 v2 JSON；成功 consume 必须为 204。禁止以任意 200 或页面 HTML 当作成功。
3. 保留独立攻击用例集合，不完全复用生产 `BLOCKED_PATHS` 作为测试的唯一输入。覆盖原始/编码反斜杠、编码大小写、每个字符位置的编码、普通/重复/尾斜杠、多重编码、点段和正常非票据路径。
4. 使用两个 Host 和独立消费者，所有 ID 仅保留在测试内存中；记录状态和布尔结果，不输出 QR、私钥、签名、票据或消费者 ID。用例按现有 rate limit 分批或使用新的隔离实例，不能把 429 误当成代理封锁成功，也不提高生产限额来使测试通过。新增服务器有明确超时及退出清理。

验收：有真实 Caddy→真实 Node 的正负对照，另以计数上游证明封锁请求从未被转发；有真实临时 Git 生命周期反例；有有效监听变量组合测试。

### R1：补齐独立入口封锁与回滚探针（P1）

范围：[Caddyfile](../deploy/Caddyfile)、[release helper](../deploy/mobile-sync-release.mjs)、[deploy.sh](../deploy/deploy.sh)、Caddy 校验/HTTP 测试及部署手册。

- 优先在 reverse_proxy 前拒绝包含反斜杠的歧义路径（包括 URI 解码得到的反斜杠），保留原票据路径 503 规则。对本次已确认的票据别名统一返回 503 和现有隐私头/Retry-After；若引入通用畸形路径 400 规则，必须与票据暂停响应区分，且不扩大对正常业务 URL 的限制。
- 具体 matcher 先在锁定 Caddy 2.11.4 上 adapt/validate 并跑 R0，再采用通过的语法；不在计划中把未经运行的正则当成已修复代码。若采用替换/规范化方案，必须证明不会产生重定向、额外解码或被代理重新解释的路径。
- 同步 `probeBlock`、首次基线准备、两条自动失败回滚和人工回滚所用的检查。标准路径 503 不再足以允许退回 legacy；已知反斜杠别名也必须在代理前被拒绝。
- 保留 X-Forwarded-For/X-Real-IP 重写、referral guard、正常终端路由和两个 origin 的协议隔离；不要通过全站阻断或删除旧资源恢复功能规避问题。

验收：R0 全部通过；使用旧 handler 或旧版本产物的隔离兼容测试证明请求不会执行旧 register；旧兼容夹具仅用于本地测试，绝不暴露公网。关闭 v2 自身 gate 仍有效；无法证实入口保护时不得切换到 legacy。

### R2：统一真实监听配置（P2，首次发布前完成）

范围：[env validator](../deploy/validate-production-env.mjs)、[systemd unit](../deploy/gatu.service)、发布/启动 guard 验证、attest 和相关测试。

- 保留 HOST 必须为 127.0.0.1；NITRO_HOST 缺失/空可兼容回退，非空只允许相同 loopback。拒绝 0.0.0.0、::、其他地址和冲突值。为当前固定 Caddy upstream 明确 PORT 默认/允许值为 3000；NITRO_PORT 非空时必须一致，不能让探针检查另一个进程。
- 生产启动入口同样约束实际生效的 host/port，防止 env 文件在 preflight 后变化绕过验证；与现有 guard 集成时保留 exact 17-byte referral capability、身份文件和旧版回滚语义。环境文件优先级不能靠在 unit 中随意追加一个 Environment 行来猜测。
- attest 可用隔离端口运行，但必须复用相同监听解析/约束规则；明确记录测试端口替换，不能用静默覆盖两个别名掩盖非法生产输入。
- 覆盖 IPv4/IPv6 通配地址、缺省、空值、冲突 alias、非法端口和真实 launcher。同步 canonical unit 安装/比较、Linux systemd parser、回滚与启动测试。

验收：冲突配置在启动前失败；Linux 隔离网络中检查真实进程仅监听 loopback，非 loopback 无法连接。不得只以 curl localhost 成功作为没有公网旁路的证据。不得对真实生产端口做压力测试。

### R3：把验收证据与被测提交分离（P1）

范围：设备验证器/测试、真机模板、release manifest 关联规则。

- 仓库文档保留协议、场景和空模板；实际证据存于独立的受控发行附件，生产必须显式指定其路径。既有 `--file` 可以复用，但生产不能回退到仓库默认文档，也不能用 `--allow-incomplete` 通过启用。
- 推荐沿用现有 Markdown 行证据并新增严格的候选身份头：schema、完整源码 SHA、预先生成的 release ID、最终候选产物 SHA-256、ticket API 版本、两个编译 gate。每份证据仍要求 11 个完整 RD/TW 记录、真实设备/时间/结果及证据引用；每行身份必须与候选头一致。
- 证据版本不要求等于被测代码版本；证据更新不得修改候选二进制或要求代码生成新 commit。证据放在候选产物哈希范围之外，独立记录其自身 digest，避免再制造“产物包含自己的验收证据”的循环。
- 严格拒绝缺失、重复/未知关键字段、缩写 SHA、跨版本/跨产物/跨 gate 复用、未完成/失败行、越界路径和符号链接。证据来自现有受控发行流程并经过明确审核；内容哈希只能证明一致性，不能证明测试真实发生。
- 发布记录同时绑定候选 digest 与证据 digest；生产只读使用证据，不自动生成 Pass，不要求新增钱包登录或签名步骤。

验收：真实临时 Git 仓库先固定 A，再在仓库外记录 A 的合成证据，Git HEAD 和产物 digest 均不变且候选验证可通过；任一身份字段变化或缺少真机行必须拒绝。测试夹具明确标注 synthetic，不得出现在生产证据目录。

### R4：支持验收后发布同一候选产物（P1）

范围：deploy.sh、release helper、发布/清理/回滚测试、CI 和操作手册。**只增加外部 `--file` 不能完成 F2 修复。**

当前脚本在生产主机重新构建，构建时间和 release identity 会变化。若真机证据绑定某份产物，却在发布时重新生成另一份产物，则身份虽相同也没有完成同产物验收。推荐引入明确的“准备候选”和“发布已验候选”两个阶段：

1. 准备阶段保持 origin/main、干净工作树、frozen lockfile 和配置约束；一次生成 release ID，构建包含真实启动 guard 的候选，完成 HTTP/重启检查，再冻结于受控候选目录。此阶段不切换 current、不重启生产，可以为独立 HTTPS 暂存生成开启候选，不要求尚未取得的真机证据。
2. 从该候选在独立 HTTPS 暂存运行真机验收。证据在仓库/候选目录之外生成，绑定该 SHA、release ID 和 digest。两设备使用同一暂存 origin，测试网用独立 owner/Agent；不把生产两个 origin 当成可独立放量的开关。非 canonical 暂存域沿用现有 [network.ts](../apps/terminal/src/lib/network.ts) 的网络选择能力，在双端确认 Testnet 和实际 Info/Exchange 目标；不要通过另编译 VITE_HYPERLIQUID_TESTNET 制造不同的被测产物。先验证暂存域的 Privy 授权和应用 gate，不能跳过既有身份、法律或区域约束。
3. 发布阶段在部署锁内核对候选源码仍满足 origin/main 约束、当前配置未漂移、候选与证据 digest 一致；重新运行最终候选协议检查并核验本轮主机配置，但不得重新构建或覆盖 guard。通过后沿现有原子切换和健康检查发布这同一份产物。
4. 保留已有携带历史 hashed assets 的兼容策略：新增携带文件不得覆盖候选文件，只能在已有白名单范围内；发布前后候选 manifest 中每个文件必须相同。候选 manifest、版本 marker 和证据记录的排除规则显式且固定，不能把 server 代码或任意新增文件排除出验收。
5. 任一源码、guard、构建配置或候选字节变化，生成新候选并重新取得对应证据，不接受“仅 SHA 相同所以可以复用”的捷径。候选清理与 release 清理分开，保留当前产物和固定双关基线，不让过期/删除的证据被静默绕过。

双关基线可保留现有的一次构建/即时自动验收发布路径，不要求物理证据；该路径必须继续拒绝任一开启 gate。准备阶段不得成为绕过生产启用门的另一条发布入口。CLI 的实际参数在实施时与 bootstrap/main-only 测试共同落地，当前没有可执行的新发布命令。

验收：临时发行环境真实执行“准备 → 外部合成证据 → 发布”，确认无 Git 修改、无二次 build、同一 release/digest 被切换；缺证据/错 digest/配置变化/main 变化时 current 不变。分别注入 restart 与 health 失败，回到已验证关闭基线；没有安全基线时，legacy 路径还必须通过 R1/R2 的独立保护。

### R5：整体验收、文档与发布顺序（P2）

- 修订 TC-1/Setup 的 Owner 检查位置；TC-2 区分手机操作者、网络故障注入者、服务重启操作者和协议探针证据。保留 11 行 Not run，不能用文案修改产生 Pass。
- CI 保留四种构建组合；增加真实 Caddy→Node 路径差分、真实监听约束、外部证据生命周期、候选发布/回滚集成。现有仅 `attest` 的矩阵不能替代启用发布入口测试。
- 封锁期间开关不为双关时，在构建/真机验证之前给出明确错误；这只是改善诊断，不删除任何 gate。同步部署手册、生产准入和实施记录，避免旧文档继续宣称封锁完整。
- R1/R2 及关闭发布相关集成通过后，可推进“修正代理保护 → 双关 v2 基线 → 核验并固定回滚基线”；不必等待全部真机证据才修补旧入口。
- R3/R4、Linux/HTTPS 暂存及完整物理证据通过后，才可进入功能开启。解除临时票据封锁时保留歧义路径保护，先在双关应用上验证旧 register=400、issue/consume=503，再发布已验开启候选。失败回滚保持关闭，不能退回旧协议后开放路径。

## 3. 检查与退出条件

本次文档提交只运行适合规划的检查：文档链接/围栏、diff whitespace、现有设备验证器的结构检查；默认验证器仍应因 11 行 Not run 拒绝。上述隔离复现已经重新执行，不计为修复后测试通过。

实施完成至少运行下列已有入口，并补充 R0/R4 的新集成命令到手册：

```bash
CADDY_BINARY=/path/to/caddy node --test deploy/mobile-sync-caddy.test.mjs deploy/mobile-sync-release.test.mjs deploy/validate-production-env.test.mjs deploy/deploy-bootstrap.test.mjs deploy/deploy-health-check.test.mjs deploy/validate-caddy-forwarded-headers.test.mjs scripts/validate-mobile-phone-access-device-validation.test.js
bash -n deploy/deploy.sh
```

CI 中 Caddy 必须实际运行，不能以缺少 CADDY_BINARY 的 skip 通过；Linux 专属检查不能沿用本机 skip 作为通过。改 TypeScript/TSX 时运行对应 Biome、terminal typecheck 及 mobile-sync/wallet/onboarding 回归；改生产构建/启动接线时重做真实产物 HTTP 验收。仅修改 Markdown 不重跑交易 UI 全量构建。

关闭基线的退出条件是 R1/R2 和其真实部署路径验收完成；功能启用还要求 R3/R4/R5 与全部真实设备/测试网记录完成。未经执行的 Linux、HTTPS、摄像头、钱包签名、旧产物兼容项一律保持待验，不写成已通过。当前结论是“问题成立、修复任务已明确”，不是“可以发布或已修复”。
