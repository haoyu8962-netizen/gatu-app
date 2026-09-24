import { cleanupAgentRegistrationIfMatches } from "@gatu/hl-react";
import {
	createMobileAgentApproval,
	createMobileAgentRevocationApproval,
	type ExpectedMobileAgentVerification,
	getMobileAgentNameBase,
	isStoredMobileAgent,
	MOBILE_AGENT_NAME_BASE,
	type MobileAgentApproval,
} from "@gatu/hl-react/signing/mobile-agent";
import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import { CheckIcon, DeviceMobileIcon, ShieldCheckIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { usePressAndHold } from "@/hooks/ui/use-press-and-hold";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError } from "@/lib/errors/format";
import { formatTime, shortenAddress } from "@/lib/format";
import {
	type AgentRegistrationExecutionLease,
	captureAgentRegistrationExecutionLease,
	type HyperliquidEnv,
	isAgentRegistrationExecutionLeaseCurrent,
	isBuilderFeeApproved,
	useAgentWalletStorage,
	useHyperliquid,
	useInfo,
} from "@/lib/hyperliquid";
import {
	hasBuilderDexAccountFunding,
	hasPerpAccountFunding,
	hasSpotAccountFunding,
} from "@/lib/mobile-sync/account-funding";
import {
	beginDesktopApprovalSubmission,
	clearDesktopApprovalRecovery,
	type DesktopApprovalRecovery,
	getDesktopApprovalRecovery,
	hasDesktopApprovalRecovery,
	updateDesktopApprovalRecovery,
} from "@/lib/mobile-sync/desktop-approval-recovery";
import { waitForExpectedMobileAgent } from "@/lib/mobile-sync/remote-verification";
import { createMobileAgentSyncUrl, MOBILE_SYNC_QR_VISIBLE_MS } from "@/lib/mobile-sync/sync-core";

interface MobileAgentSyncModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface MobileAgentSyncSessionProps extends MobileAgentSyncModalProps {
	env: HyperliquidEnv;
	hasWalletAccess: boolean;
	walletAddress: Address | undefined;
}

interface QrDeadlines {
	expiresAtMs: number;
	visibleUntilMonotonicMs: number;
}

interface QrPayload extends QrDeadlines {
	agentAddress: Address;
	syncId: string;
	pageSafetyEpoch: number;
	rendered: boolean;
	url: string;
}

interface ExpectedRevocationAgent {
	agentAddress: Address;
	agentNameBase: string;
	agentValidUntilMs: number;
}

type SyncState =
	| { status: "idle" }
	| { status: "checking" }
	| { status: "ready" }
	| { status: "approving" }
	| { status: "verifying" }
	| { status: "pending-verification"; approval: MobileAgentApproval; message: MobileAgentSyncMessage }
	| { status: "concealed"; approval: MobileAgentApproval; message?: MobileAgentSyncMessage }
	| { status: "revalidating"; approval: MobileAgentApproval }
	| { status: "visible"; payload: QrPayload }
	| { status: "error"; message: MobileAgentSyncMessage };

type ResetState =
	| { status: "idle" }
	| { status: "checking" }
	| { status: "confirm"; oldAgentAddresses: string[] }
	| { status: "signing"; oldAgentAddresses: string[] }
	| { status: "verifying"; oldAgentAddresses: string[]; replacement: ExpectedRevocationAgent }
	| {
			status: "pending";
			oldAgentAddresses: string[];
			replacement: ExpectedRevocationAgent;
			message: MobileAgentSyncMessage;
	  }
	| { status: "success"; localCleanupIncomplete: boolean; replacementExpiresAtMs: number | null }
	| { status: "error"; message: MobileAgentSyncMessage };

const LOCALIZED_MESSAGE_CODES = [
	"account-check-failed",
	"approval-already-in-progress",
	"approval-already-preparing",
	"approval-recheck-failed",
	"approval-recovery-inactive",
	"approval-recovery-unavailable",
	"approval-verification-pending",
	"builder-fee-required",
	"mobile-key-expired",
	"mobile-key-invalidated",
	"no-balance",
	"qr-creation-unavailable",
	"qr-render-failed",
	"qr-reveal-unavailable",
	"recovery-capacity",
	"review-before-approve",
	"revocation-expired",
	"revocation-pending",
	"verify-mobile-access-failed",
	"wallet-required-link",
	"wallet-required-reset",
] as const;

type LocalizedMessageCode = (typeof LOCALIZED_MESSAGE_CODES)[number];
type MobileAgentSyncMessage =
	| { kind: "external-error"; rawMessage: string }
	| { kind: "localized"; code: LocalizedMessageCode };

const RECOVERY_MESSAGE_CODE_PREFIX = "\u0000gatu-mobile-sync-message:v1:";

const QR_REVEAL_HOLD_MS = 4_000;
const HOLD_RING_RADIUS = 10;
const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * HOLD_RING_RADIUS;
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function remainingQrLifetimeMs(deadlines: QrDeadlines): number {
	return Math.min(deadlines.expiresAtMs - Date.now(), deadlines.visibleUntilMonotonicMs - performance.now());
}

function remainingQrLifetimeSeconds(deadlines: QrDeadlines): number {
	return Math.max(0, Math.ceil(remainingQrLifetimeMs(deadlines) / 1_000));
}

function findExistingMobileAgentAddress(extraAgents: ExtraAgentsResponse | undefined, error: unknown): Address | null {
	if (error || !extraAgents) return null;
	const existing = extraAgents.find((agent) => getMobileAgentNameBase(agent.name) === MOBILE_AGENT_NAME_BASE);
	return existing?.address ?? null;
}

function normalizeError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function localizedMessage(code: LocalizedMessageCode): MobileAgentSyncMessage {
	return { kind: "localized", code };
}

function externalErrorMessage(error: unknown): MobileAgentSyncMessage {
	return { kind: "external-error", rawMessage: normalizeError(error).message };
}

function serializeRecoveryMessage(message: MobileAgentSyncMessage): string {
	return message.kind === "localized" ? `${RECOVERY_MESSAGE_CODE_PREFIX}${message.code}` : message.rawMessage;
}

function deserializeRecoveryMessage(value: string | undefined): MobileAgentSyncMessage {
	if (!value) return localizedMessage("approval-verification-pending");
	if (value.startsWith(RECOVERY_MESSAGE_CODE_PREFIX)) {
		const code = value.slice(RECOVERY_MESSAGE_CODE_PREFIX.length);
		if ((LOCALIZED_MESSAGE_CODES as readonly string[]).includes(code)) {
			return localizedMessage(code as LocalizedMessageCode);
		}
	}
	return { kind: "external-error", rawMessage: value };
}

function toExpectedAgent(approval: MobileAgentApproval) {
	return {
		agentAddress: approval.publicKey,
		agentNameBase: approval.agentNameBase,
		agentValidUntilMs: approval.agentValidUntilMs,
	};
}

function clearQrCanvas(canvas: HTMLCanvasElement | null) {
	if (!canvas) return;
	canvas.width = 0;
	canvas.height = 0;
}

function isQrPageActive() {
	if (document.visibilityState !== "visible") return false;
	try {
		return document.hasFocus();
	} catch {
		return false;
	}
}

function createSyncStateFromRecovery(recovery: DesktopApprovalRecovery | null): SyncState {
	if (!recovery) return { status: "idle" };
	if (recovery.phase === "approved-unrevealed") {
		return { status: "concealed", approval: recovery.approval };
	}
	return {
		status: "pending-verification",
		approval: recovery.approval,
		message: deserializeRecoveryMessage(recovery.submissionErrorMessage),
	};
}

function isDefinitiveApprovalFailure(verification: ExpectedMobileAgentVerification): boolean {
	return (
		verification.status === "address_mismatch" ||
		verification.status === "name_mismatch" ||
		verification.status === "expiry_mismatch" ||
		verification.status === "expired"
	);
}

export function MobileAgentSyncModal({ open, onOpenChange }: MobileAgentSyncModalProps) {
	const { walletAddress, hasWalletAccess } = useWalletSession();
	const { env } = useHyperliquid();
	const sessionKey = `${open ? "open" : "closed"}:${env}:${walletAddress?.toLowerCase() ?? "no-wallet"}:${hasWalletAccess}`;

	return (
		<MobileAgentSyncSession
			key={sessionKey}
			open={open}
			onOpenChange={onOpenChange}
			env={env}
			walletAddress={walletAddress}
			hasWalletAccess={hasWalletAccess}
		/>
	);
}

function MobileAgentSyncSession({
	open,
	onOpenChange,
	env,
	walletAddress,
	hasWalletAccess,
}: MobileAgentSyncSessionProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const { builderConfig, info } = useHyperliquid();
	const localAgent = useAgentWalletStorage(env, walletAddress);
	const approveAgent = useExplicitAgentApproval();
	const clearinghouseStateQuery = useInfo(
		"clearinghouseState",
		{ user: walletAddress ?? zeroAddress },
		{ enabled: open && hasWalletAccess, staleTime: 10_000 },
	);
	const spotStateQuery = useInfo(
		"spotClearinghouseState",
		{ user: walletAddress ?? zeroAddress },
		{ enabled: open && hasWalletAccess, staleTime: 10_000 },
	);
	const maxBuilderFeeQuery = useInfo(
		"maxBuilderFee",
		{ user: walletAddress ?? zeroAddress, builder: builderConfig?.b ?? zeroAddress },
		{ enabled: open && hasWalletAccess && !!builderConfig?.b, staleTime: 0 },
	);
	const extraAgentsQuery = useInfo(
		"extraAgents",
		{ user: walletAddress ?? zeroAddress },
		{ enabled: open && hasWalletAccess, staleTime: 0 },
	);
	const [syncState, setSyncState] = useState<SyncState>(() =>
		createSyncStateFromRecovery(walletAddress ? getDesktopApprovalRecovery(env, walletAddress) : null),
	);
	const [resetState, setResetState] = useState<ResetState>({ status: "idle" });
	const [, setRecoveryRevision] = useState(0);
	const activeOperationRef = useRef<AbortController | null>(null);
	const runPreflightRef = useRef<() => void>(() => {});
	const pageSafetyEpochRef = useRef(0);
	const qrCanvasRef = useRef<HTMLCanvasElement>(null);

	const visibleUrl = syncState.status === "visible" ? syncState.payload.url : null;
	const visibleAgentAddress = syncState.status === "visible" ? syncState.payload.agentAddress : null;
	const visibleExpiresAtMs = syncState.status === "visible" ? syncState.payload.expiresAtMs : null;
	const visiblePageSafetyEpoch = syncState.status === "visible" ? syncState.payload.pageSafetyEpoch : null;
	const visibleQrRendered = syncState.status === "visible" && syncState.payload.rendered;
	const visibleUntilMonotonicMs = syncState.status === "visible" ? syncState.payload.visibleUntilMonotonicMs : null;
	const hasUnsettledWalletAction =
		syncState.status === "approving" ||
		syncState.status === "verifying" ||
		resetState.status === "signing" ||
		resetState.status === "verifying";
	const hasRecoverableApproval = walletAddress ? hasDesktopApprovalRecovery(env, walletAddress) : false;
	const shouldWarnBeforeUnload = hasUnsettledWalletAction || hasRecoverableApproval;

	useEffect(() => {
		return () => {
			activeOperationRef.current?.abort();
			clearQrCanvas(qrCanvasRef.current);
		};
	}, []);

	useEffect(() => {
		function markPageUnsafe() {
			pageSafetyEpochRef.current++;
		}

		function handleVisibilityChange() {
			if (document.visibilityState !== "visible") markPageUnsafe();
		}

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("blur", markPageUnsafe);
		window.addEventListener("pagehide", markPageUnsafe);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("blur", markPageUnsafe);
			window.removeEventListener("pagehide", markPageUnsafe);
		};
	}, []);

	useBrowserLayoutEffect(() => {
		if (syncState.status !== "revalidating") return;
		const approval = syncState.approval;

		function concealPendingReveal() {
			activeOperationRef.current?.abort();
			activeOperationRef.current = null;
			clearQrCanvas(qrCanvasRef.current);
			setSyncState((current) => (current.status === "revalidating" ? { status: "concealed", approval } : current));
		}

		function handleVisibilityChange() {
			if (document.visibilityState !== "visible") concealPendingReveal();
		}

		if (!isQrPageActive()) {
			concealPendingReveal();
			return;
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("blur", concealPendingReveal);
		window.addEventListener("pagehide", concealPendingReveal);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("blur", concealPendingReveal);
			window.removeEventListener("pagehide", concealPendingReveal);
		};
	}, [syncState]);

	useEffect(() => {
		if (!shouldWarnBeforeUnload) return;

		function handleBeforeUnload(event: BeforeUnloadEvent) {
			event.preventDefault();
			event.returnValue = "";
		}

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [shouldWarnBeforeUnload]);

	useEffect(() => {
		const canvas = qrCanvasRef.current;
		if (!canvas || !visibleUrl || visibleExpiresAtMs === null || visibleUntilMonotonicMs === null) {
			clearQrCanvas(canvas);
			return;
		}
		const deadlines: QrDeadlines = { expiresAtMs: visibleExpiresAtMs, visibleUntilMonotonicMs };
		if (!isQrPageActive() || visiblePageSafetyEpoch !== pageSafetyEpochRef.current) {
			clearQrCanvas(canvas);
			return;
		}

		let cancelled = false;
		const qrText = visibleUrl;
		clearQrCanvas(canvas);

		async function renderQr() {
			try {
				const QRCode = await import("qrcode");
				await QRCode.toCanvas(canvas, qrText, {
					errorCorrectionLevel: "L",
					margin: 1,
					width: 320,
					color: {
						dark: "#111827",
						light: "#FFFFFF",
					},
				});
				if (cancelled || !isQrPageActive() || visiblePageSafetyEpoch !== pageSafetyEpochRef.current) {
					clearQrCanvas(canvas);
					return;
				}
				if (remainingQrLifetimeMs(deadlines) <= 0) {
					clearQrCanvas(canvas);
					return;
				}
				setSyncState((current) => {
					if (current.status !== "visible" || current.payload.url !== qrText) return current;
					return {
						status: "visible",
						payload: { ...current.payload, rendered: true },
					};
				});
			} catch {
				if (!cancelled) {
					clearQrCanvas(canvas);
					setSyncState({ status: "error", message: localizedMessage("qr-render-failed") });
				}
			}
		}

		renderQr();

		return () => {
			cancelled = true;
			clearQrCanvas(canvas);
		};
	}, [visibleExpiresAtMs, visiblePageSafetyEpoch, visibleUntilMonotonicMs, visibleUrl]);

	useEffect(() => {
		if (!walletAddress || !visibleAgentAddress || !visibleQrRendered) return;
		if (clearDesktopApprovalRecovery(env, walletAddress, visibleAgentAddress)) {
			setRecoveryRevision((current) => current + 1);
		}
	}, [env, visibleAgentAddress, visibleQrRendered, walletAddress]);

	useBrowserLayoutEffect(() => {
		if (!visibleUrl || visibleExpiresAtMs === null || visibleUntilMonotonicMs === null) return;
		const deadlines: QrDeadlines = { expiresAtMs: visibleExpiresAtMs, visibleUntilMonotonicMs };

		function expireQr() {
			activeOperationRef.current?.abort();
			activeOperationRef.current = null;
			clearQrCanvas(qrCanvasRef.current);
			setSyncState({ status: "idle" });
			setResetState({ status: "idle" });
			onOpenChange(false);
		}

		const timeoutId = window.setTimeout(expireQr, Math.max(0, remainingQrLifetimeMs(deadlines)));

		function handleVisibilityChange() {
			if (document.visibilityState !== "visible" || remainingQrLifetimeMs(deadlines) <= 0) expireQr();
		}

		if (!isQrPageActive() || visiblePageSafetyEpoch !== pageSafetyEpochRef.current) {
			window.clearTimeout(timeoutId);
			expireQr();
			return;
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("blur", expireQr);
		window.addEventListener("pagehide", expireQr);
		return () => {
			window.clearTimeout(timeoutId);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("blur", expireQr);
			window.removeEventListener("pagehide", expireQr);
		};
	}, [onOpenChange, visibleExpiresAtMs, visiblePageSafetyEpoch, visibleUntilMonotonicMs, visibleUrl]);

	function startOperation() {
		activeOperationRef.current?.abort();
		const controller = new AbortController();
		activeOperationRef.current = controller;
		return controller;
	}

	function finishOperation(controller: AbortController) {
		if (activeOperationRef.current === controller) activeOperationRef.current = null;
	}

	function resetAllState() {
		activeOperationRef.current?.abort();
		activeOperationRef.current = null;
		clearQrCanvas(qrCanvasRef.current);
		setSyncState({ status: "idle" });
		setResetState({ status: "idle" });
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && hasUnsettledWalletAction) return;
		if (!nextOpen) resetAllState();
		onOpenChange(nextOpen);
	}

	async function loadExtraAgents(): Promise<ExtraAgentsResponse | undefined> {
		const result = await extraAgentsQuery.refetch();
		if (result.error) throw result.error;
		return result.data;
	}

	async function verifyApproval(approval: MobileAgentApproval, signal: AbortSignal) {
		return waitForExpectedMobileAgent(loadExtraAgents, toExpectedAgent(approval), { signal });
	}

	async function keepApprovalSessionCurrent(
		lease: AgentRegistrationExecutionLease,
		approval: MobileAgentApproval,
	): Promise<boolean> {
		if (await isAgentRegistrationExecutionLeaseCurrent(lease)) return true;
		if (walletAddress) clearDesktopApprovalRecovery(env, walletAddress, approval.publicKey);
		setSyncState({ status: "error", message: localizedMessage("approval-recovery-inactive") });
		return false;
	}

	function retainApprovalForVerification(approval: MobileAgentApproval, message: MobileAgentSyncMessage) {
		const retained = updateDesktopApprovalRecovery({
			env,
			ownerAddress: walletAddress ?? zeroAddress,
			expectedAgentAddress: approval.publicKey,
			phase: "pending-verification",
			submissionErrorMessage: serializeRecoveryMessage(message),
		});
		if (!retained) {
			setSyncState({ status: "error", message: localizedMessage("approval-recovery-inactive") });
			return;
		}
		setSyncState({ status: "pending-verification", approval, message });
	}

	async function reconcileApproval(
		approval: MobileAgentApproval,
		signal: AbortSignal,
		registrationLease: AgentRegistrationExecutionLease,
		submissionErrorMessage?: MobileAgentSyncMessage,
	) {
		if (!(await keepApprovalSessionCurrent(registrationLease, approval))) return;
		if (approval.agentValidUntilMs <= Date.now()) {
			clearDesktopApprovalRecovery(env, walletAddress ?? zeroAddress, approval.publicKey);
			setSyncState({ status: "error", message: localizedMessage("mobile-key-expired") });
			return;
		}
		const recoveryBeforeVerification = getDesktopApprovalRecovery(env, walletAddress ?? zeroAddress);
		if (!recoveryBeforeVerification) {
			setSyncState({ status: "error", message: localizedMessage("approval-recovery-unavailable") });
			return;
		}

		const verification = await verifyApproval(approval, signal);
		if (verification.status === "aborted") return;
		if (verification.status === "approved") {
			if (!(await keepApprovalSessionCurrent(registrationLease, approval))) return;
			const retained = updateDesktopApprovalRecovery({
				env,
				ownerAddress: walletAddress ?? zeroAddress,
				expectedAgentAddress: approval.publicKey,
				phase: "approved-unrevealed",
			});
			if (!retained) {
				setSyncState({ status: "error", message: localizedMessage("approval-recovery-inactive") });
				return;
			}
			setSyncState({ status: "concealed", approval });
			return;
		}

		if (
			recoveryBeforeVerification.phase === "approved-unrevealed" &&
			isDefinitiveApprovalFailure(verification.lastVerification)
		) {
			clearDesktopApprovalRecovery(env, walletAddress ?? zeroAddress, approval.publicKey);
			setSyncState({
				status: "error",
				message: localizedMessage("mobile-key-invalidated"),
			});
			return;
		}

		retainApprovalForVerification(
			approval,
			submissionErrorMessage ?? localizedMessage("approval-verification-pending"),
		);
	}

	async function clearStoredMobileAccess(): Promise<boolean> {
		if (!walletAddress) return true;
		try {
			const target = isStoredMobileAgent(localAgent)
				? ({ kind: "public-key", publicKey: localAgent.publicKey } as const)
				: ({ kind: "absent-record" } as const);
			const cleanup = await cleanupAgentRegistrationIfMatches(env, walletAddress, target);
			return cleanup.status === "failed" || (cleanup.status === "cleaned" && cleanup.activeOwnerCleanupIncomplete);
		} catch {
			return true;
		}
	}

	async function runPreflight() {
		if (!MOBILE_PAIRING_FEATURES.createAndReveal) {
			setSyncState({ status: "error", message: localizedMessage("qr-creation-unavailable") });
			return;
		}
		if (!walletAddress || !hasWalletAccess) {
			setSyncState({
				status: "error",
				message: localizedMessage("wallet-required-link"),
			});
			return;
		}
		const existingRecovery = getDesktopApprovalRecovery(env, walletAddress);
		if (existingRecovery) {
			setSyncState(createSyncStateFromRecovery(existingRecovery));
			return;
		}
		if (hasDesktopApprovalRecovery(env, walletAddress)) {
			setSyncState({
				status: "error",
				message: localizedMessage("approval-already-preparing"),
			});
			return;
		}

		const operation = startOperation();
		setSyncState({ status: "checking" });

		try {
			const [clearinghouseResult, spotResult, builderFeeResult] = await Promise.all([
				clearinghouseStateQuery.refetch(),
				spotStateQuery.refetch(),
				builderConfig?.b ? maxBuilderFeeQuery.refetch() : Promise.resolve(null),
			]);
			if (operation.signal.aborted) return;
			if (clearinghouseResult.error) throw clearinghouseResult.error;
			if (spotResult.error) throw spotResult.error;
			if (builderFeeResult?.error) throw builderFeeResult.error;

			const hasFunding =
				hasPerpAccountFunding(clearinghouseResult.data) ||
				hasSpotAccountFunding(spotResult.data) ||
				(await hasBuilderDexAccountFunding(info, walletAddress, operation.signal));
			if (operation.signal.aborted) return;
			if (!hasFunding) {
				setSyncState({
					status: "error",
					message: localizedMessage("no-balance"),
				});
				return;
			}
			if (builderConfig?.b && !isBuilderFeeApproved(builderFeeResult?.data, builderConfig.f)) {
				setSyncState({
					status: "error",
					message: localizedMessage("builder-fee-required"),
				});
				return;
			}

			setSyncState({ status: "ready" });
		} catch {
			if (!operation.signal.aborted) {
				setSyncState({ status: "error", message: localizedMessage("account-check-failed") });
			}
		} finally {
			finishOperation(operation);
		}
	}

	async function handleApproveSync() {
		if (!MOBILE_PAIRING_FEATURES.createAndReveal) {
			setSyncState({ status: "error", message: localizedMessage("qr-creation-unavailable") });
			return;
		}
		if (!walletAddress || !hasWalletAccess || syncState.status !== "ready") {
			setSyncState({
				status: "error",
				message: localizedMessage("review-before-approve"),
			});
			return;
		}
		const registrationLease = captureAgentRegistrationExecutionLease(env, walletAddress);
		if (!registrationLease) {
			setSyncState({ status: "error", message: localizedMessage("approval-recovery-inactive") });
			return;
		}

		if (builderConfig?.b) {
			const preflightOperation = startOperation();
			setSyncState({ status: "checking" });
			try {
				const builderFeeResult = await maxBuilderFeeQuery.refetch();
				if (preflightOperation.signal.aborted) return;
				if (builderFeeResult.error) throw builderFeeResult.error;
				if (!isBuilderFeeApproved(builderFeeResult.data, builderConfig.f)) {
					setSyncState({
						status: "error",
						message: localizedMessage("builder-fee-required"),
					});
					return;
				}
			} catch (error) {
				if (!preflightOperation.signal.aborted) {
					setSyncState({ status: "error", message: externalErrorMessage(error) });
				}
				return;
			} finally {
				finishOperation(preflightOperation);
			}
		}

		let submission: ReturnType<typeof beginDesktopApprovalSubmission>;
		try {
			submission = beginDesktopApprovalSubmission({
				env,
				ownerAddress: walletAddress,
				createApproval: createMobileAgentApproval,
			});
		} catch (error) {
			setSyncState({ status: "error", message: externalErrorMessage(error) });
			return;
		}
		if (submission.status === "blocked") {
			setSyncState(
				submission.recovery
					? createSyncStateFromRecovery(submission.recovery)
					: { status: "error", message: localizedMessage("approval-already-in-progress") },
			);
			return;
		}
		if (submission.status === "capacity") {
			setSyncState({
				status: "error",
				message: localizedMessage("recovery-capacity"),
			});
			return;
		}

		const approval = submission.recovery.approval;
		const operation = startOperation();
		setSyncState({ status: "approving" });

		let submissionErrorMessage: MobileAgentSyncMessage | undefined;
		try {
			try {
				await approveAgent.mutateAsync(
					{
						agentAddress: approval.publicKey,
						agentName: approval.agentName,
					},
					{ signal: operation.signal },
				);
			} catch (error) {
				submissionErrorMessage = externalErrorMessage(error);
			}
			if (operation.signal.aborted) return;

			setSyncState({ status: "verifying" });
			await reconcileApproval(approval, operation.signal, registrationLease, submissionErrorMessage);
		} catch (error) {
			if (!operation.signal.aborted) {
				retainApprovalForVerification(approval, externalErrorMessage(error));
			}
		} finally {
			finishOperation(operation);
		}
	}

	async function handleRetryApprovalVerification() {
		if (!walletAddress || !hasWalletAccess || syncState.status !== "pending-verification") return;

		const approval = syncState.approval;
		const recovery = getDesktopApprovalRecovery(env, walletAddress);
		if (!recovery || recovery.approval.publicKey.toLowerCase() !== approval.publicKey.toLowerCase()) {
			setSyncState({ status: "error", message: localizedMessage("approval-recovery-unavailable") });
			return;
		}
		const registrationLease = captureAgentRegistrationExecutionLease(env, walletAddress);
		if (!registrationLease) {
			clearDesktopApprovalRecovery(env, walletAddress, approval.publicKey);
			setSyncState({ status: "error", message: localizedMessage("approval-recovery-inactive") });
			return;
		}

		const operation = startOperation();
		setSyncState({ status: "verifying" });
		try {
			await reconcileApproval(
				approval,
				operation.signal,
				registrationLease,
				deserializeRecoveryMessage(recovery.submissionErrorMessage),
			);
		} catch (error) {
			if (!operation.signal.aborted) {
				retainApprovalForVerification(approval, externalErrorMessage(error));
			}
		} finally {
			finishOperation(operation);
		}
	}

	async function handleRevealQr(approval: MobileAgentApproval) {
		if (!MOBILE_PAIRING_FEATURES.createAndReveal) {
			setSyncState({
				status: "concealed",
				approval,
				message: localizedMessage("qr-reveal-unavailable"),
			});
			return;
		}
		if (!walletAddress || !hasWalletAccess || syncState.status !== "concealed") return;
		if (!isQrPageActive()) {
			setSyncState({ status: "concealed", approval });
			return;
		}
		const registrationLease = captureAgentRegistrationExecutionLease(env, walletAddress);
		if (!registrationLease) {
			clearDesktopApprovalRecovery(env, walletAddress, approval.publicKey);
			setSyncState({ status: "error", message: localizedMessage("approval-recovery-inactive") });
			return;
		}

		const pageSafetyEpoch = pageSafetyEpochRef.current;
		const operation = startOperation();
		setSyncState({ status: "revalidating", approval });

		try {
			const recovery = getDesktopApprovalRecovery(env, walletAddress);
			if (!recovery || recovery.approval.publicKey.toLowerCase() !== approval.publicKey.toLowerCase()) {
				setSyncState({ status: "error", message: localizedMessage("approval-recovery-unavailable") });
				return;
			}
			const verification = await verifyApproval(approval, operation.signal);
			if (verification.status === "aborted") return;
			if (!(await keepApprovalSessionCurrent(registrationLease, approval))) return;
			if (!isQrPageActive() || pageSafetyEpoch !== pageSafetyEpochRef.current) {
				setSyncState({ status: "concealed", approval });
				return;
			}
			if (verification.status !== "approved") {
				if (
					approval.agentValidUntilMs <= Date.now() ||
					(recovery.phase === "approved-unrevealed" && isDefinitiveApprovalFailure(verification.lastVerification))
				) {
					clearDesktopApprovalRecovery(env, walletAddress, approval.publicKey);
					setSyncState({
						status: "error",
						message: localizedMessage("mobile-key-invalidated"),
					});
					return;
				}
				retainApprovalForVerification(approval, localizedMessage("approval-recheck-failed"));
				return;
			}

			const syncCreatedAtMs = Date.now();
			const syncUrl = await createMobileAgentSyncUrl({
				appOrigin: window.location.origin,
				env,
				userAddress: walletAddress,
				agentPrivateKey: approval.privateKey,
				agentName: approval.agentName,
				agentValidUntilMs: approval.agentValidUntilMs,
				nowMs: syncCreatedAtMs,
			});
			if (!(await keepApprovalSessionCurrent(registrationLease, approval))) return;
			if (operation.signal.aborted || !isQrPageActive() || pageSafetyEpoch !== pageSafetyEpochRef.current) {
				setSyncState({ status: "concealed", approval });
				return;
			}
			if (syncUrl.expiresAtMs <= Date.now()) {
				setSyncState({ status: "concealed", approval });
				return;
			}

			setSyncState({
				status: "visible",
				payload: {
					agentAddress: approval.publicKey,
					syncId: syncUrl.syncId,
					url: syncUrl.url,
					expiresAtMs: syncUrl.expiresAtMs,
					pageSafetyEpoch,
					rendered: false,
					visibleUntilMonotonicMs: performance.now() + MOBILE_SYNC_QR_VISIBLE_MS,
				},
			});
		} catch (error) {
			if (!operation.signal.aborted) {
				setSyncState({
					status: "concealed",
					approval,
					message: externalErrorMessage(error),
				});
			}
		} finally {
			finishOperation(operation);
		}
	}

	async function handleReviewRevocation() {
		if (!walletAddress || !hasWalletAccess) {
			setResetState({
				status: "error",
				message: localizedMessage("wallet-required-reset"),
			});
			return;
		}

		const operation = startOperation();
		clearQrCanvas(qrCanvasRef.current);
		setSyncState({ status: "idle" });
		setResetState({ status: "checking" });

		try {
			const extraAgents = await loadExtraAgents();
			if (operation.signal.aborted) return;
			if (!extraAgents) {
				setResetState({ status: "error", message: localizedMessage("verify-mobile-access-failed") });
				return;
			}

			const recovery = getDesktopApprovalRecovery(env, walletAddress);
			const oldAgentAddresses = [
				...extraAgents
					.filter((agent) => agent.name === MOBILE_AGENT_NAME_BASE)
					.map((agent) => agent.address.toLowerCase()),
				...(recovery ? [recovery.approval.publicKey.toLowerCase()] : []),
				...(isStoredMobileAgent(localAgent) ? [localAgent.publicKey.toLowerCase()] : []),
			].filter((address, index, addresses) => addresses.indexOf(address) === index);

			setResetState({ status: "confirm", oldAgentAddresses });
		} catch (error) {
			if (!operation.signal.aborted) {
				setResetState({ status: "error", message: externalErrorMessage(error) });
			}
		} finally {
			finishOperation(operation);
		}
	}

	async function verifyRevocation(
		oldAgentAddresses: string[],
		replacement: ExpectedRevocationAgent,
		signal: AbortSignal,
	) {
		const verification = await waitForExpectedMobileAgent(loadExtraAgents, replacement, {
			signal,
			now: () => 0,
			acceptExtraAgents: (extraAgents) =>
				!extraAgents.some((agent) =>
					oldAgentAddresses.some((oldAddress) => oldAddress === agent.address.toLowerCase()),
				),
		});
		if (verification.status === "approved") {
			return { status: "approved" as const, replacementExpiresAtMs: replacement.agentValidUntilMs };
		}
		if (verification.status === "aborted" || signal.aborted) {
			return { status: "aborted" as const };
		}
		return replacement.agentValidUntilMs <= Date.now()
			? { status: "expired-unverified" as const }
			: { status: "unverified" as const };
	}

	async function completeRevocation(replacementExpiresAtMs: number | null) {
		if (walletAddress) clearDesktopApprovalRecovery(env, walletAddress);
		const localCleanupIncomplete = await clearStoredMobileAccess();
		setSyncState({ status: "idle" });
		setResetState({ status: "success", replacementExpiresAtMs, localCleanupIncomplete });
	}

	async function handleConfirmRevocation() {
		if (!walletAddress || !hasWalletAccess || resetState.status !== "confirm") return;

		const oldAgentAddresses = resetState.oldAgentAddresses;
		const revocation = createMobileAgentRevocationApproval();
		const replacement = toExpectedAgent(revocation);
		const operation = startOperation();
		setResetState({ status: "signing", oldAgentAddresses });

		let submissionError: unknown;
		try {
			await approveAgent.mutateAsync(
				{
					agentAddress: revocation.publicKey,
					agentName: revocation.agentName,
				},
				{ signal: operation.signal },
			);
		} catch (error) {
			submissionError = error;
		}

		if (operation.signal.aborted) return;
		setResetState({ status: "verifying", oldAgentAddresses, replacement });

		try {
			const verification = await verifyRevocation(oldAgentAddresses, replacement, operation.signal);
			if (verification.status === "aborted") return;
			if (verification.status === "approved") {
				await completeRevocation(verification.replacementExpiresAtMs);
				return;
			}
			if (verification.status === "expired-unverified") {
				setResetState({
					status: "error",
					message: localizedMessage("revocation-expired"),
				});
				return;
			}

			setResetState({
				status: "pending",
				oldAgentAddresses,
				replacement,
				message: submissionError ? externalErrorMessage(submissionError) : localizedMessage("revocation-pending"),
			});
		} finally {
			finishOperation(operation);
		}
	}

	async function handleRetryRevocationVerification() {
		if (resetState.status !== "pending") return;

		const { oldAgentAddresses, replacement, message } = resetState;
		const operation = startOperation();
		setResetState({ status: "verifying", oldAgentAddresses, replacement });

		try {
			const verification = await verifyRevocation(oldAgentAddresses, replacement, operation.signal);
			if (verification.status === "aborted") return;
			if (verification.status === "approved") {
				await completeRevocation(verification.replacementExpiresAtMs);
				return;
			}
			if (verification.status === "expired-unverified") {
				setResetState({
					status: "error",
					message: localizedMessage("revocation-expired"),
				});
				return;
			}
			setResetState({ status: "pending", oldAgentAddresses, replacement, message });
		} finally {
			finishOperation(operation);
		}
	}

	const isSyncPending =
		syncState.status === "checking" ||
		syncState.status === "approving" ||
		syncState.status === "verifying" ||
		syncState.status === "revalidating";
	const isResetPending =
		resetState.status === "checking" ||
		resetState.status === "signing" ||
		resetState.status === "verifying" ||
		approveAgent.isPending;
	const resetBlocksSync =
		resetState.status === "checking" ||
		resetState.status === "confirm" ||
		resetState.status === "signing" ||
		resetState.status === "verifying" ||
		resetState.status === "pending";
	const showFooter =
		MOBILE_PAIRING_FEATURES.createAndReveal &&
		syncState.status !== "pending-verification" &&
		syncState.status !== "concealed" &&
		syncState.status !== "revalidating" &&
		syncState.status !== "visible";
	const shouldRunPreflight =
		open &&
		MOBILE_PAIRING_FEATURES.createAndReveal &&
		!!walletAddress &&
		hasWalletAccess &&
		syncState.status === "idle" &&
		!resetBlocksSync;
	const canRetryPreflight = syncState.status === "error";
	const canApprove = syncState.status === "ready" && !resetBlocksSync && !!walletAddress && hasWalletAccess;
	const existingMobileAgentAddress = findExistingMobileAgentAddress(extraAgentsQuery.data, extraAgentsQuery.error);

	useEffect(() => {
		runPreflightRef.current = runPreflight;
	});

	useEffect(() => {
		if (!shouldRunPreflight) return;
		runPreflightRef.current();
	}, [shouldRunPreflight]);

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={handleOpenChange}
			size="md"
			closeLabel={t`Close`}
			presentation={isMobile ? "drawer" : "modal"}
			className="max-h-[min(92dvh,48rem)]"
		>
			<ModalHeader>
				<div className="flex items-center gap-2">
					<DeviceMobileIcon className="size-4 text-signal" weight="duotone" aria-hidden />
					<ModalTitle>
						<Trans>Link mobile device</Trans>
					</ModalTitle>
				</div>
				<ModalDescription>
					<Trans>Approve a trading key on this desktop and move it to your phone only through the QR code.</Trans>
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4">
				<div className="flex items-center justify-between gap-3 text-xs">
					<span className="text-fg-muted">
						<Trans>Master wallet</Trans>
					</span>
					<span className="min-w-0 truncate font-medium text-fg">
						{walletAddress && hasWalletAccess ? (
							<>
								<span className="font-mono">
									<bdi dir="ltr">{shortenAddress(walletAddress)}</bdi>
								</span>
								<span className="text-fg-muted"> · {env}</span>
							</>
						) : (
							<Trans>Wallet approval unavailable</Trans>
						)}
					</span>
				</div>

				{hasUnsettledWalletAction && (
					<output className="block rounded-16 border border-stroke-info-weak bg-info-soft p-3 text-xs text-info">
						<Trans>Keep this window open until Hyperliquid finishes checking the wallet action.</Trans>
					</output>
				)}

				{syncState.status === "error" && <InlineError message={syncState.message} />}

				{syncState.status === "pending-verification" ? (
					<PendingApprovalVerificationPanel state={syncState} onRetry={handleRetryApprovalVerification} />
				) : !MOBILE_PAIRING_FEATURES.createAndReveal ? (
					<PairingUnavailablePanel />
				) : syncState.status === "concealed" || syncState.status === "revalidating" ? (
					<ConcealedQrPanel state={syncState} onReveal={handleRevealQr} />
				) : syncState.status === "visible" ? (
					<VisibleQrPanel key={syncState.payload.syncId} payload={syncState.payload} canvasRef={qrCanvasRef} />
				) : (
					<PreApprovalPanel existingMobileAgentAddress={existingMobileAgentAddress} />
				)}

				<ResetMobileAccessPanel
					state={resetState}
					disabled={isSyncPending || isResetPending || !walletAddress || !hasWalletAccess}
					onReview={handleReviewRevocation}
					onConfirm={handleConfirmRevocation}
					onRetryVerification={handleRetryRevocationVerification}
				/>
			</ModalContent>

			{showFooter && (
				<ModalFooter className="border-t border-stroke-weak">
					<Button
						type="button"
						variant="filled"
						intent="brand"
						size="sm"
						onClick={canRetryPreflight ? runPreflight : handleApproveSync}
						disabled={!(canApprove || canRetryPreflight)}
						iconLeft={
							isSyncPending ? (
								<SpinnerGapIcon className="size-3.5 animate-spin" />
							) : (
								<ShieldCheckIcon className="size-3.5" />
							)
						}
					>
						<PrimaryButtonLabel status={syncState.status} />
					</Button>
				</ModalFooter>
			)}
		</AdaptiveModal>
	);
}

function PrimaryButtonLabel({ status }: { status: SyncState["status"] }) {
	const { t } = useLingui();
	if (status === "checking") return t`Checking account...`;
	if (status === "approving") return t`Approve QR code with wallet...`;
	if (status === "verifying") return t`Verifying approval...`;
	if (status === "error") return t`Retry check`;
	return t`Approve mobile trading key`;
}

function MobileAgentSyncMessageText({ message }: { message: MobileAgentSyncMessage }) {
	const { t } = useLingui();
	if (message.kind === "external-error") {
		return formatTransferError(new Error(message.rawMessage));
	}

	switch (message.code) {
		case "account-check-failed":
			return t`Could not check this account on Hyperliquid. Nothing was signed. Retry the check.`;
		case "approval-already-in-progress":
			return t`Another mobile approval is already in progress for this wallet.`;
		case "approval-already-preparing":
			return t`Another mobile approval is being prepared for this wallet.`;
		case "approval-recheck-failed":
			return t`The approval could not be rechecked. The QR remains hidden until read-only verification succeeds.`;
		case "approval-recovery-inactive":
			return t`This approval recovery is no longer active.`;
		case "approval-recovery-unavailable":
			return t`This approval recovery is no longer available.`;
		case "approval-verification-pending":
			return t`The approval result is not confirmed. Retry the read-only verification before doing anything else.`;
		case "builder-fee-required":
			return t`Enable trading and approve the builder fee on this desktop before linking a phone.`;
		case "mobile-key-expired":
			return t`This mobile trading key has expired.`;
		case "mobile-key-invalidated":
			return t`Hyperliquid reports that this trading key was replaced, changed, or expired.`;
		case "no-balance":
			return t`No balance on Hyperliquid. Deposit first.`;
		case "qr-creation-unavailable":
			return t`Mobile QR creation is temporarily unavailable.`;
		case "qr-render-failed":
			return t`Could not render QR. Create a new key.`;
		case "qr-reveal-unavailable":
			return t`Mobile QR reveal is temporarily unavailable. Revoke this key if you no longer need it.`;
		case "recovery-capacity":
			return t`Too many mobile approvals are awaiting recovery in this tab. Resolve or revoke one first.`;
		case "review-before-approve":
			return t`Wait for the account check to finish before approving a mobile trading key.`;
		case "revocation-expired":
			return t`The replacement expired before Hyperliquid confirmed it. Review and sign a new revocation.`;
		case "revocation-pending":
			return t`Revocation was submitted but is not yet confirmed.`;
		case "verify-mobile-access-failed":
			return t`Could not verify current mobile access.`;
		case "wallet-required-link":
			return t`Connect the selected master wallet before linking a mobile device.`;
		case "wallet-required-reset":
			return t`Connect the selected master wallet before resetting mobile access.`;
	}
}

function PendingApprovalVerificationPanel({
	state,
	onRetry,
}: {
	state: Extract<SyncState, { status: "pending-verification" }>;
	onRetry: () => void;
}) {
	return (
		<div className="space-y-3 rounded-16 border border-stroke-error-weak bg-error-soft p-3 text-xs text-error">
			<div className="flex items-start gap-2">
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
				<div className="space-y-1">
					<p className="font-semibold">
						<Trans>Approval verification pending</Trans>
					</p>
					<p>
						<MobileAgentSyncMessageText message={state.message} />
					</p>
					<p>
						<Trans>The generated key remains only in this tab. Do not approve another key or reload the page.</Trans>
					</p>
				</div>
			</div>
			<Button type="button" variant="outline" intent="error" size="sm" onClick={onRetry}>
				<Trans>Retry read-only verification</Trans>
			</Button>
		</div>
	);
}

function PairingUnavailablePanel() {
	return (
		<div className="flex items-start gap-3 rounded-16 border border-stroke-info-weak bg-info-soft p-3">
			<WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-icon-info" weight="duotone" aria-hidden />
			<div className="min-w-0 space-y-1">
				<p className="text-sm font-semibold text-fg">
					<Trans>New mobile pairing is temporarily unavailable</Trans>
				</p>
				<p className="text-xs text-fg-muted">
					<Trans>You can still verify and revoke existing mobile access below.</Trans>
				</p>
			</div>
		</div>
	);
}

function PreApprovalPanel({ existingMobileAgentAddress }: { existingMobileAgentAddress: Address | null }) {
	const existingMobileAgentLabel = existingMobileAgentAddress ? shortenAddress(existingMobileAgentAddress) : null;

	return (
		<div className="space-y-3 rounded-16 border border-stroke-weak p-3">
			<div className="flex items-start gap-3">
				<ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-signal" weight="duotone" aria-hidden />
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-semibold text-fg">
						<Trans>Approve a mobile trading key</Trans>
					</p>
					<p className="text-xs text-fg-muted">
						<Trans>
							The key can trade on this account (orders, cancels, leverage, vault and sub-account moves) but cannot
							withdraw or send funds out of Hyperliquid; withdrawals and sends still need this master wallet.
						</Trans>
					</p>
				</div>
			</div>
			<ul className="list-disc space-y-1 ps-5 text-xs text-fg-muted">
				<li>
					<Trans>The private key is created on this desktop and embedded in the QR code.</Trans>
				</li>
				<li>
					<Trans>Anyone who scans or captures the QR can trade as this Agent.</Trans>
				</li>
				<li>
					<Trans>Approving a new mobile key replaces the previous mobile key.</Trans>
				</li>
			</ul>
			{existingMobileAgentLabel && (
				<p className="text-xs text-fg-muted">
					<Trans>
						Replaces the current mobile key{" "}
						<bdi dir="ltr" className="font-mono text-fg">
							{existingMobileAgentLabel}
						</bdi>
					</Trans>
				</p>
			)}
		</div>
	);
}

function PhoneJourneyInstruction() {
	return (
		<p className="text-xs text-fg-muted">
			<Trans>
				On your phone, open gatu, tap Connect, then Link Desktop Wallet and scan this code, or scan it with your phone
				camera.
			</Trans>
		</p>
	);
}

function HoldProgressRing({ progressPercent }: { progressPercent: number }) {
	const { t } = useLingui();

	return (
		<span
			role="progressbar"
			aria-label={t`QR reveal progress`}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(progressPercent)}
			className="inline-flex size-3.5 shrink-0"
		>
			<svg viewBox="0 0 24 24" aria-hidden="true" className="size-full origin-center -rotate-90">
				<circle cx={12} cy={12} r={HOLD_RING_RADIUS} fill="none" stroke="currentColor" strokeWidth={3} opacity={0.25} />
				<circle
					cx={12}
					cy={12}
					r={HOLD_RING_RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth={3}
					strokeLinecap="round"
					strokeDasharray={HOLD_RING_CIRCUMFERENCE}
					strokeDashoffset={HOLD_RING_CIRCUMFERENCE * (1 - progressPercent / 100)}
					className="text-signal transition-[stroke-dashoffset] duration-100"
				/>
			</svg>
		</span>
	);
}

function ConcealedQrPanel({
	state,
	onReveal,
}: {
	state: Extract<SyncState, { status: "concealed" | "revalidating" }>;
	onReveal: (approval: MobileAgentApproval) => void;
}) {
	const { t } = useLingui();
	const isRevalidating = state.status === "revalidating";
	const approval = state.approval;
	const descriptionId = useId();
	const { handlers, isHolding, progressPercent } = usePressAndHold({
		disabled: isRevalidating,
		durationMs: QR_REVEAL_HOLD_MS,
		onComplete: () => onReveal(approval),
	});
	const remainingSeconds = Math.max(1, Math.ceil((QR_REVEAL_HOLD_MS * (1 - progressPercent / 100)) / 1_000));

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2 rounded-16 border border-stroke-success-weak bg-success-soft p-3">
				<CheckIcon className="mt-0.5 size-4 shrink-0 text-success" weight="bold" aria-hidden />
				<div className="min-w-0">
					<p className="text-sm font-semibold text-fg">
						<Trans>Trading key approved</Trans>
					</p>
					<p className="mt-0.5 text-xs text-fg-muted">
						<Trans>The QR stays hidden until you deliberately reveal it.</Trans>
					</p>
				</div>
			</div>

			{state.status === "concealed" && state.message && <InlineError message={state.message} />}

			<PhoneJourneyInstruction />

			<div className="flex items-start gap-2 rounded-16 border border-stroke-error-weak bg-error-soft p-3 text-xs text-error">
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
				<p>
					<Trans>
						This QR enables trading on your phone, but not deposits or withdrawals. Do not share the QR or screenshots
						of it with anyone. Make sure you are not sharing your screen.
					</Trans>
				</p>
			</div>

			<div className="rounded-16 border border-stroke-weak p-3">
				<p className="text-sm font-semibold text-fg">
					<Trans>Hold to reveal QR</Trans>
				</p>
				<p id={descriptionId} className="mt-1 text-xs text-fg-muted">
					<Trans>Keep holding for 4 seconds. Release, leave, blur, or press Escape to cancel.</Trans>
				</p>
				<Button
					type="button"
					variant="outline"
					intent="neutral"
					size="sm"
					disabled={isRevalidating}
					aria-describedby={descriptionId}
					aria-label={t`Hold for 4 seconds to reveal phone access QR`}
					className="mt-3 w-full touch-none select-none"
					iconLeft={
						isRevalidating ? (
							<SpinnerGapIcon className="size-3.5 animate-spin" />
						) : (
							<HoldProgressRing progressPercent={progressPercent} />
						)
					}
					{...handlers}
				>
					{isRevalidating ? (
						<Trans>Rechecking approval...</Trans>
					) : isHolding ? (
						<Trans>Keep holding... {remainingSeconds}s</Trans>
					) : (
						<Trans>Press and hold for 4 seconds</Trans>
					)}
				</Button>
			</div>
		</div>
	);
}

function VisibleQrPanel({
	payload,
	canvasRef,
}: {
	payload: QrPayload;
	canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
	const { t } = useLingui();
	const [announcedSeconds] = useState(() => remainingQrLifetimeSeconds(payload));
	const [remainingSeconds, setRemainingSeconds] = useState(announcedSeconds);
	const { expiresAtMs, visibleUntilMonotonicMs } = payload;

	useEffect(() => {
		const deadlines: QrDeadlines = { expiresAtMs, visibleUntilMonotonicMs };
		setRemainingSeconds(remainingQrLifetimeSeconds(deadlines));
		const intervalId = window.setInterval(() => {
			setRemainingSeconds(remainingQrLifetimeSeconds(deadlines));
		}, 1_000);
		return () => window.clearInterval(intervalId);
	}, [expiresAtMs, visibleUntilMonotonicMs]);

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2 rounded-16 border border-stroke-error-weak bg-error-soft p-3 text-xs text-error">
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
				<p>
					<Trans>Scan only with your phone. Anyone who captures this QR can use the trading key.</Trans>
				</p>
			</div>

			<PhoneJourneyInstruction />

			<div className="rounded-16 border border-stroke-weak p-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="text-sm font-semibold text-fg">
							<Trans>Scan on your phone</Trans>
						</p>
						<p role="timer" className="mt-0.5 text-xs text-fg-muted tabular-nums">
							<Trans>Closes in {remainingSeconds}s</Trans>
						</p>
						<output className="sr-only">
							<Trans>The QR closes automatically in about {announcedSeconds} seconds</Trans>
						</output>
					</div>
					{!payload.rendered && (
						<SpinnerGapIcon className="size-4 animate-spin text-signal" aria-label={t`Rendering QR`} />
					)}
				</div>
				<div className="mt-3 flex justify-center rounded-16 border border-stroke-weak bg-white p-3">
					<canvas ref={canvasRef} aria-label={t`Phone access QR code`} className="size-80 max-w-full" />
				</div>
			</div>
		</div>
	);
}

function InlineError({ message }: { message: MobileAgentSyncMessage }) {
	return (
		<div
			role="alert"
			className="flex items-start gap-2 rounded-16 border border-stroke-error-weak bg-error-soft p-3 text-xs text-error"
		>
			<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
			<p>
				<MobileAgentSyncMessageText message={message} />
			</p>
		</div>
	);
}

function ResetMobileAccessPanel({
	state,
	disabled,
	onReview,
	onConfirm,
	onRetryVerification,
}: {
	state: ResetState;
	disabled: boolean;
	onReview: () => void;
	onConfirm: () => void;
	onRetryVerification: () => void;
}) {
	const { i18n } = useLingui();
	const expiresAtLabel =
		state.status === "success" && state.replacementExpiresAtMs !== null
			? formatTime(state.replacementExpiresAtMs, { locale: i18n.locale, hour: "2-digit", minute: "2-digit" })
			: null;
	const isBusy = state.status === "checking" || state.status === "signing" || state.status === "verifying";

	return (
		<div className="rounded-16 border border-stroke-weak p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-semibold text-fg">
						<Trans>Revoke mobile access</Trans>
					</p>
					<p className="text-xs text-fg-muted">
						<Trans>Replaces the current mobile Agent with a temporary inaccessible key.</Trans>
					</p>
				</div>
				{state.status !== "confirm" && state.status !== "pending" && (
					<Button
						type="button"
						variant="outline"
						intent="error"
						size="sm"
						disabled={disabled}
						onClick={onReview}
						iconLeft={
							isBusy ? <SpinnerGapIcon className="size-3.5 animate-spin" /> : <WarningCircleIcon className="size-3.5" />
						}
					>
						{isBusy ? <Trans>Checking...</Trans> : <Trans>Review revoke</Trans>}
					</Button>
				)}
			</div>

			{state.status === "confirm" && (
				<div className="mt-3 space-y-2 rounded-16 border border-stroke-error-weak bg-error-soft p-2.5 text-xs text-error">
					<p>
						<Trans>
							This will replace any current mobile trading key with an inaccessible key. Existing phones will stop
							trading after Hyperliquid confirms the replacement.
						</Trans>
					</p>
					<Button type="button" variant="filled" intent="error" size="sm" onClick={onConfirm}>
						<Trans>Confirm revoke in wallet</Trans>
					</Button>
				</div>
			)}

			{state.status === "pending" && (
				<div className="mt-3 space-y-2 rounded-16 border border-stroke-error-weak bg-error-soft p-2.5 text-xs text-error">
					<p>
						<MobileAgentSyncMessageText message={state.message} />
					</p>
					<p>
						<Trans>Do not submit another revocation. Retry the read-only verification.</Trans>
					</p>
					<Button type="button" variant="outline" intent="error" size="sm" onClick={onRetryVerification}>
						<Trans>Retry verification</Trans>
					</Button>
				</div>
			)}

			{state.status === "success" && (
				<div className="mt-3 flex items-start gap-2 rounded-16 border border-stroke-success-weak bg-success-soft p-2.5 text-xs text-fg-muted">
					<CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" weight="bold" aria-hidden />
					<p>
						{expiresAtLabel ? (
							<Trans>Mobile access revoked. The inaccessible replacement expires at {expiresAtLabel}.</Trans>
						) : state.localCleanupIncomplete ? (
							<Trans>No approved mobile Agent remains.</Trans>
						) : (
							<Trans>No approved mobile Agent remains. Local mobile access was cleared.</Trans>
						)}
					</p>
				</div>
			)}
			{state.status === "success" && state.localCleanupIncomplete && (
				<div className="mt-2 flex items-start gap-2 rounded-16 border border-stroke-error-weak bg-error-soft p-2.5 text-xs text-error">
					<WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" weight="fill" aria-hidden />
					<p>
						<Trans>
							Remote access is revoked, but this browser could not fully clear its local mobile state. Clear this site's
							data before using mobile access here again.
						</Trans>
					</p>
				</div>
			)}

			{state.status === "error" && <InlineError message={state.message} />}
		</div>
	);
}
