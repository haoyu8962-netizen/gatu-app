import { i18n } from "@lingui/core";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { ReferralCodeCard } from "@/components/referrals/referral-code-card";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { ReferralData } from "@/lib/trade/referral";
import { messages as ar } from "@/locales/ar/messages.po";
import { messages as en } from "@/locales/en/messages.po";
import { messages as es } from "@/locales/es/messages.po";
import { messages as fr } from "@/locales/fr/messages.po";
import { messages as hi } from "@/locales/hi/messages.po";
import { messages as zh } from "@/locales/zh/messages.po";
import "./referral-code-card.css";

const catalogs = { en, zh, fr, es, hi, ar };
const params = new URLSearchParams(location.search);

const DATA: ReferralData = {
	referredBy: null,
	cumVlm: "25000",
	unclaimedRewards: "0",
	claimedRewards: "0",
	builderRewards: "0",
	referrerState: {
		stage: "ready",
		data: { code: params.get("code") ?? "GATU", nReferrals: 0, referralStates: [] },
	},
	rewardHistory: [],
	tokenToState: [],
};

function Fixture() {
	return (
		<DashboardFrameView
			{...DASHBOARD_FRAMES["/referrals"]}
			header={null}
			headerOffset={false}
			main={
				<section className="overflow-hidden rounded-24 bg-surface shadow-raised">
					<div className="grid grid-cols-1 gap-3 px-4 pb-4 min-[1001px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)] min-[1001px]:gap-4 min-[1001px]:px-5 min-[1001px]:pb-0">
						<div className="order-1">
							<ReferralCodeCard
								actionsDisabled={false}
								data={DATA}
								onApplyCode={() => undefined}
								onCreateCode={() => undefined}
							/>
						</div>
					</div>
				</section>
			}
		/>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
const requested = params.get("locale") ?? "en";
const locale = requested in catalogs ? (requested as keyof typeof catalogs) : "en";
i18n.loadAndActivate({ locale, messages: catalogs[locale] });
document.documentElement.lang = locale;
document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
createI18nRoot(root).render(<Fixture />);
