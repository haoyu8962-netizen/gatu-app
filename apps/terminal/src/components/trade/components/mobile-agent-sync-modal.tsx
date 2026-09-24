import { createMobileAgentApproval, type MobileAgentApproval } from "@gatu/hl-react/signing/mobile-agent";
import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DeviceMobileIcon, QrCodeIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { usePressAndHold } from "@/hooks/ui/use-press-and-hold";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError } from "@/lib/errors/format";
import { type HyperliquidEnv, useHyperliquid } from "@/lib/hyperliquid";
import { createMobileAgentSyncUrl, MOBILE_SYNC_QR_VISIBLE_MS } from "@/lib/mobile-sync/sync-core";

interface MobileAgentSyncModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface MobileAgentSyncDialogProps extends MobileAgentSyncModalProps {
	env: HyperliquidEnv;
	hasWalletAccess: boolean;
	walletAddress: Address | undefined;
}

type SyncError = { code: "qr_render_failed" } | { code: "approval_failed"; detail: string };

type SyncState =
	| { status: "idle" }
	| { status: "signing" }
	| { status: "ready"; approval: MobileAgentApproval }
	| { status: "revealed"; url: string; closesAtMs: number }
	| { status: "error"; error: SyncError };

const QR_REVEAL_HOLD_MS = 4_000;
const HOLD_RING_RADIUS = 10;
const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * HOLD_RING_RADIUS;

export function MobileAgentSyncModal({ open, onOpenChange }: MobileAgentSyncModalProps) {
	const { walletAddress, hasWalletAccess } = useWalletSession();
	const { env } = useHyperliquid();
	const sessionKey = `${open ? "open" : "closed"}:${env}:${walletAddress?.toLowerCase() ?? "no-wallet"}:${hasWalletAccess}`;

	return (
		<MobileAgentSyncDialog
			key={sessionKey}
			open={open}
			onOpenChange={onOpenChange}
			env={env}
			walletAddress={walletAddress}
			hasWalletAccess={hasWalletAccess}
		/>
	);
}

function MobileAgentSyncDialog({
	open,
	onOpenChange,
	env,
	walletAddress,
	hasWalletAccess,
}: MobileAgentSyncDialogProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const approveAgent = useExplicitAgentApproval();
	const [state, setState] = useState<SyncState>({ status: "idle" });
	const operationRef = useRef<AbortController | null>(null);
	const onOpenChangeRef = useRef(onOpenChange);
	onOpenChangeRef.current = onOpenChange;

	useEffect(() => () => operationRef.current?.abort(), []);

	useEffect(() => {
		if (state.status !== "revealed") return;
		const { closesAtMs } = state;

		function close() {
			onOpenChangeRef.current(false);
		}

		function handleVisibilityChange() {
			if (document.visibilityState !== "visible") close();
		}

		const timeoutId = window.setTimeout(close, Math.max(0, closesAtMs - Date.now()));
		window.addEventListener("blur", close);
		window.addEventListener("pagehide", close);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			window.clearTimeout(timeoutId);
			window.removeEventListener("blur", close);
			window.removeEventListener("pagehide", close);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [state]);

	const canApprove = MOBILE_PAIRING_FEATURES.enabled && hasWalletAccess && !!walletAddress;

	async function handleApprove() {
		if (!canApprove || !walletAddress || state.status === "signing") return;
		operationRef.current?.abort();
		const operation = new AbortController();
		operationRef.current = operation;
		const approval = createMobileAgentApproval();
		setState({ status: "signing" });

		try {
			await approveAgent.mutateAsync(
				{ agentAddress: approval.publicKey, agentName: approval.agentName },
				{ signal: operation.signal, applicationReview: "confirmed" },
			);
			if (operation.signal.aborted) return;
			setState({ status: "ready", approval });
		} catch (error) {
			if (operation.signal.aborted) return;
			setState({
				status: "error",
				error: { code: "approval_failed", detail: formatTransferError(error instanceof Error ? error : new Error()) },
			});
		} finally {
			if (operationRef.current === operation) operationRef.current = null;
		}
	}

	function handleReveal(approval: MobileAgentApproval) {
		if (!walletAddress) return;
		const { url } = createMobileAgentSyncUrl({
			appOrigin: window.location.origin,
			env,
			userAddress: walletAddress,
			agentPrivateKey: approval.privateKey,
			agentValidUntilMs: approval.agentValidUntilMs,
		});
		setState({ status: "revealed", url, closesAtMs: Date.now() + MOBILE_SYNC_QR_VISIBLE_MS });
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) operationRef.current?.abort();
		onOpenChange(nextOpen);
	}

	const showsApproveButton = state.status === "idle" || state.status === "signing" || state.status === "error";

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={handleOpenChange}
			size="md"
			closeLabel={t`Close`}
			presentation={isMobile ? "drawer" : "modal"}
		>
			<ModalHeader>
				<div className="flex items-center gap-2">
					<DeviceMobileIcon className="size-4 text-signal" weight="duotone" aria-hidden />
					<ModalTitle>
						<Trans>Link mobile device</Trans>
					</ModalTitle>
				</div>
				<ModalDescription>
					<Trans>On your phone, open gatu, tap Connect, then Link Desktop Wallet and scan this code.</Trans>
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4">
				<div className="flex items-start gap-2 rounded-16 border border-stroke-error-weak bg-error-soft p-3 text-xs text-error">
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
					<p>
						<Trans>
							The QR can trade but not withdraw. Do not share it, screenshot it or show it while sharing your screen.
						</Trans>
					</p>
				</div>

				{!MOBILE_PAIRING_FEATURES.enabled && (
					<p className="text-xs text-fg-muted">
						<Trans>New mobile pairing is temporarily unavailable.</Trans>
					</p>
				)}
				{MOBILE_PAIRING_FEATURES.enabled && (!walletAddress || !hasWalletAccess) && (
					<p role="alert" className="text-xs text-error">
						<Trans>Connect the selected master wallet before linking a mobile device.</Trans>
					</p>
				)}
				{state.status === "error" && (
					<p role="alert" className="text-xs text-error">
						<SyncErrorText error={state.error} />
					</p>
				)}
				{state.status === "ready" && <RevealButton onReveal={() => handleReveal(state.approval)} />}
				{state.status === "revealed" && (
					<RevealedQrPanel
						url={state.url}
						closesAtMs={state.closesAtMs}
						onRenderFailed={() => setState({ status: "error", error: { code: "qr_render_failed" } })}
					/>
				)}
			</ModalContent>

			{showsApproveButton && canApprove && (
				<ModalFooter className="border-t border-stroke-weak">
					<Button
						type="button"
						variant="filled"
						intent="brand"
						size="md"
						className="w-full"
						disabled={state.status === "signing"}
						onClick={handleApprove}
						iconLeft={
							state.status === "signing" ? (
								<SpinnerGapIcon className="size-3.5 animate-spin" aria-hidden />
							) : (
								<QrCodeIcon className="size-3.5" aria-hidden />
							)
						}
					>
						<Trans>Approve mobile trading key</Trans>
					</Button>
				</ModalFooter>
			)}
		</AdaptiveModal>
	);
}

function SyncErrorText({ error }: { error: SyncError }) {
	if (error.code === "qr_render_failed")
		return <Trans>The QR could not be drawn. Approve a new key to try again.</Trans>;
	return <>{error.detail}</>;
}

function RevealButton({ onReveal }: { onReveal: () => void }) {
	const { t } = useLingui();
	const { handlers, progressPercent } = usePressAndHold({ durationMs: QR_REVEAL_HOLD_MS, onComplete: onReveal });

	return (
		<Button
			type="button"
			variant="filled"
			intent="brand"
			size="md"
			className="w-full touch-none select-none"
			aria-label={t`Hold for 4 seconds to reveal the QR code`}
			iconLeft={<HoldProgressRing progressPercent={progressPercent} />}
			{...handlers}
		>
			<Trans>Hold to reveal</Trans>
		</Button>
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
					className="transition-[stroke-dashoffset] duration-100"
				/>
			</svg>
		</span>
	);
}

function RevealedQrPanel({
	url,
	closesAtMs,
	onRenderFailed,
}: {
	url: string;
	closesAtMs: number;
	onRenderFailed: () => void;
}) {
	const { t } = useLingui();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const onRenderFailedRef = useRef(onRenderFailed);
	onRenderFailedRef.current = onRenderFailed;
	const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntil(closesAtMs));

	useEffect(() => {
		const intervalId = window.setInterval(() => setRemainingSeconds(secondsUntil(closesAtMs)), 1_000);
		return () => window.clearInterval(intervalId);
	}, [closesAtMs]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let cancelled = false;

		async function renderQr() {
			try {
				const QRCode = await import("qrcode");
				if (cancelled || !canvas) return;
				await QRCode.toCanvas(canvas, url, {
					errorCorrectionLevel: "L",
					margin: 1,
					width: 320,
					color: { dark: "#111827", light: "#FFFFFF" },
				});
			} catch {
				if (!cancelled) onRenderFailedRef.current();
			}
		}

		renderQr();
		return () => {
			cancelled = true;
			canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
		};
	}, [url]);

	return (
		<div className="space-y-2">
			<div className="flex justify-center rounded-16 border border-stroke-weak bg-white p-3">
				<canvas ref={canvasRef} aria-label={t`Phone access QR code`} className="size-80 max-w-full" />
			</div>
			<p role="timer" className="text-center text-xs text-fg-muted tabular-nums">
				<Trans>Closes in {remainingSeconds}s</Trans>
			</p>
		</div>
	);
}

function secondsUntil(timestampMs: number): number {
	return Math.max(0, Math.ceil((timestampMs - Date.now()) / 1_000));
}
