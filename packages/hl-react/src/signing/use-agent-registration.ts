import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useExchange } from "../hooks/useExchange";
import { useHyperliquid } from "../provider";
import { useAgentWalletActions } from "./agent-storage";
import { convertFeeToPercentageString } from "./agent-utils";
import type { RegistrationStatus } from "./types";
import { useAgentStatus } from "./use-agent-status";

export type RegistrationStep = "fee" | "agent" | null;

const WALLET_APPROVAL_TIMEOUT_MS = 60_000;

export interface UseAgentRegistrationResult {
	register: () => Promise<Address>;
	status: RegistrationStatus;
	currentStep: RegistrationStep;
	error: Error | null;
	reset: () => void;
}

function deriveRegistrationStatus(
	isPending: boolean,
	isError: boolean,
	currentStep: RegistrationStep,
): RegistrationStatus {
	if (!isPending) return isError ? "error" : "idle";
	if (currentStep === "fee") return "approving_fee";
	if (currentStep === "agent") return "approving_agent";
	return "verifying";
}

function withWalletApprovalTimeout<T>(promise: Promise<T>): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error("Wallet approval timed out. Check your wallet and try again."));
		}, WALLET_APPROVAL_TIMEOUT_MS);
	});

	return Promise.race([promise, timeout]).finally(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
}

export function useAgentRegistration(): UseAgentRegistrationResult {
	const { env, agentName, builderConfig, clientKey } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as Address);
	const addressRef = useRef(address);
	addressRef.current = address;

	const [currentStep, setCurrentStep] = useState<RegistrationStep>(null);
	const { setAgent, clearAgent } = useAgentWalletActions();
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const agentStatus = useAgentStatus();
	const approveBuilderFee = useExchange("approveBuilderFee");
	const approveAgent = useExchange("approveAgent");

	function safeSetStep(step: RegistrationStep) {
		if (mountedRef.current) setCurrentStep(step);
	}

	const registration = useMutation({
		mutationKey: ["hl", "registration", address],
		mutationFn: async (): Promise<Address> => {
			try {
				const startAddress = address;
				if (!startAddress) throw new Error("No wallet connected");

				function assertSameWallet() {
					if (addressRef.current !== startAddress) {
						throw new Error("Wallet changed during registration");
					}
				}

				let requirements = await agentStatus.refetch();
				assertSameWallet();

				if (requirements.needsBuilderFee && builderConfig?.b && builderConfig?.f !== undefined) {
					safeSetStep("fee");
					await withWalletApprovalTimeout(
						approveBuilderFee.mutateAsync({
							builder: builderConfig.b,
							maxFeeRate: convertFeeToPercentageString(builderConfig.f),
						}),
					);
					assertSameWallet();
					requirements = await agentStatus.refetch();
					assertSameWallet();
				}

				if (requirements.needsAgent) {
					safeSetStep("agent");

					const privateKey = generatePrivateKey();
					const account = privateKeyToAccount(privateKey);
					const publicKey = account.address;

					const approveAgentPromise = approveAgent.mutateAsync({ agentAddress: publicKey, agentName });
					try {
						await withWalletApprovalTimeout(approveAgentPromise);
					} catch (error) {
						approveAgentPromise
							.then(async () => {
								if (addressRef.current !== startAddress) return;
								clearAgent(env, startAddress);
								setAgent(env, startAddress, privateKey, publicKey);
								await agentStatus.refetch();
							})
							.catch(() => {});
						throw error;
					}
					assertSameWallet();

					clearAgent(env, startAddress);
					setAgent(env, startAddress, privateKey, publicKey);
					await agentStatus.refetch();

					return publicKey;
				}

				return agentStatus.agentAddress ?? zeroAddress;
			} finally {
				safeSetStep(null);
			}
		},
	});

	const status = deriveRegistrationStatus(registration.isPending, registration.isError, currentStep);

	function reset() {
		if (address) clearAgent(env, address);
		registration.reset();
		setCurrentStep(null);
	}

	return {
		register: registration.mutateAsync,
		status,
		currentStep,
		error: registration.error,
		reset,
	};
}
