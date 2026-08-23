import { cleanupAgentRegistrationIfMatches } from "@gatu/hl-react";
import {
	createMobileAgentApproval,
	createMobileAgentRevocationApproval,
	type ExpectedMobileAgentVerification,
	isStoredMobileAgent,
	MOBILE_AGENT_NAME_BASE,
	type MobileAgentApproval,
} from "@gatu/hl-react/signing/mobile-agent";
import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import {
	CheckIcon,
	DeviceMobileIcon,
	QrCodeIcon,
	ShieldCheckIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { usePressAndHold } from "@/hooks/ui/use-press-and-hold";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError } from "@/lib/errors/format";
import { shortenAddress } from "@/lib/format";
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
	beginDesktopApprovalSubmission,
	clearDesktopApprovalRecovery,
	type DesktopApprovalRecovery,
	getDesktopApprovalRecovery,
	hasDesktopApprovalRecovery,
	updateDesktopApprovalRecovery,
} from "@/lib/mobile-sync/desktop-approval-recovery";
import { registerMobileSyncTicket } from "@/lib/mobile-sync/one-time-ticket-client";
import { waitForExpectedMobileAgent } from "@/lib/mobile-sync/remote-verification";
import { createMobileAgentSyncUrl } from "@/lib/mobile-sync/sync-core";

interface MobileAgentSyncModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface MobileAgentSyncSessionProps extends MobileAgentSyncModalProps {
	env: HyperliquidEnv;
	hasWalletAccess: boolean;
	walletAddress: Address | undefined;
}

interface QrPayload {
	agentAddress: Address;
	expiresAtMs: number;
	pageSafetyEpoch: number;
	rendered: boolean;
	ticketExpiresAtMonotonicMs: number;
	ticketExpiresAtWallClockMs: number;
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
	| { status: "review" }
	| { status: "approving" }
	| { status: "verifying" }
	| { status: "pending-verification"; approval: MobileAgentApproval; message: string }
	| { status: "concealed"; approval: MobileAgentApproval; message?: string }
	| { status: "revalidating"; approval: MobileAgentApproval }
	| { status: "visible"; payload: QrPayload }
	| { status: "error"; message: string };

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
			message: string;
	  }
	| { status: "success"; localCleanupIncomplete: boolean; replacementExpiresAtMs: number | null }
	| { status: "error"; message: string };

const QR_REVEAL_HOLD_MS = 4_000;
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function normalizeError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function parseNumeric(value: unknown): number | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function hasNonZeroNumeric(value: unknown): boolean {
	const numeric = parseNumeric(value);
	return numeric !== null && numeric !== 0;
}

function hasPositiveNumeric(value: unknown): boolean {
	const numeric = parseNumeric(value);
	return numeric !== null && numeric > 0;
}

function hasHyperliquidAccountFunding(clearinghouseState: unknown, spotState: unknown): boolean {
	const clearinghouse = clearinghouseState as
		| {
				assetPositions?: unknown[];
				marginSummary?: { accountValue?: unknown; totalRawUsd?: unknown; totalNtlPos?: unknown };
				withdrawable?: unknown;
		  }
		| undefined;
	const spot = spotState as { balances?: Array<{ total?: unknown; hold?: unknown }> } | undefined;

	return (
		hasNonZeroNumeric(clearinghouse?.marginSummary?.accountValue) ||
		hasNonZeroNumeric(clearinghouse?.marginSummary?.totalRawUsd) ||
		hasNonZeroNumeric(clearinghouse?.marginSummary?.totalNtlPos) ||
		hasNonZeroNumeric(clearinghouse?.withdrawable) ||
		(clearinghouse?.assetPositions?.length ?? 0) > 0 ||
		(spot?.balances ?? []).some((balance) => hasPositiveNumeric(balance.total) || hasPositiveNumeric(balance.hold))
	);
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
		message:
			recovery.submissionErrorMessage ??
			t`The approval result is not confirmed. Retry the read-only verification before doing anything else.`,
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
	const isMobile = useIsMobile();
	const { builderConfig } = useHyperliquid();
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
	const pageSafetyEpochRef = useRef(0);
	const qrCanvasRef = useRef<HTMLCanvasElement>(null);

	const visibleUrl = syncState.status === "visible" ? syncState.payload.url : null;
	const visibleAgentAddress = syncState.status === "visible" ? syncState.payload.agentAddress : null;
	const visibleExpiresAtMs = syncState.status === "visible" ? syncState.payload.expiresAtMs : null;
	const visiblePageSafetyEpoch = syncState.status === "visible" ? syncState.payload.pageSafetyEpoch : null;
	const visibleQrRendered = syncState.status === "visible" && syncState.payload.rendered;
	const visibleTicketExpiresAtMonotonicMs =
		syncState.status === "visible" ? syncState.payload.ticketExpiresAtMonotonicMs : null;
	const visibleTicketExpiresAtWallClockMs =
		syncState.status === "visible" ? syncState.payload.ticketExpiresAtWallClockMs : null;
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
		if (
			!canvas ||
			!visibleUrl ||
			visibleExpiresAtMs === null ||
			visibleTicketExpiresAtMonotonicMs === null ||
			visibleTicketExpiresAtWallClockMs === null
		) {
			clearQrCanvas(canvas);
			return;
		}
		const envelopeExpiresAtMs = visibleExpiresAtMs;
		const ticketExpiresAtMonotonicMs = visibleTicketExpiresAtMonotonicMs;
		const ticketExpiresAtWallClockMs = visibleTicketExpiresAtWallClockMs;
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
				if (
					Date.now() >= Math.min(envelopeExpiresAtMs, ticketExpiresAtWallClockMs) ||
					performance.now() >= ticketExpiresAtMonotonicMs
				) {
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
					setSyncState({ status: "error", message: t`Could not render QR. Create a new key.` });
				}
			}
		}

		renderQr();

		return () => {
			cancelled = true;
			clearQrCanvas(canvas);
		};
	}, [
		visibleExpiresAtMs,
		visiblePageSafetyEpoch,
		visibleTicketExpiresAtMonotonicMs,
		visibleTicketExpiresAtWallClockMs,
		visibleUrl,
	]);

	useEffect(() => {
		if (!walletAddress || !visibleAgentAddress || !visibleQrRendered) return;
		if (clearDesktopApprovalRecovery(env, walletAddress, visibleAgentAddress)) {
			setRecoveryRevision((current) => current + 1);
		}
	}, [env, visibleAgentAddress, visibleQrRendered, walletAddress]);

	useBrowserLayoutEffect(() => {
		if (
			!visibleUrl ||
			visibleExpiresAtMs === null ||
			visibleTicketExpiresAtMonotonicMs === null ||
			visibleTicketExpiresAtWallClockMs === null
		) {
			return;
		}
		const envelopeExpiresAtMs = visibleExpiresAtMs;
		const ticketExpiresAtMonotonicMs = visibleTicketExpiresAtMonotonicMs;
		const ticketExpiresAtWallClockMs = visibleTicketExpiresAtWallClockMs;

		function expireQr() {
			activeOperationRef.current?.abort();
			activeOperationRef.current = null;
			clearQrCanvas(qrCanvasRef.current);
			setSyncState({ status: "idle" });
			setResetState({ status: "idle" });
			onOpenChange(false);
		}

		function remainingQrLifetimeMs() {
			return Math.min(
				envelopeExpiresAtMs - Date.now(),
				ticketExpiresAtMonotonicMs - performance.now(),
				ticketExpiresAtWallClockMs - Date.now(),
			);
		}

		const timeoutId = window.setTimeout(expireQr, Math.max(0, remainingQrLifetimeMs()));

		function handleVisibilityChange() {
			if (document.visibilityState !== "visible" || remainingQrLifetimeMs() <= 0) expireQr();
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
	}, [
		onOpenChange,
		visibleExpiresAtMs,
		visiblePageSafetyEpoch,
		visibleTicketExpiresAtMonotonicMs,
		visibleTicketExpiresAtWallClockMs,
		visibleUrl,
	]);

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
		setSyncState({ status: "error", message: t`This approval recovery is no longer active.` });
		return false;
	}

	function retainApprovalForVerification(approval: MobileAgentApproval, message: string) {
		const retained = updateDesktopApprovalRecovery({
			env,
			ownerAddress: walletAddress ?? zeroAddress,
			expectedAgentAddress: approval.publicKey,
			phase: "pending-verification",
			submissionErrorMessage: message,
		});
		if (!retained) {
			setSyncState({ status: "error", message: t`This approval recovery is no longer active.` });
			return;
		}
		setSyncState({ status: "pending-verification", approval, message });
	}

	async function reconcileApproval(
		approval: MobileAgentApproval,
		signal: AbortSignal,
		registrationLease: AgentRegistrationExecutionLease,
		submissionErrorMessage?: string,
	) {
		if (!(await keepApprovalSessionCurrent(registrationLease, approval))) return;
		if (approval.agentValidUntilMs <= Date.now()) {
			clearDesktopApprovalRecovery(env, walletAddress ?? zeroAddress, approval.publicKey);
			setSyncState({ status: "error", message: t`This mobile trading key has expired.` });
			return;
		}
		const recoveryBeforeVerification = getDesktopApprovalRecovery(env, walletAddress ?? zeroAddress);
		if (!recoveryBeforeVerification) {
			setSyncState({ status: "error", message: t`This approval recovery is no longer available.` });
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
				setSyncState({ status: "error", message: t`This approval recovery is no longer active.` });
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
				message: t`Hyperliquid reports that this trading key was replaced, changed, or expired.`,
			});
			return;
		}

		retainApprovalForVerification(
			approval,
			submissionErrorMessage ??
				t`The approval result is not confirmed. Retry the read-only verification before doing anything else.`,
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

	async function handleReviewSync() {
		if (!MOBILE_PAIRING_FEATURES.createAndReveal) {
			setSyncState({ status: "error", message: t`Mobile QR creation is temporarily unavailable.` });
			return;
		}
		if (!walletAddress || !hasWalletAccess) {
			setSyncState({
				status: "error",
				message: t`Connect the selected master wallet before linking a mobile device.`,
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
				message: t`Another mobile approval is being prepared for this wallet.`,
			});
			return;
		}

		const operation = startOperation();
		setSyncState({ status: "checking" });
		setResetState({ status: "idle" });

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

			const hasFunding = hasHyperliquidAccountFunding(clearinghouseResult.data, spotResult.data);
			if (!hasFunding) {
				setSyncState({
					status: "error",
					message: t`No balance on Hyperliquid. Deposit first.`,
				});
				return;
			}
			if (builderConfig?.b && !isBuilderFeeApproved(builderFeeResult?.data, builderConfig.f)) {
				setSyncState({
					status: "error",
					message: t`Enable trading and approve the builder fee on this desktop before linking a phone.`,
				});
				return;
			}

			setSyncState({ status: "review" });
		} catch (error) {
			if (!operation.signal.aborted) {
				setSyncState({ status: "error", message: formatTransferError(normalizeError(error)) });
			}
		} finally {
			finishOperation(operation);
		}
	}

	async function handleApproveSync() {
		if (!MOBILE_PAIRING_FEATURES.createAndReveal) {
			setSyncState({ status: "error", message: t`Mobile QR creation is temporarily unavailable.` });
			return;
		}
		if (!walletAddress || !hasWalletAccess || syncState.status !== "review") {
			setSyncState({
				status: "error",
				message: t`Review phone access with the selected master wallet before approving it.`,
			});
			return;
		}
		const registrationLease = captureAgentRegistrationExecutionLease(env, walletAddress);
		if (!registrationLease) {
			setSyncState({ status: "error", message: t`This approval recovery is no longer active.` });
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
						message: t`Enable trading and approve the builder fee on this desktop before linking a phone.`,
					});
					return;
				}
			} catch (error) {
				if (!preflightOperation.signal.aborted) {
					setSyncState({ status: "error", message: formatTransferError(normalizeError(error)) });
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
			setSyncState({ status: "error", message: formatTransferError(normalizeError(error)) });
			return;
		}
		if (submission.status === "blocked") {
			setSyncState(
				submission.recovery
					? createSyncStateFromRecovery(submission.recovery)
					: { status: "error", message: t`Another mobile approval is already in progress for this wallet.` },
			);
			return;
		}
		if (submission.status === "capacity") {
			setSyncState({
				status: "error",
				message: t`Too many mobile approvals are awaiting recovery in this tab. Resolve or revoke one first.`,
			});
			return;
		}

		const approval = submission.recovery.approval;
		const operation = startOperation();
		setSyncState({ status: "approving" });

		let submissionErrorMessage: string | undefined;
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
				submissionErrorMessage = formatTransferError(normalizeError(error));
			}
			if (operation.signal.aborted) return;

			setSyncState({ status: "verifying" });
			await reconcileApproval(approval, operation.signal, registrationLease, submissionErrorMessage);
		} catch (error) {
			if (!operation.signal.aborted) {
				retainApprovalForVerification(approval, formatTransferError(normalizeError(error)));
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
			setSyncState({ status: "error", message: t`This approval recovery is no longer available.` });
			return;
		}
		const registrationLease = captureAgentRegistrationExecutionLease(env, walletAddress);
		if (!registrationLease) {
			clearDesktopApprovalRecovery(env, walletAddress, approval.publicKey);
			setSyncState({ status: "error", message: t`This approval recovery is no longer active.` });
			return;
		}

		const operation = startOperation();
		setSyncState({ status: "verifying" });
		try {
			await reconcileApproval(approval, operation.signal, registrationLease, recovery.submissionErrorMessage);
		} catch (error) {
			if (!operation.signal.aborted) {
				retainApprovalForVerification(approval, formatTransferError(normalizeError(error)));
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
				message: t`Mobile QR reveal is temporarily unavailable. Revoke this key if you no longer need it.`,
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
			setSyncState({ status: "error", message: t`This approval recovery is no longer active.` });
			return;
		}

		const pageSafetyEpoch = pageSafetyEpochRef.current;
		const operation = startOperation();
		setSyncState({ status: "revalidating", approval });

		try {
			const recovery = getDesktopApprovalRecovery(env, walletAddress);
			if (!recovery || recovery.approval.publicKey.toLowerCase() !== approval.publicKey.toLowerCase()) {
				setSyncState({ status: "error", message: t`This approval recovery is no longer available.` });
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
						message: t`Hyperliquid reports that this trading key was replaced, changed, or expired.`,
					});
					return;
				}
				retainApprovalForVerification(
					approval,
					t`The approval could not be rechecked. The QR remains hidden until read-only verification succeeds.`,
				);
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
			const ticketResult = await registerMobileSyncTicket(syncUrl.syncId, operation.signal);
			if (ticketResult.status !== "accepted") {
				setSyncState({
					status: "concealed",
					approval,
					message:
						ticketResult.status === "rejected"
							? t`This one-time QR could not be created. Try revealing a new QR.`
							: t`The one-time QR service is unavailable. Check your connection and retry.`,
				});
				return;
			}
			if (!(await keepApprovalSessionCurrent(registrationLease, approval))) return;
			if (operation.signal.aborted || !isQrPageActive() || pageSafetyEpoch !== pageSafetyEpochRef.current) {
				setSyncState({ status: "concealed", approval });
				return;
			}
			if (
				Math.min(syncUrl.expiresAtMs, ticketResult.expiresAtWallClockMs) <= Date.now() ||
				ticketResult.expiresAtMonotonicMs <= performance.now()
			) {
				setSyncState({
					status: "concealed",
					approval,
					message: t`This one-time QR could not be created. Try revealing a new QR.`,
				});
				return;
			}

			setSyncState({
				status: "visible",
				payload: {
					agentAddress: approval.publicKey,
					url: syncUrl.url,
					expiresAtMs: syncUrl.expiresAtMs,
					pageSafetyEpoch,
					rendered: false,
					ticketExpiresAtMonotonicMs: ticketResult.expiresAtMonotonicMs,
					ticketExpiresAtWallClockMs: ticketResult.expiresAtWallClockMs,
				},
			});
		} catch (error) {
			if (!operation.signal.aborted) {
				setSyncState({
					status: "concealed",
					approval,
					message: formatTransferError(normalizeError(error)),
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
				message: t`Connect the selected master wallet before resetting mobile access.`,
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
			if (!extraAgents) throw new Error(t`Could not verify current mobile access.`);

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
				setResetState({ status: "error", message: formatTransferError(normalizeError(error)) });
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
					message: t`The replacement expired before Hyperliquid confirmed it. Review and sign a new revocation.`,
				});
				return;
			}

			setResetState({
				status: "pending",
				oldAgentAddresses,
				replacement,
				message: submissionError
					? formatTransferError(normalizeError(submissionError))
					: t`Revocation was submitted but is not yet confirmed.`,
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
					message: t`The replacement expired before Hyperliquid confirmed it. Review and sign a new revocation.`,
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

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={handleOpenChange}
			size="md"
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
					<Trans>Create a desktop trading key and transfer it only through a QR code.</Trans>
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4">
				<div className="flex items-center justify-between gap-3 rounded-8 border border-stroke-weak bg-fill-weak px-3 py-2 text-xs">
					<span className="text-fg-muted">
						<Trans>Master wallet</Trans>
					</span>
					<span className="min-w-0 truncate font-medium text-fg">
						{walletAddress && hasWalletAccess ? (
							<>
								<span className="font-mono">{shortenAddress(walletAddress)}</span>
								<span className="text-fg-muted"> · {env}</span>
							</>
						) : (
							<Trans>Wallet approval unavailable</Trans>
						)}
					</span>
				</div>

				{hasUnsettledWalletAction && (
					<output className="block rounded-8 border border-stroke-weak bg-fill-weak p-3 text-xs text-fg-muted">
						<Trans>Keep this window open until Hyperliquid finishes checking the wallet action.</Trans>
					</output>
				)}

				{syncState.status === "error" && <InlineError message={syncState.message} />}

				{syncState.status === "pending-verification" ? (
					<PendingApprovalVerificationPanel state={syncState} onRetry={handleRetryApprovalVerification} />
				) : !MOBILE_PAIRING_FEATURES.createAndReveal ? (
					<PairingUnavailablePanel />
				) : syncState.status === "review" ? (
					<ApprovalReviewPanel />
				) : syncState.status === "concealed" || syncState.status === "revalidating" ? (
					<ConcealedQrPanel state={syncState} onReveal={handleRevealQr} />
				) : syncState.status === "visible" ? (
					<VisibleQrPanel payload={syncState.payload} canvasRef={qrCanvasRef} />
				) : (
					<CreateAccessPanel />
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
						onClick={syncState.status === "review" ? handleApproveSync : handleReviewSync}
						disabled={isSyncPending || resetBlocksSync || !walletAddress || !hasWalletAccess}
						iconLeft={
							isSyncPending ? (
								<SpinnerGapIcon className="size-3.5 animate-spin" />
							) : syncState.status === "review" ? (
								<ShieldCheckIcon className="size-3.5" />
							) : (
								<DeviceMobileIcon className="size-3.5" />
							)
						}
					>
						{getPrimaryButtonLabel(syncState.status)}
					</Button>
				</ModalFooter>
			)}
		</AdaptiveModal>
	);
}

function getPrimaryButtonLabel(status: SyncState["status"]): string {
	if (status === "checking") return t`Checking account...`;
	if (status === "review") return t`Approve mobile trading key`;
	if (status === "approving") return t`Approve in wallet...`;
	if (status === "verifying") return t`Verifying approval...`;
	if (status === "error") return t`Review again`;
	return t`Review phone access`;
}

function PendingApprovalVerificationPanel({
	state,
	onRetry,
}: {
	state: Extract<SyncState, { status: "pending-verification" }>;
	onRetry: () => void;
}) {
	return (
		<div className="space-y-3 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-3 text-xs text-error">
			<div className="flex items-start gap-2">
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
				<div className="space-y-1">
					<p className="font-semibold">
						<Trans>Approval verification pending</Trans>
					</p>
					<p>{state.message}</p>
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
		<div className="flex items-start gap-3 rounded-8 border border-stroke-weak bg-fill-weak p-3">
			<WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-fg-muted" weight="duotone" aria-hidden />
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

function CreateAccessPanel() {
	return (
		<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3">
			<div className="flex items-start gap-3">
				<ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-signal" weight="duotone" aria-hidden />
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-semibold text-fg">
						<Trans>Create phone access</Trans>
					</p>
					<p className="text-xs text-fg-muted">
						<Trans>Your master wallet approves one trading key. The key cannot withdraw funds.</Trans>
					</p>
				</div>
			</div>
		</div>
	);
}

function ApprovalReviewPanel() {
	return (
		<div className="space-y-3 rounded-8 border border-stroke-weak bg-fill-weak p-3">
			<div className="flex items-start gap-3">
				<ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-signal" weight="duotone" aria-hidden />
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-semibold text-fg">
						<Trans>Approve a mobile trading key</Trans>
					</p>
					<p className="text-xs text-fg-muted">
						<Trans>The private key is created on this desktop and embedded in the QR code.</Trans>
					</p>
				</div>
			</div>
			<ul className="list-disc space-y-1 pl-5 text-xs text-fg-muted">
				<li>
					<Trans>Anyone who scans or captures the QR can trade as this Agent.</Trans>
				</li>
				<li>
					<Trans>Approving a new mobile key replaces the previous mobile key.</Trans>
				</li>
				<li>
					<Trans>Confirm the approval only in the selected master wallet.</Trans>
				</li>
			</ul>
		</div>
	);
}

function ConcealedQrPanel({
	state,
	onReveal,
}: {
	state: Extract<SyncState, { status: "concealed" | "revalidating" }>;
	onReveal: (approval: MobileAgentApproval) => void;
}) {
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
			<div className="flex items-start gap-2 rounded-8 border border-stroke-weak bg-fill-weak p-3">
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

			<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3">
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
						isRevalidating ? <SpinnerGapIcon className="size-3.5 animate-spin" /> : <QrCodeIcon className="size-3.5" />
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
				<div
					role="progressbar"
					aria-label={t`QR reveal progress`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(progressPercent)}
					className="mt-2 h-1 overflow-hidden rounded-full bg-fill"
				>
					<div className="h-full bg-signal transition-[width] duration-100" style={{ width: `${progressPercent}%` }} />
				</div>
			</div>

			<div className="flex items-start gap-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-3 text-xs text-error">
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
				<p>
					<Trans>Do not photograph, copy, share, or screen-record the QR code.</Trans>
				</p>
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
	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-3 text-xs text-error">
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
				<p>
					<Trans>Scan only with your phone. Anyone who captures this QR can use the trading key.</Trans>
				</p>
			</div>

			<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="text-sm font-semibold text-fg">
							<Trans>Scan on your phone</Trans>
						</p>
						<p className="mt-0.5 text-xs text-fg-muted">
							<Trans>This one-time QR closes automatically within 60 seconds.</Trans>
						</p>
					</div>
					{!payload.rendered && (
						<SpinnerGapIcon className="size-4 animate-spin text-signal" aria-label={t`Rendering QR`} />
					)}
				</div>
				<div className="mt-3 flex justify-center rounded-8 border border-stroke-weak bg-white p-3">
					<canvas ref={canvasRef} aria-label={t`Phone access QR code`} className="size-80 max-w-full" />
				</div>
			</div>
		</div>
	);
}

function InlineError({ message }: { message: string }) {
	return (
		<div
			role="alert"
			className="flex items-start gap-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-3 text-xs text-error"
		>
			<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
			<p>{message}</p>
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
	const expiresAtLabel =
		state.status === "success" && state.replacementExpiresAtMs !== null
			? new Date(state.replacementExpiresAtMs).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				})
			: null;
	const isBusy = state.status === "checking" || state.status === "signing" || state.status === "verifying";

	return (
		<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3">
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
				<div className="mt-3 space-y-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-2.5 text-xs text-error">
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
				<div className="mt-3 space-y-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-2.5 text-xs text-error">
					<p>{state.message}</p>
					<p>
						<Trans>Do not submit another revocation. Retry the read-only verification.</Trans>
					</p>
					<Button type="button" variant="outline" intent="error" size="sm" onClick={onRetryVerification}>
						<Trans>Retry verification</Trans>
					</Button>
				</div>
			)}

			{state.status === "success" && (
				<div className="mt-3 flex items-start gap-2 rounded-8 border border-stroke-weak bg-background p-2.5 text-xs text-fg-muted">
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
				<div className="mt-2 flex items-start gap-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-2.5 text-xs text-error">
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
