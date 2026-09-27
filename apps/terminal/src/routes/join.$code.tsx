import { createFileRoute, notFound } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { ReferralsPage } from "@/components/referrals/referrals-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { getNetwork } from "@/lib/network";
import { buildPageHead } from "@/lib/seo";
import { isSafeReferralJoinCode, resolveReferralJoinIntent } from "@/lib/trade/referral-join";

export const Route = createFileRoute("/join/$code")({
	ssr: false,
	beforeLoad: ({ params }) => {
		// TanStack has already decoded path params at this boundary. Validate that
		// decoded value directly; the client separately verifies the raw browser
		// pathname with the canonical, single-decode parser.
		if (!isSafeReferralJoinCode(params.code)) throw notFound();
		return bootDashboardRoute();
	},
	remountDeps: ({ params }) => ({ code: params.code }),
	head: () => {
		const head = buildPageHead({
			title: "Join Gatu",
			description: "Review a Hyperliquid referral invitation in the Gatu trading terminal.",
			path: "/referrals",
			noIndex: true,
		});
		return { ...head, meta: [...head.meta, { name: "gatu-route", content: "referral-join" }] };
	},
	component: ReferralJoinRoute,
});

function ReferralJoinRoute() {
	const { code } = Route.useParams();
	const result = resolveReferralJoinIntent(
		window.location.pathname,
		window.location.origin,
		getNetwork() === "testnet" ? "Testnet" : "Mainnet",
	);
	if (!result || result.code !== code) return <NotFoundPage />;
	return <ReferralsPage initialReferralCode={result.code} />;
}
