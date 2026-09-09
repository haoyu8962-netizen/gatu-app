import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useExchange } from "../hooks/useExchange";
import { useHyperliquid } from "../provider";
import { convertFeeToPercentageString } from "./agent-utils";
import { useHyperliquidOwnerSigner } from "./owner-signer-provider";
import type { RegistrationStatus } from "./types";
import { useTradingStatus } from "./use-trading-status";
import { withWalletApprovalTimeout } from "./wallet-approval-timeout";

export interface UseBuilderFeeApprovalResult {
	approve: () => Promise<void>;
	status: RegistrationStatus;
	error: Error | null;
	reset: () => void;
}

export function useBuilderFeeApproval(): UseBuilderFeeApprovalResult {
	const { builderConfig, clientKey } = useHyperliquid();
	const ownerSigner = useHyperliquidOwnerSigner();
	const address = clientKey === "disconnected" ? undefined : (clientKey as Address);
	const addressRef = useRef(address);
	addressRef.current = address;
	const [isAwaitingWallet, setIsAwaitingWallet] = useState(false);
	const mountedRef = useRef(true);
	const agentStatus = useTradingStatus();
	const approveBuilderFee = useExchange("approveBuilderFee");

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	function setAwaitingWallet(value: boolean) {
		if (mountedRef.current) setIsAwaitingWallet(value);
	}

	function assertSameWallet(startAddress: Address) {
		ownerSigner?.assertCurrent();
		if (addressRef.current?.toLowerCase() !== startAddress.toLowerCase()) {
			throw new Error("Wallet changed during builder fee approval");
		}
	}

	const approval = useMutation({
		mutationKey: ["hl", "builderFeeApproval", address],
		mutationFn: async (): Promise<void> => {
			const startAddress = address;
			if (!startAddress) throw new Error("No wallet connected");
			assertSameWallet(startAddress);

			const requirements = await agentStatus.refetchBuilderFee();
			assertSameWallet(startAddress);
			if (!requirements.needsBuilderFee) return;
			if (!builderConfig?.b || builderConfig.f === undefined)
				throw new Error("Builder fee configuration is unavailable");

			setAwaitingWallet(true);
			const approvalPromise = approveBuilderFee.mutateAsync({
				builder: builderConfig.b,
				maxFeeRate: convertFeeToPercentageString(builderConfig.f),
			});
			try {
				await withWalletApprovalTimeout(approvalPromise);
			} catch (error) {
				void approvalPromise
					.then(() => {
						assertSameWallet(startAddress);
						return agentStatus.refetchBuilderFee();
					})
					.catch(() => undefined);
				throw error;
			} finally {
				setAwaitingWallet(false);
			}

			assertSameWallet(startAddress);
			const confirmed = await agentStatus.refetchBuilderFee();
			assertSameWallet(startAddress);
			if (confirmed.needsBuilderFee) throw new Error("Builder fee approval could not be confirmed");
		},
	});

	let status: RegistrationStatus = "idle";
	if (approval.isError) status = "error";
	else if (approval.isPending) status = isAwaitingWallet ? "approving_fee" : "verifying";

	function reset() {
		approval.reset();
		setIsAwaitingWallet(false);
	}

	return {
		approve: approval.mutateAsync,
		status,
		error: approval.error,
		reset,
	};
}
