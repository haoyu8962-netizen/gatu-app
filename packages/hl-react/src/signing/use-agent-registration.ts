import { useMutation } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
	assertExchangeSigningDeadline,
	type ExchangeSigningDeadlineSlot,
	startExchangeActionDeadline,
} from "../internal/exchange/request-scheduler";
import { useHyperliquid } from "../provider";
import { type AgentApprovalOptions, useAgentApprovalOverride } from "./agent-approval-provider";
import {
	AGENT_REGISTRATION_COORDINATION_WINDOW_MS,
	type AgentRegistrationPersistOptions,
	cancelAgentRegistrationEpochAndRemove,
	captureAgentRegistrationEpoch,
	closeAgentRegistrationSessionAndRemove,
	isAgentRegistrationEpochCurrent,
	persistAgentForRegistration,
	verifyAgentRegistrationOrRemove,
} from "./agent-registration-session";
import { type AgentStorageScope, inspectAgentStorageRecord } from "./agent-storage";
import type { HyperliquidEnv, RegistrationStatus } from "./types";
import { type AgentMissingReason, useAgentStatus } from "./use-agent-status";
import { withWalletApprovalTimeout } from "./wallet-approval-timeout";

export type RegistrationStep = "agent" | null;

export type AgentRegistrationFailurePhase = "preflight" | "approval" | "persistence" | "verification";

export interface AgentRegistrationOptions {
	approval?: AgentApprovalOptions;
	persistConnection?: boolean;
	/** The deadline of the explicit authorization that started this registration (ADR 0053). */
	deadline?: ExchangeSigningDeadlineSlot;
}

export interface UseAgentRegistrationResult {
	register: (options?: AgentRegistrationOptions) => Promise<Address>;
	resetConnection: () => Promise<void>;
	canResetConnection: boolean;
	status: RegistrationStatus;
	currentStep: RegistrationStep;
	agentMissingReason: AgentMissingReason | null;
	failurePhase: AgentRegistrationFailurePhase | null;
	error: Error | null;
	reset: () => void;
}

export class AgentRegistrationResetRequiredError extends Error {
	constructor() {
		super("The previous trading connection cannot be resumed safely");
		this.name = "AgentRegistrationResetRequiredError";
	}
}

interface AgentRegistrationIdentity {
	address: Address | undefined;
	env: HyperliquidEnv;
}

interface AgentRegistrationFailureState extends AgentRegistrationIdentity {
	error: Error;
	phase: AgentRegistrationFailurePhase;
	resetAllowed: boolean;
}

export function resolveAgentRegistrationStorageScope(options?: AgentRegistrationOptions): AgentStorageScope {
	return options?.persistConnection === true ? "local" : "session";
}

export function isDefinitiveAgentApprovalRejection(error: unknown): boolean {
	if (!isRecord(error)) return false;
	if (error.name === "ApiRequestError") return true;
	if (error.name !== "HttpRequestError" || !isRecord(error.response)) return false;
	const status = error.response.status;
	return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 499;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasSameRegistrationIdentity(left: AgentRegistrationIdentity, right: AgentRegistrationIdentity): boolean {
	return (
		left.env === right.env &&
		(left.address === undefined
			? right.address === undefined
			: right.address !== undefined && left.address.toLowerCase() === right.address.toLowerCase())
	);
}

function isOtherTabRegistrationConflict(error: Error | null): boolean {
	return error?.message.startsWith("A trading connection is already being established in another tab") === true;
}

function shouldAllowConnectionReset(
	error: Error | null,
	resetAllowed: boolean,
	missingReason: AgentMissingReason | null,
): boolean {
	if (isOtherTabRegistrationConflict(error)) return false;
	return (
		error?.name === "AgentRegistrationResetRequiredError" || resetAllowed || missingReason === "invalid_local_record"
	);
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

export function useAgentRegistration(options: { enabled?: boolean } = {}): UseAgentRegistrationResult {
	const enabled = options.enabled !== false;
	const { env, clientKey } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as Address);
	const identityRef = useRef({ address, env });

	const [currentStep, setCurrentStep] = useState<RegistrationStep>(null);
	const [failureState, setFailureState] = useState<AgentRegistrationFailureState | null>(null);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useLayoutEffect(() => {
		const nextIdentity = { address, env };
		const identityChanged = !hasSameRegistrationIdentity(identityRef.current, nextIdentity);
		identityRef.current = nextIdentity;
		if (identityChanged) {
			setCurrentStep(null);
			setFailureState(null);
		}
	}, [address, env]);

	const agentStatus = useAgentStatus({ enableAgent: enabled });
	const approveAgentOverride = useAgentApprovalOverride();

	function safeSetStep(identity: AgentRegistrationIdentity, step: RegistrationStep) {
		if (mountedRef.current && hasSameRegistrationIdentity(identityRef.current, identity)) setCurrentStep(step);
	}

	function safeSetFailure(
		identity: AgentRegistrationIdentity,
		phase: AgentRegistrationFailurePhase | null,
		error?: unknown,
		resetAllowed = false,
	) {
		if (!mountedRef.current || !hasSameRegistrationIdentity(identityRef.current, identity)) return;
		setFailureState(
			phase === null
				? null
				: {
						...identity,
						error: error instanceof Error ? error : new Error("Agent registration failed"),
						phase,
						resetAllowed,
					},
		);
	}

	const registration = useMutation({
		mutationKey: ["hl", "registration", env, address],
		retry: false,
		mutationFn: async (options?: AgentRegistrationOptions): Promise<Address> => {
			if (!enabled) throw new Error("Agent registration is disabled for owner-wallet trading");
			const deadline = options?.deadline ?? startExchangeActionDeadline();
			const registrationIdentity = { address, env };
			let phase: AgentRegistrationFailurePhase = "preflight";
			let resetAllowed = false;
			safeSetFailure(registrationIdentity, null);
			const approvalOptions =
				options?.approval?.applicationReview === "confirmed"
					? ({ applicationReview: "confirmed" } satisfies AgentApprovalOptions)
					: undefined;
			try {
				const startAddress = registrationIdentity.address;
				if (!startAddress) throw new Error("No wallet connected");
				const verifiedAddress: Address = startAddress;
				const registrationEnv = registrationIdentity.env;
				const initialStorage = inspectAgentStorageRecord(registrationEnv, verifiedAddress);
				if (initialStorage.status === "failed") {
					throw new Error("Agent key storage could not be verified");
				}
				if (initialStorage.status === "invalid") {
					throw new Error("Stored Agent key is invalid");
				}
				let cleanupPublicKey = initialStorage.status === "valid" ? initialStorage.agent.publicKey : undefined;
				let pendingPublicKey =
					initialStorage.status === "valid" &&
					initialStorage.agent.source === "local-registration" &&
					initialStorage.agent.approvalPendingAtMs !== undefined
						? initialStorage.agent.publicKey
						: undefined;
				const registrationSession = await captureAgentRegistrationEpoch(
					registrationEnv,
					verifiedAddress,
					pendingPublicKey ? { resumePublicKey: pendingPublicKey } : undefined,
				);
				if (registrationSession.status === "failed") {
					if (registrationSession.reason === "registration_reset_required") {
						throw new AgentRegistrationResetRequiredError();
					}
					throw new Error(
						registrationSession.reason === "lock_unavailable"
							? "Secure Agent registration requires Web Locks support. Update your browser and try again."
							: registrationSession.reason === "registration_in_progress"
								? "A trading connection is already being established in another tab."
								: "Secure Agent registration session is unavailable",
					);
				}
				const epoch = registrationSession.epoch;

				function hasSameIdentity() {
					return (
						identityRef.current.env === registrationEnv &&
						identityRef.current.address?.toLowerCase() === verifiedAddress.toLowerCase()
					);
				}

				async function cancelChangedIdentity(expectedPublicKey?: Address): Promise<never> {
					const cancellation = await cancelAgentRegistrationEpochAndRemove(epoch, expectedPublicKey, {
						preserveIfSubmissionStarted: true,
					});
					if (cancellation.status === "failed") {
						throw new Error("Wallet or network changed and Agent registration cleanup failed");
					}
					throw new Error("Wallet or network changed during registration");
				}

				async function assertRegistrationCurrent(expectedPublicKey: Address | undefined = cleanupPublicKey) {
					if (!hasSameIdentity()) {
						await cancelChangedIdentity(expectedPublicKey);
					}
					const isCurrent = await isAgentRegistrationEpochCurrent(epoch);
					if (!hasSameIdentity()) {
						await cancelChangedIdentity(expectedPublicKey);
					}
					if (!isCurrent) {
						throw new Error("Agent registration session changed");
					}
				}

				await assertRegistrationCurrent(pendingPublicKey ?? cleanupPublicKey);

				async function verifyStoredAgent(publicKey: Address) {
					await assertRegistrationCurrent(publicKey);
					const verification = await verifyAgentRegistrationOrRemove(epoch, publicKey);
					await assertRegistrationCurrent(publicKey);
					if (verification.status === "failed") {
						throw new Error("Agent registration cleanup could not be verified");
					}
					if (verification.status === "cancelled") {
						throw new Error("Agent registration session changed");
					}
				}

				function requireStoredAgent(publicKey: Address) {
					const inspection = inspectAgentStorageRecord(registrationEnv, verifiedAddress);
					if (inspection.status === "failed") {
						throw new Error("Agent key storage could not be verified");
					}
					if (inspection.status === "invalid") {
						throw new Error("Stored Agent key is invalid");
					}
					if (
						inspection.status !== "valid" ||
						inspection.agent.source !== "local-registration" ||
						inspection.agent.publicKey.toLowerCase() !== publicKey.toLowerCase()
					) {
						throw new Error("Agent registration session changed");
					}
					return inspection.agent;
				}

				async function refetchAgentAndAssert(agentAddressOverride?: Address, expectedPublicKey?: Address) {
					try {
						return await agentStatus.refetchAgent(agentAddressOverride);
					} finally {
						await assertRegistrationCurrent(expectedPublicKey);
					}
				}

				const storageScope = resolveAgentRegistrationStorageScope(options);

				async function persistExactAgent(
					privateKey: `0x${string}`,
					publicKey: Address,
					approvalPendingAtMs?: number,
					approvalSubmissionStartedAtMs?: number,
					pendingResolution?: AgentRegistrationPersistOptions["pendingResolution"],
				) {
					const persistence = await persistAgentForRegistration(
						epoch,
						privateKey,
						publicKey,
						approvalPendingAtMs === undefined
							? { source: "local-registration" }
							: {
									source: "local-registration",
									approvalPendingAtMs,
									...(approvalSubmissionStartedAtMs === undefined ? {} : { approvalSubmissionStartedAtMs }),
								},
						{ pendingResolution, scope: storageScope },
					);
					if (persistence.status === "stored") cleanupPublicKey = publicKey;
					await assertRegistrationCurrent(cleanupPublicKey);
					if (persistence.status === "failed") {
						throw new Error(
							persistence.reason === "registration_cancelled"
								? "Agent registration session changed"
								: "Agent private key could not be stored securely",
						);
					}
					return requireStoredAgent(publicKey);
				}

				async function verifyApprovedAgent(publicKey: Address) {
					phase = "verification";
					await verifyStoredAgent(publicKey);
					const remoteVerification = await refetchAgentAndAssert(publicKey, publicKey);
					const storedAgent = requireStoredAgent(publicKey);
					if (!remoteVerification.isAgentReady) {
						throw new Error("Agent approval could not be confirmed");
					}
					await verifyStoredAgent(publicKey);
					phase = "persistence";
					await persistExactAgent(storedAgent.privateKey, publicKey, undefined, undefined, "verified");
					await verifyStoredAgent(publicKey);
				}

				const capturedStorage = inspectAgentStorageRecord(registrationEnv, verifiedAddress);
				if (capturedStorage.status === "failed") {
					throw new Error("Agent key storage could not be verified");
				}
				if (capturedStorage.status === "invalid") {
					throw new Error("Stored Agent key is invalid");
				}
				cleanupPublicKey = capturedStorage.status === "valid" ? capturedStorage.agent.publicKey : undefined;
				pendingPublicKey =
					capturedStorage.status === "valid" &&
					capturedStorage.agent.source === "local-registration" &&
					capturedStorage.agent.approvalPendingAtMs !== undefined
						? capturedStorage.agent.publicKey
						: undefined;
				phase = pendingPublicKey ? "verification" : "preflight";

				if (pendingPublicKey) {
					resetAllowed = true;
					const pendingAgent = requireStoredAgent(pendingPublicKey);
					const approvalPendingAtMs = pendingAgent.approvalPendingAtMs;
					if (approvalPendingAtMs === undefined) {
						throw new Error("Agent registration session changed");
					}
					await persistExactAgent(
						pendingAgent.privateKey,
						pendingPublicKey,
						approvalPendingAtMs,
						pendingAgent.approvalSubmissionStartedAtMs,
					);

					const remoteVerification = await refetchAgentAndAssert(pendingPublicKey, pendingPublicKey);
					const storedAgent = requireStoredAgent(pendingPublicKey);
					if (!remoteVerification.isAgentReady) {
						if (
							storedAgent.approvalSubmissionStartedAtMs === undefined &&
							Date.now() - approvalPendingAtMs >= AGENT_REGISTRATION_COORDINATION_WINDOW_MS
						) {
							await persistExactAgent(
								storedAgent.privateKey,
								pendingPublicKey,
								undefined,
								undefined,
								"expired-unsubmitted",
							);
						}
						throw new Error("Agent approval could not be confirmed");
					}
					await verifyStoredAgent(pendingPublicKey);
					phase = "persistence";
					await persistExactAgent(storedAgent.privateKey, pendingPublicKey, undefined, undefined, "verified");
					await verifyStoredAgent(pendingPublicKey);
					return pendingPublicKey;
				}

				const capturedAgentAddress = capturedStorage.status === "valid" ? capturedStorage.agent.publicKey : undefined;
				const requirements = await refetchAgentAndAssert(
					capturedStorage.status === "valid" && capturedStorage.agent.source === "local-registration"
						? capturedStorage.agent.publicKey
						: undefined,
					capturedAgentAddress,
				);

				if (requirements.needsAgent) {
					if (!approveAgentOverride) {
						throw new Error("A host Agent approval provider is required");
					}
					assertExchangeSigningDeadline(deadline);
					const privateKey = generatePrivateKey();
					const account = privateKeyToAccount(privateKey);
					const publicKey = account.address;
					const approvalPendingAtMs = Date.now();

					await persistExactAgent(privateKey, publicKey, approvalPendingAtMs);
					await verifyStoredAgent(publicKey);
					phase = "approval";
					safeSetStep(registrationIdentity, "agent");

					const approvalParams = { agentAddress: publicKey };
					const approvalController = new AbortController();
					const approveAgentPromise = Promise.resolve().then(() => {
						assertExchangeSigningDeadline(deadline);
						return approveAgentOverride(approvalParams, {
							...approvalOptions,
							registrationPublicKey: publicKey,
							signal: approvalController.signal,
							deadline,
						});
					});
					try {
						await withWalletApprovalTimeout(approveAgentPromise, {
							onTimeout: (error) => approvalController.abort(error),
						});
					} catch (error) {
						approvalController.abort(error);
						const cancellation = await cancelAgentRegistrationEpochAndRemove(epoch, publicKey, {
							preserveIfSubmissionStarted: !isDefinitiveAgentApprovalRejection(error),
						});
						if (cancellation.status === "failed") {
							throw new Error("Agent registration cleanup could not be verified");
						}
						if (cancellation.status === "current") {
							phase = "verification";
							void approveAgentPromise
								.then(async () => {
									await verifyApprovedAgent(publicKey);
								})
								.catch(async (lateError: unknown) => {
									if (isDefinitiveAgentApprovalRejection(lateError)) {
										await cancelAgentRegistrationEpochAndRemove(epoch, publicKey);
									}
								});
							await assertRegistrationCurrent(publicKey);
						}
						throw error;
					}
					await assertRegistrationCurrent(publicKey);

					await verifyApprovedAgent(publicKey);

					return publicKey;
				}

				return capturedAgentAddress ?? agentStatus.agentAddress ?? zeroAddress;
			} catch (error) {
				safeSetFailure(registrationIdentity, phase, error, resetAllowed);
				throw error;
			} finally {
				safeSetStep(registrationIdentity, null);
			}
		},
	});

	const currentIdentity = { address, env };
	const currentFailureState =
		failureState && hasSameRegistrationIdentity(failureState, currentIdentity) ? failureState : null;
	const failurePhase = currentFailureState?.phase ?? null;
	const error = currentFailureState?.error ?? null;
	const canResetConnection =
		address !== undefined &&
		shouldAllowConnectionReset(error, currentFailureState?.resetAllowed === true, agentStatus.agentMissingReason);
	const status = deriveRegistrationStatus(registration.isPending, registration.isError, currentStep);

	function reset() {
		registration.reset();
		setCurrentStep(null);
		setFailureState(null);
	}

	function register(options?: AgentRegistrationOptions) {
		return registration.mutateAsync(options);
	}

	async function resetConnection() {
		const resetIdentity = currentIdentity;
		if (!resetIdentity.address) throw new Error("No wallet connected");
		if (!canResetConnection) throw new Error("Trading connection reset is not currently required");
		if (!hasSameRegistrationIdentity(identityRef.current, resetIdentity)) {
			throw new Error("Wallet or network changed before resetting the trading connection");
		}
		const shutdown = await closeAgentRegistrationSessionAndRemove(resetIdentity.env, resetIdentity.address, {
			preserveRecentRegistrationWithoutMatchingCandidate: true,
		});
		if (shutdown.status !== "closed") {
			throw new Error("Trading connection reset could not be verified");
		}
		if (
			identityRef.current.env !== resetIdentity.env ||
			identityRef.current.address?.toLowerCase() !== resetIdentity.address.toLowerCase()
		) {
			throw new Error("Wallet or network changed while resetting the trading connection");
		}
		reset();
	}

	return {
		register,
		resetConnection,
		canResetConnection,
		status,
		currentStep,
		agentMissingReason: agentStatus.agentMissingReason,
		failurePhase,
		error,
		reset,
	};
}
