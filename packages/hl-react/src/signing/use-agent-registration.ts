import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useExchange } from "../hooks/useExchange";
import { useHyperliquid } from "../provider";
import { useAgentApprovalOverride } from "./agent-approval-provider";
import {
	activateAgentRegistrationSession,
	cancelAgentRegistrationEpochAndRemove,
	captureAgentRegistrationEpoch,
	closeAgentRegistrationSessionAndRemove,
	isAgentRegistrationEpochCurrent,
	persistAgentForRegistration,
	verifyAgentRegistrationOrRemove,
} from "./agent-registration-session";
import type { AgentStorageScope } from "./agent-storage";
import type { RegistrationStatus } from "./types";
import { useAgentStatus } from "./use-agent-status";
import { withWalletApprovalTimeout } from "./wallet-approval-timeout";

export type RegistrationStep = "agent" | null;

export interface AgentRegistrationOptions {
	persistConnection?: boolean;
}

export interface UseAgentRegistrationResult {
	register: (options?: AgentRegistrationOptions) => Promise<Address>;
	status: RegistrationStatus;
	currentStep: RegistrationStep;
	error: Error | null;
	reset: () => void;
}

export function resolveAgentRegistrationStorageScope(options?: AgentRegistrationOptions): AgentStorageScope {
	return options?.persistConnection === true ? "local" : "session";
}

function deriveRegistrationStatus(
	isPending: boolean,
	isError: boolean,
	currentStep: RegistrationStep,
): RegistrationStatus {
	if (!isPending) return isError ? "error" : "idle";
	if (currentStep === "agent") return "approving_agent";
	return "verifying";
}

export function useAgentRegistration(): UseAgentRegistrationResult {
	const { env, agentName, clientKey } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as Address);
	const addressRef = useRef(address);
	addressRef.current = address;

	const [currentStep, setCurrentStep] = useState<RegistrationStep>(null);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const agentStatus = useAgentStatus();
	const fallbackApproveAgent = useExchange("approveAgent");
	const approveAgentOverride = useAgentApprovalOverride();

	function safeSetStep(step: RegistrationStep) {
		if (mountedRef.current) setCurrentStep(step);
	}

	const registration = useMutation({
		mutationKey: ["hl", "registration", address],
		mutationFn: async (options?: AgentRegistrationOptions): Promise<Address> => {
			try {
				const startAddress = address;
				if (!startAddress) throw new Error("No wallet connected");
				const verifiedAddress: Address = startAddress;

				const registrationSession = await captureAgentRegistrationEpoch(env, verifiedAddress);
				if (registrationSession.status === "failed") {
					throw new Error(
						registrationSession.reason === "lock_unavailable"
							? "Secure Agent registration requires Web Locks support. Update your browser and try again."
							: "Secure Agent registration session is unavailable",
					);
				}
				const epoch = registrationSession.epoch;

				function hasSameWallet() {
					return addressRef.current?.toLowerCase() === verifiedAddress.toLowerCase();
				}

				async function assertRegistrationCurrent() {
					if (!hasSameWallet()) {
						const cancellation = await cancelAgentRegistrationEpochAndRemove(epoch);
						if (cancellation.status === "failed") {
							throw new Error("Wallet changed and Agent registration cleanup failed");
						}
						throw new Error("Wallet changed during registration");
					}
					if (!(await isAgentRegistrationEpochCurrent(epoch))) {
						throw new Error("Agent registration session changed");
					}
				}

				async function verifyStoredAgent(publicKey: Address) {
					if (!hasSameWallet()) {
						const cancellation = await cancelAgentRegistrationEpochAndRemove(epoch, publicKey);
						if (cancellation.status === "failed") {
							throw new Error("Wallet changed and Agent registration cleanup failed");
						}
						throw new Error("Wallet changed during registration");
					}

					const verification = await verifyAgentRegistrationOrRemove(epoch, publicKey);
					if (verification.status === "failed") {
						throw new Error("Agent registration cleanup could not be verified");
					}
					if (verification.status === "cancelled") {
						throw new Error("Agent registration session changed");
					}
				}

				const storageScope = resolveAgentRegistrationStorageScope(options);

				async function persistAndVerifyAgent(privateKey: `0x${string}`, publicKey: Address) {
					await assertRegistrationCurrent();
					const persistence = await persistAgentForRegistration(
						epoch,
						privateKey,
						publicKey,
						{ source: "local-registration" },
						{ scope: storageScope },
					);
					if (persistence.status === "failed") {
						throw new Error(
							persistence.reason === "registration_cancelled"
								? "Agent registration session changed"
								: "Agent private key could not be stored securely",
						);
					}
					await verifyStoredAgent(publicKey);

					const remoteVerification = await agentStatus.refetchAgent(publicKey);
					if (!remoteVerification.isAgentReady) {
						throw new Error("Agent approval could not be confirmed");
					}
					await verifyStoredAgent(publicKey);
				}

				const requirements = await agentStatus.refetchAgent();
				await assertRegistrationCurrent();

				if (requirements.needsAgent) {
					safeSetStep("agent");

					const privateKey = generatePrivateKey();
					const account = privateKeyToAccount(privateKey);
					const publicKey = account.address;

					const approveAgentPromise = (approveAgentOverride ?? fallbackApproveAgent.mutateAsync)({
						agentAddress: publicKey,
						agentName,
					});
					try {
						await withWalletApprovalTimeout(approveAgentPromise);
					} catch (error) {
						approveAgentPromise
							.then(async () => {
								await persistAndVerifyAgent(privateKey, publicKey);
							})
							.catch(() => {});
						throw error;
					}
					await assertRegistrationCurrent();

					await persistAndVerifyAgent(privateKey, publicKey);

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
		if (address) {
			void closeAgentRegistrationSessionAndRemove(env, address).then((result) => {
				if (result.status === "closed") void activateAgentRegistrationSession(env, address);
			});
		}
		registration.reset();
		setCurrentStep(null);
	}

	function register(options?: AgentRegistrationOptions) {
		return registration.mutateAsync(options);
	}

	return {
		register,
		status,
		currentStep,
		error: registration.error,
		reset,
	};
}
