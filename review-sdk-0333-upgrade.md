# 审查报告:Hyperliquid SDK 0.33.1 → 0.33.3 升级

- 审查对象(已提交未推送):
  - `ca0f52f6` fix(trading): support Hyperliquid SDK 0.33.3
  - `2a27e106` chore(i18n): narrow Hyperliquid catalog changes
- 方式:本地双版本 SDK 类型逐文件 diff(剔除 amd-module 版本化头噪音)→ 6 维度并行审查 → 反驳式核实 → 盲区批判 → **干净检出实证**
- 规模:9 个 agent + 1 补跑 agent,约 100 万 token
- 结论:**升级本身干净、完整、无功能遗漏。唯一实质缺口是 3 条新文案在 4 种语言未翻译;主要不规范是 catalog 的约 6000 行噪音。**

---

## 一、直接回答三个问题

### 是否全部升级了?—— 是

- `apps/terminal/package.json` 与 `packages/hl-react/package.json` **都已是 `0.33.3`**(精确版本,无 `^`,与项目锁定约定一致)
- `pnpm-lock.yaml` 已彻底切到 0.33.3,**无任何 0.33.1 引用残留**
- 全量扫描 SDK 变更集:**33 个文件变更 + 3 个新增 + 1 个删除**,无遗漏未审项

### 有无遗漏?—— 没有功能遗漏

35 项结构性变更的适配分布:

| 适配状态 | 数量 |
|---|---|
| 已正确适配 | 12 |
| 无需适配(代码不消费/纯类型放宽) | 18 |
| 已适配但有小瑕疵 | 4 |
| **需适配但遗漏** | **0**(见下) |

工作流某维度曾把 `OrderProcessingStatus` 新增 3 值标为"需适配但遗漏",**经我人工验证是误报**:

```
order-tracking.ts:24-25       → outcomeSettledCanceled、internalCancel 已入 CANCELED_ORDER_STATUSES
use-order-display-labels.ts:43 → tooManyOpenOrdersRejected 已入 REJECTED 集
```

归类完全正确,且与既有所有 `*Rejected`(tickRejected/oracleRejected 等)的惯例一致。**若按误报"补齐"把 `tooManyOpenOrdersRejected` 塞进 CANCELED 集,反而会把一个拒绝显示成"已取消"**,并让 `completeReconciliation` 走错分支。建议不改。

### 有无不规范?—— 有两处,均非功能性

见 §三。

---

## 二、升级适配的质量(值得肯定的部分)

**TWAP 新语义适配完整且有意识。** 0.33.3 最实质的变更是 TWAP:

- `twapHistory.status` 从 3 值扩到 5 值(新增 `waitingForTrigger`、`stopped`)
- `twapOrder` 新增可选 `details`(触发价 `t.{p,a}` + 停止价 `s`)
- `TwapState` 新增 `stopPx`、`trigger` 字段

代码全部跟上了,而且方向正确:

```ts
// twap-reconciliation.tsx:19  联合类型扩为 6 值
status: "activated" | "waitingForTrigger" | "terminated" | "finished" | "stopped" | "error";

// :166  活跃判定 —— waitingForTrigger 算活跃(还会执行),stopped/terminated/finished 走完成
candidate.status === "activated" || candidate.status === "waitingForTrigger"
```

`twap.ts` 还把 `stopPx`/`trigger` 纳入 `matchesTwapIntent`,并用 null-safe 比较(`areEqualNullableDecimals`/`matchesTrigger`)。这是 **TWAP 对账幂等的关键**——不匹配这两个新字段的话,同一 TWAP 可能被判为"不同意图"导致重复下单。

**legalCheck 终于与代码对齐。** 0.33.1 的 `restrictions` 是可选、只有 `"n"|"a"` 两值且带 `FIXME: meaning unconfirmed`;而项目 `legal.ts` 早就认了 `n/a/o/u` 四值(我在此前几轮审查中确认过这是"应用比 SDK 类型更准确")。**0.33.3 把它改成必填四值,官方语义也确认了**,与 `LEGAL_RESTRICTIONS` 完全一致。`parseLegalStatus` 的 fail-closed 派生仍正确,zod 的 `z.string().optional()` 是新类型的严格超集,作为防御保留合理。

**`dexAbstraction` 的"补回"是必要的编译修复,不是死代码。** 0.33.3 从 `webData3`/`userAbstraction` 删掉了该枚举值,而 `AccountAbstraction` 以 `NonNullable<WebData3WsEvent[...]>` 开头,不补回会直接类型报错。且 `fetchUserAbstraction` 走**裸 fetch** 而非 SDK client,不受类型收窄约束——服务端若仍返回旧值仍会命中该分支,下游降级路径(`toSelectableAccountAbstraction → null`)也安全。

**webData2 订阅被 SDK 删除(0.33.2),`reliability.ts` 相应删掉 2 行**,适配正确。

---

## 三、不规范之处

### 3.1 catalog 的约 6000 行噪音(主要问题)

两提交合并的**净效果只有 72 行新增、0 删除**:

```
$ git diff --stat ca0f52f6^ 2a27e106 -- apps/terminal/src/locales/
 6 files changed, 72 insertions(+)

$ git diff ca0f52f6^ 2a27e106 -- .../en/messages.po | grep "^+msgid"
+msgid "Spot Dust Conversion"
+msgid "TWAP Slice"
+msgid "Vault Close"
```

而 `ca0f52f6` 单独对 catalog 做了 **+3493/-2593(约 6000 行)** 的整份重新生成,`2a27e106` 再几乎逐行回退。

三个后果:

1. **`ca0f52f6` 单独不自洽** —— 它会把 19 条在用文案误置为 obsolete,若被单独 cherry-pick / checkout,这些翻译在编译产物里会丢失、运行时回退英文。必须靠 `2a27e106` 救回
2. 约 6000 行噪音**掩盖了真实改动**,评审面被无意义放大
3. 违反"SDK 升级提交不应夹带无关改动"的基本规范

**建议**:两提交均未推送,推送前 `squash` 为一个。更好的做法是升级提交只新增这 3 条 msgid,不重新生成整份 catalog。

### 3.2 3 条新文案在 es/fr/hi/ar 未翻译

我在**干净检出**(仅已提交内容)上精确统计:

| | msgid | 空翻译 |
|---|---|---|
| 升级前 en/zh | 957 | 1 / 19 |
| 升级后 en/zh | 960 | 1 / 19 |
| 升级前 es/fr/hi/ar | 950 | 170 |
| **升级后 es/fr/hi/ar** | **953** | **173** |

每个 catalog `+3` msgid(正是那三个新订单类型标签),en/zh 已译,**es/fr/hi/ar 空翻译 170→173,恰好 +3 全未译**。`lingui.config.ts` 未配 `fallbackLocales`,编译会把空 msgstr 变成源 msgid,即这四种语言的用户在订单历史里看到英文标签。

同时暴露一个**存量**问题:en/zh 有 960 条 msgid,es/fr/hi/ar 只有 953,**差 7 条**(非本次引入,是此前平仓等批次的遗留)。

---

## 四、卫生问题(不影响提交本身)

- **`node_modules/.pnpm` 残留 0.33.1**:lockfile 里已完全没有 0.33.1,这是未 prune 的 store 残留。跑一次 `pnpm install` 即清。**注意**:审查 SDK 类型时若不留神会读到残留的旧版本
- **SDK 被两套 TypeScript 重复解析**(5.7.2 与 5.9.3),与我第一轮报过的 viem 双解析同源。但**干净检出的 `pnpm typecheck` 通过(EXIT=0)**,该问题在这条链路上未复现,升级也没加重
- **`check-client-bundle-budget.mjs` 又上调 1 行阈值**,余量仅剩约 2KB。这是连续第 N 次上调,归因也不准确(SDK 0.33.3 体积增量有限)

---

## 五、一个重要的审查基线提醒

工作区里有一批**与这两个提交无关的未提交工作**(历史订单订阅化):

```
?? packages/hl-react/src/registries/historical-orders.ts
?? apps/terminal/src/hooks/trade/use-historical-orders.ts
?? apps/terminal/src/lib/tests/use-historical-orders.test.tsx
 M packages/hl-react/src/registries/subscription.ts
 M apps/terminal/src/components/trade/{positions,mobile}/*orders-history-tab.tsx
```

我一度据此判断"升级代码只提交了一半、推送后会构建失败"——**这个判断是错的,我用干净检出推翻了它**:

```
$ git archive HEAD | tar -x -C /tmp/cleanco   # 仅已提交内容
$ cd /tmp/cleanco/apps/terminal && npx tsc --noEmit
EXIT=0
```

干净检出里 `subscription.ts` 根本没有那行 `import ... from "./historical-orders"`,也没有任何文件引用 `use-historical-orders`——**那些悬空 import 只存在于工作区未提交的修改中**。两个提交本身自洽、可独立构建。

这也说明:**任何直接读工作树文件(而非 `git show <commit>:`)的审查,看到的都是叠加了无关重构的版本**。本报告的 i18n 统计与 typecheck 结论均已改用干净检出重做。

---

## 六、后续可选项(非本次升级的账)

0.33.3 新增了几个项目尚未利用的能力:

- **`info/usdcRouting`** 返回 HL 当前实际的 USDC 出入金通道(`"bridge"|"cctp"`)。项目把 bridge2 地址硬编码并无条件走该路径——**若 HL 把 `depositRoute` 切到 `cctp`,当前实现会在无预警的情况下失败**。值得排进待办
- `info/outcomeTemplates`、`exchange/activateOutcomeDeployer`(HIP-4 outcome 市场)——项目暂不涉及
- **`userFees.stakingLink` 是本次唯一真正破坏性的响应形状变更**(单对象 → 判别联合),当前无消费点所以无缺陷,但 `docs/hyperliquid-sdk-reference.md` 的 Audited contracts 段落漏记了这条,未来接入 staking-link UI 时按旧文档写会读到 `undefined`
- `legal.ts` 的 `canViewOutcomeMarkets`/`canUseReferrals` 目前无任何消费方,且 `"u"`(UK 用户)的具体禁用范围是项目自行推断、官方未明确。建议加注释标明该假设未经确认

---

## 七、方法与置信度

**我亲自实证**:双版本 SDK 逐文件 diff 定位 TWAP 枚举与 details 变更;读 `twap-reconciliation.tsx`/`twap.ts` 确认活跃判定与幂等匹配正确;grep 确认三个新订单状态的归类正确(并推翻"遗漏"误报);**用 `git archive HEAD` 建干净检出跑 typecheck(EXIT=0)** 证明两提交自洽;在干净检出上重做 i18n 统计(957→960 / 170→173);`git diff --stat ca0f52f6^ 2a27e106` 量化 catalog 净效果为 72 行;抽查被删 msgid 的源串确认已从代码移除(合法清理)。

**未做**:未对真实 API 端点发请求验证服务端是否仍返回 `"dexAbstraction"`(该分支必要性的判断基于"走裸 fetch 不受 SDK 类型约束"这一代码事实);未跑完整测试套件(此前已确认该套件在默认 5000ms 超时下系统性 flaky,非本次引入),但补跑维度实测了 9 个相关测试文件 90 个用例全绿。
