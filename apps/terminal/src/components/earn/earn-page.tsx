import { Suspense, useState } from "react";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import type { EarnOperation } from "@/domain/earn";
import { useEarnData } from "@/hooks/earn/use-earn-data";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { createLazyComponent } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { TopNav } from "../trade/header/top-nav";
import { MobileHeader } from "../trade/mobile/mobile-header";
import { TestnetBanner } from "../trade/testnet-banner";
import { EarnActionModal } from "./earn-action-modal";
import { EarnView } from "./earn-view";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

const VISIBLE_UNAVAILABLE_REASONS = new Set(["agent-only-session", "geo-restricted"]);

interface EarnDialogState {
	sessionId: number;
	operation: EarnOperation;
	token: number | null;
	open: boolean;
}

export function EarnPage() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const data = useEarnData();
	const { hasWalletAccess } = useWalletSession();
	const availability = useFundsActionAvailability({
		accountDataReady: data.accountStatus === "ready",
		accountAbstraction: data.accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: true,
	}).withdrawal;
	const [dialog, setDialog] = useState<EarnDialogState | null>(null);
	const notice =
		data.ownerAddress && availability.reason && VISIBLE_UNAVAILABLE_REASONS.has(availability.reason)
			? availability.unavailableReason
			: null;

	function openAction(operation: EarnOperation, token: number | null) {
		if (!availability.available || data.publicStatus !== "ready" || dialog?.open) return;
		setDialog((current) => ({ sessionId: (current?.sessionId ?? 0) + 1, operation, token, open: true }));
	}

	function handleOpenChange(open: boolean) {
		setDialog((current) => (current ? { ...current, open } : current));
	}

	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/earn"]}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				header={
					isMobile ? (
						<MobileHeader />
					) : (
						<>
							<TestnetBanner />
							<TopNav />
						</>
					)
				}
				main={
					<EarnView
						data={data}
						isMobile={isMobile}
						actionsAllowed={availability.available}
						notice={notice}
						onOpenAction={openAction}
					/>
				}
				footer={
					!isMobile ? (
						<Suspense fallback={null}>
							<FooterBar />
						</Suspense>
					) : null
				}
			/>
			{dialog ? (
				<EarnActionModal
					open={dialog.open}
					sessionId={dialog.sessionId}
					operation={dialog.operation}
					initialToken={dialog.token}
					data={data}
					onOpenChange={handleOpenChange}
				/>
			) : null}
			<Suspense fallback={null}>
				<GlobalModals />
			</Suspense>
		</>
	);
}
