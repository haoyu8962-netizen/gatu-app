# legal/ — Gatu（加途）法律与合规文件

> **状态：草案（DRAFT）。本目录所有文件均未经合格法律顾问审定，禁止对外发布。**
> 本目录由一次 AI 整理/初筛产生，**不构成法律意见或法律建议**。定稿前必须由熟悉加密资产/衍生品的执业律师按运营主体注册地与目标市场逐条审定。

## 品牌信息

| 项 | 值 |
|---|---|
| 主品牌 | **Gatu** |
| 中文名 | **加途** |
| 官网 | **gatu.ai** |
| 交易入口（Interface） | **app.gatu.ai** |
| 法务联系邮箱（占位，待开通） | legal@gatu.ai |

## 文件清单

| 文件 | 内容 | 拟发布路径 |
|---|---|---|
| [terms.md](./terms.md) | Terms of Use 服务条款（主合同：资格/限制人群/免责/禁止行为/责任限制/争议解决） | app.gatu.ai/terms |
| [privacyPolicy.md](./privacyPolicy.md) | Privacy Policy 隐私政策（数据收集/法律依据/权利/跨境传输/留存） | app.gatu.ai/privacyPolicy |
| [riskDisclosure.md](./riskDisclosure.md) | Risk Disclosure 风险披露（永续衍生品/杠杆/预言机/Pre-IPO 等风险） | app.gatu.ai/risk（待定） |
| [kyc-and-self-attestation.md](./kyc-and-self-attestation.md) | KYC & 自我声明要求（年龄/自我声明/地理与身份核验/反规避） | 内部合规 + 下单声明 UI 文案 |
| [restricted-territories.md](./restricted-territories.md) | 受限地区/受限人群清单（黑名单内容） | app.gatu.ai/restricted（待定） |
| [permitted-regions.md](./permitted-regions.md) | 准入地区（黑名单模型：全球减受限地区） | 内部合规 |

> 文档间通过相对链接互相引用（`permitted-regions.md` → `restricted-territories.md` / `kyc-and-self-attestation.md`），文件名即 URL slug，**改名前先确认引用与路由**。

## 先看这个

**[法律初筛报告.md](./法律初筛报告.md)** — 本次整理做了什么、待补占位符清单、合规红旗（按优先级）、文档间一致性核对、下一步建议。

## 与本仓库其他目录的关系

法律文件原先散落在 `acceptance/`（按 CLAUDE.md §9.1，该目录仅用于切片验收脚本），现统一归入本 `legal/` 目录。本目录是**法律/合规口径的事实来源**，与 `specs/`（需求）、`adr/`（架构决策）分离。
