import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { ARBITRUM_CHAIN_ID } from "@/config/contracts";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";
import type { RegistrationStatus } from "@/lib/hyperliquid";
import type { ButtonContent, FormValidationResult, Side } from "@/lib/trade/types";

interface ButtonContentInput {
	isConnected: boolean;
	needsChainSwitch: boolean;
	isSwitchingChain: boolean;
	switchChain: (chainId: number) => void;
	availableBalance: number;
	isBalanceLoading?: boolean;
	hasBalanceError?: boolean;
	canDeposit: boolean;
	depositUnavailableReason?: string | null;
	tradingUnavailableReason?: string | null;
	validation: FormValidationResult;
	isSignerReady: boolean;
	isApprovalLoading: boolean;
	registerStatus: RegistrationStatus;
	canApprove: boolean;
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
		if (input.isApprovalLoading || !input.canApprove) return t`Loading...`;
		if (input.registerStatus === "approving_fee" || input.registerStatus === "approving_agent") {
			return t`Sign in wallet...`;
		}
		if (input.registerStatus === "verifying") return t`Verifying...`;
		return t`Enable Trading`;
	}, [input.isApprovalLoading, input.registerStatus, input.canApprove, t]);

	return useMemo<ButtonContent>(() => {
		const stage = getOrderActionStage({
			isConnected: input.isConnected,
			needsChainSwitch: input.needsChainSwitch,
			needsApproval: input.validation.needsApproval,
			isSignerReady: input.isSignerReady,
			hasBalanceError: input.hasBalanceError === true,
			isBalanceLoading: input.isBalanceLoading === true,
			availableBalance: input.availableBalance,
		});

		if (stage === "connect") {
			return {
				text: t`Connect Wallet`,
				action: input.onConnectWallet,
				disabled: false,
				variant: "cyan",
			};
		}
		if (stage === "switchChain") {
			return {
				text: input.isSwitchingChain ? t`Switching...` : t`Switch to Arbitrum`,
				action: () => input.switchChain(ARBITRUM_CHAIN_ID),
				disabled: input.isSwitchingChain,
				variant: "cyan",
			};
		}
		if (stage === "agent" || stage === "builder") {
			return {
				text: registerText,
				action: input.onRegister,
				disabled: isRegistering || !input.canApprove || input.isApprovalLoading || !!input.tradingUnavailableReason,
				disabledReason: input.tradingUnavailableReason ?? undefined,
				variant: "cyan",
			};
		}
		if (stage === "balanceError") {
			return {
				text: t`Failed to load balances.`,
				action: () => {},
				disabled: true,
				variant: "cyan",
			};
		}
		if (stage === "balanceLoading") {
			return {
				text: t`Loading...`,
				action: () => {},
				disabled: true,
				variant: "cyan",
			};
		}
		if (stage === "deposit") {
			return {
				text: input.canDeposit ? t`Deposit` : t`Deposit unavailable`,
				action: input.canDeposit ? input.onDeposit : () => {},
				disabled: !input.canDeposit,
				disabledReason: input.canDeposit ? undefined : (input.depositUnavailableReason ?? undefined),
				variant: "cyan",
			};
		}
		return {
			text: t`Place ${input.sideLabel} Order`,
			action: input.onSubmit,
			disabled: !input.validation.canSubmit || input.isSubmitting || !!input.tradingUnavailableReason,
			disabledReason: input.tradingUnavailableReason ?? undefined,
			variant: input.side as "buy" | "sell",
		};
	}, [
		input.isConnected,
		input.needsChainSwitch,
		input.isSwitchingChain,
		input.switchChain,
		input.availableBalance,
		input.isBalanceLoading,
		input.hasBalanceError,
		input.canDeposit,
		input.depositUnavailableReason,
		input.tradingUnavailableReason,
		input.validation.needsApproval,
		input.validation.canSubmit,
		input.isSignerReady,
		registerText,
		isRegistering,
		input.canApprove,
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
