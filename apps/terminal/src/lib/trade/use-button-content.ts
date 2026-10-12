import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";
import type { RegistrationStatus } from "@/lib/hyperliquid";
import type { ButtonContent, FormValidationResult, Side } from "@/lib/trade/types";

interface ButtonContentInput {
	isConnected: boolean;
	availableBalance: number;
	reduceOnly?: boolean;
	isBalanceLoading?: boolean;
	hasBalanceError?: boolean;
	isAwaitingFirstDeposit?: boolean;
	canDeposit: boolean;
	depositUnavailableReason?: string | null;
	tradingBlocked?: boolean;
	validation: FormValidationResult;
	isSignerReady: boolean;
	isApprovalLoading: boolean;
	registerStatus: RegistrationStatus;
	canApprove: boolean;
	approvalUnavailableReason?: string | null;
	side: Side;
	sideLabel: string;
	isSubmitting: boolean;
	onConnectWallet: () => void;
	onDeposit: () => void;
	onRegister: () => void;
	onSubmit: () => void;
}

export function useButtonContent(input: ButtonContentInput): ButtonContent {
	const { t } = useLingui();
	const isRegistering =
		input.registerStatus === "approving_fee" ||
		input.registerStatus === "approving_agent" ||
		input.registerStatus === "verifying";

	const registerText = useMemo(() => {
		if (input.registerStatus === "approving_fee" || input.registerStatus === "approving_agent") {
			return t`Sign in wallet...`;
		}
		if (input.registerStatus === "verifying") return t`Verifying...`;
		return t`Enable Trading`;
	}, [input.registerStatus, t]);

	return useMemo<ButtonContent>(() => {
		const stage = getOrderActionStage({
			isConnected: input.isConnected,
			needsApproval: input.validation.needsApproval,
			isSignerReady: input.isSignerReady,
			hasBalanceError: input.hasBalanceError === true,
			isBalanceLoading: input.isBalanceLoading === true,
			availableBalance: input.availableBalance,
			reduceOnly: input.reduceOnly,
			isAwaitingFirstDeposit: input.isAwaitingFirstDeposit === true,
		});

		if (stage === "connect") {
			return {
				text: t(DESKTOP_NAV_LABELS.wallet),
				action: input.onConnectWallet,
				disabled: false,
				variant: "cyan",
			};
		}
		if (stage === "agent" || stage === "builder") {
			return {
				text: registerText,
				action: input.onRegister,
				disabled: isRegistering || !input.canApprove || input.isApprovalLoading || input.tradingBlocked === true,
				disabledReason: input.canApprove ? undefined : (input.approvalUnavailableReason ?? undefined),
				variant: "cyan",
			};
		}
		if (stage === "balanceError" || stage === "balanceLoading") {
			return {
				text: t`Place ${input.sideLabel} Order`,
				action: () => {},
				disabled: true,
				variant: input.side,
			};
		}
		if (stage === "deposit") {
			return {
				text: t`Deposit`,
				action: input.canDeposit ? input.onDeposit : () => {},
				disabled: !input.canDeposit,
				disabledReason: input.canDeposit ? undefined : (input.depositUnavailableReason ?? undefined),
				opensDeposit: input.canDeposit,
				variant: "cyan",
			};
		}
		return {
			text: t`Place ${input.sideLabel} Order`,
			action: input.onSubmit,
			disabled: !input.validation.canSubmit || input.isSubmitting || input.tradingBlocked === true,
			variant: input.side as "buy" | "sell",
		};
	}, [
		input.isConnected,
		input.availableBalance,
		input.reduceOnly,
		input.isBalanceLoading,
		input.hasBalanceError,
		input.isAwaitingFirstDeposit,
		input.canDeposit,
		input.depositUnavailableReason,
		input.tradingBlocked,
		input.validation.needsApproval,
		input.validation.canSubmit,
		input.isSignerReady,
		registerText,
		isRegistering,
		input.canApprove,
		input.approvalUnavailableReason,
		input.isApprovalLoading,
		input.onConnectWallet,
		input.onDeposit,
		input.onRegister,
		input.onSubmit,
		input.side,
		input.sideLabel,
		input.isSubmitting,
		t,
	]);
}

export type { ButtonContentInput };
