import { createFileRoute } from "@tanstack/react-router";
import { ReferralsPage } from "@/components/referrals/referrals-page";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/referrals")({
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Referrals & Rewards",
			description: "Review Hyperliquid referral stages, fee benefits, referred traders, and claimable rewards.",
			path: "/referrals",
		}),
	component: ReferralsRoute,
});

function ReferralsRoute() {
	return <ReferralsPage />;
}
