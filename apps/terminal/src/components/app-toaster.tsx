import { FundsActionRecoveryHost } from "@/components/funds-action/funds-action-recovery-host";
import { OrderNotificationGate } from "@/components/trade/order-notification-gate";
import { CctpDepositTrackingNotifier } from "@/components/trade/tradebox/cctp-deposit-tracking-notifier";
import { Toaster } from "@/components/ui/sonner";

export function AppToaster() {
	return (
		<>
			<Toaster />
			<OrderNotificationGate />
			<CctpDepositTrackingNotifier />
			<FundsActionRecoveryHost />
		</>
	);
}
