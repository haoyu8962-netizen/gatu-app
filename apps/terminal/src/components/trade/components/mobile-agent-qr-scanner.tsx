import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, CameraIcon, QrCodeIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import {
	clearMobileSyncDraft,
	isMobileSyncEnvelopeExpired,
	saveMobileSyncDraft,
} from "@/lib/mobile-sync/draft-storage";
import { classifyQrValue, shouldShowQrFeedback } from "@/lib/mobile-sync/qr-classification";
import { isMobileSyncError, MOBILE_SYNC_ROUTE_PATH, parseMobileSyncUrl } from "@/lib/mobile-sync/sync-core";

type ScannerStatus = "idle" | "starting" | "scanning";
type ScannerFeedback =
	| "camera-access"
	| "expired"
	| "feature-unavailable"
	| "invalid-link"
	| "invalid-payload"
	| "storage-unavailable"
	| "upgrade-required"
	| "wallet-connect";

interface MobileAgentQrScannerProps {
	onCancel: () => void;
	onSyncReady?: () => void;
	startScanner?: QrScannerStart;
}

interface QrScannerControls {
	stop: () => void;
}

export type QrScannerStart = (
	video: HTMLVideoElement,
	onDecode: (value: string, controls: QrScannerControls) => void,
) => Promise<QrScannerControls>;

const QR_FEEDBACK_THROTTLE_MS = 1_800;
const NON_PRIMARY_CAMERA_LABEL = /front|user|face|selfie|ultra|wide|tele|macro|zoom/i;

export function MobileAgentQrScanner({
	onCancel,
	onSyncReady = openMobileSyncRoute,
	startScanner = startBrowserQrScanner,
}: MobileAgentQrScannerProps) {
	const { t } = useLingui();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const controlsRef = useRef<{ stop: () => void } | null>(null);
	const scanGenerationRef = useRef(0);
	const didCompleteRef = useRef(false);
	const lastFeedbackRef = useRef<{ atMs: number; message: string } | null>(null);
	const [status, setStatus] = useState<ScannerStatus>("idle");
	const [feedback, setFeedback] = useState<ScannerFeedback | null>(null);

	const stopScanner = useCallback(() => {
		scanGenerationRef.current++;
		const controls = controlsRef.current;
		controlsRef.current = null;
		try {
			controls?.stop();
		} catch {
			// The underlying MediaStream tracks are still stopped below.
		} finally {
			stopVideoTracks(videoRef.current);
		}
	}, []);

	useEffect(() => {
		function handleVisibilityChange() {
			if (document.visibilityState !== "hidden") return;
			stopScanner();
			setStatus("idle");
		}

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			stopScanner();
		};
	}, [stopScanner]);

	function showFeedback(code: ScannerFeedback) {
		const nowMs = Date.now();
		if (!shouldShowQrFeedback(lastFeedbackRef.current, code, nowMs, QR_FEEDBACK_THROTTLE_MS)) return;
		lastFeedbackRef.current = { atMs: nowMs, message: code };
		setFeedback(code);
	}

	async function handleStartScanner() {
		stopScanner();
		clearMobileSyncDraft();
		if (!MOBILE_PAIRING_FEATURES.importFromQr) {
			setStatus("idle");
			setFeedback("feature-unavailable");
			return;
		}
		didCompleteRef.current = false;
		lastFeedbackRef.current = null;
		setFeedback(null);
		setStatus("starting");
		const generation = ++scanGenerationRef.current;

		try {
			if (generation !== scanGenerationRef.current || !videoRef.current) return;

			const controls = await startScanner(videoRef.current, (value, callbackControls) => {
				if (didCompleteRef.current || generation !== scanGenerationRef.current) return;

				const classification = classifyQrValue(value, window.location.origin);
				if (classification.type === "walletconnect") {
					showFeedback("wallet-connect");
					return;
				}
				if (classification.type !== "phoneAccessLink") {
					showFeedback("invalid-link");
					return;
				}

				try {
					const parsed = parseMobileSyncUrl(classification.url);
					if (isMobileSyncEnvelopeExpired(parsed.envelope)) {
						parsed.keyBytes.fill(0);
						clearMobileSyncDraft();
						showFeedback("expired");
						return;
					}
					if (!saveMobileSyncDraft(parsed.envelope, parsed.encodedKey)) {
						parsed.keyBytes.fill(0);
						showFeedback("storage-unavailable");
						return;
					}
					parsed.keyBytes.fill(0);

					didCompleteRef.current = true;
					scanGenerationRef.current++;
					controlsRef.current = null;
					try {
						callbackControls.stop();
					} catch {
						// The camera tracks are still stopped below.
					} finally {
						stopVideoTracks(videoRef.current);
					}
					onSyncReady();
				} catch (error) {
					clearMobileSyncDraft();
					showFeedback(
						isMobileSyncError(error) && error.code === "unsupported_version" ? "upgrade-required" : "invalid-payload",
					);
				}
			});

			if (generation !== scanGenerationRef.current || didCompleteRef.current) {
				try {
					controls.stop();
				} catch {
					// The camera tracks are still stopped below.
				} finally {
					stopVideoTracks(videoRef.current);
				}
				return;
			}

			controlsRef.current = controls;
			setStatus("scanning");
		} catch {
			if (generation !== scanGenerationRef.current) return;
			stopScanner();
			setStatus("idle");
			setFeedback("camera-access");
		}
	}

	function handleCancel() {
		stopScanner();
		onCancel();
	}

	const cameraActive = status === "starting" || status === "scanning";
	const feedbackMessage = feedback ? getFeedbackMessage(feedback) : null;

	function getFeedbackMessage(code: ScannerFeedback): string {
		if (code === "camera-access") {
			return t`Camera access failed. Allow camera access and try again, or scan the QR with your system camera.`;
		}
		if (code === "expired") return t`This desktop wallet QR expired. Create a new QR on desktop.`;
		if (code === "feature-unavailable") return t`Mobile QR import is temporarily unavailable.`;
		if (code === "invalid-link") return t`This QR is not a valid desktop wallet link.`;
		if (code === "invalid-payload") return t`This QR is invalid or incomplete. Create a new QR on desktop.`;
		if (code === "storage-unavailable") {
			return t`This device could not securely hold the QR. Check browser storage and retry.`;
		}
		if (code === "upgrade-required") return t`Refresh both devices to update phone access, then create a new QR.`;
		return t`This is a WalletConnect QR. Scan the Link Desktop Wallet QR instead.`;
	}

	return (
		<div className="space-y-4">
			<div className="overflow-hidden rounded-12 border border-stroke-weak bg-black">
				<div className="relative aspect-square">
					<video
						ref={videoRef}
						className="size-full object-cover"
						muted
						playsInline
						aria-label={t`Camera preview for desktop wallet QR`}
					/>
					{!cameraActive && (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-modal px-6 text-center">
							<QrCodeIcon className="size-12 text-signal" weight="duotone" aria-hidden />
							<p className="text-xs text-fg-muted">
								<Trans>Scan the QR from the QR icon in the top-right of gatu on desktop (Link mobile device).</Trans>
							</p>
						</div>
					)}
					{cameraActive && (
						<div
							className="pointer-events-none absolute inset-[12%] rounded-16 border-2 border-signal shadow-[0_0_0_999px_rgb(0_0_0/0.22)]"
							aria-hidden
						/>
					)}
				</div>
			</div>

			{feedbackMessage && (
				<div
					role="alert"
					className="flex items-start gap-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-3 text-xs text-error"
				>
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
					<p>{feedbackMessage}</p>
				</div>
			)}

			<p className="text-xs text-fg-muted" aria-live="polite">
				{status === "starting" && <Trans>Starting camera...</Trans>}
				{status === "scanning" && <Trans>Looking for the desktop wallet QR...</Trans>}
				{status === "idle" && <Trans>The QR stays on this device and is never uploaded.</Trans>}
			</p>

			<div className="grid gap-2">
				<Button
					type="button"
					variant="filled"
					intent="brand"
					size="md"
					className="w-full"
					disabled={cameraActive}
					onClick={handleStartScanner}
					iconLeft={
						status === "starting" ? (
							<SpinnerGapIcon className="size-4 animate-spin" aria-hidden />
						) : (
							<CameraIcon className="size-4" aria-hidden />
						)
					}
				>
					{status === "starting" ? <Trans>Starting camera...</Trans> : <Trans>Start camera</Trans>}
				</Button>
				<Button
					type="button"
					variant="ghost"
					intent="neutral"
					size="sm"
					className="w-full"
					onClick={handleCancel}
					iconLeft={<ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />}
				>
					<Trans>Back</Trans>
				</Button>
			</div>
		</div>
	);
}

function stopVideoTracks(video: HTMLVideoElement | null): void {
	const stream = video?.srcObject;
	if (stream && "getTracks" in stream) {
		for (const track of stream.getTracks()) {
			try {
				track.stop();
			} catch {
				// Continue stopping every track even if a browser-specific
				// MediaStreamTrack implementation rejects one stop call.
			}
		}
	}
	if (video) video.srcObject = null;
}

function openMobileSyncRoute(): void {
	window.location.assign(MOBILE_SYNC_ROUTE_PATH);
}

export async function startBrowserQrScanner(
	video: HTMLVideoElement,
	onDecode: (value: string, controls: QrScannerControls) => void,
): Promise<QrScannerControls> {
	const { default: QrScanner } = await import("qr-scanner");
	let scanner: InstanceType<typeof QrScanner>;
	let stopped = false;
	const controls: QrScannerControls = {
		stop() {
			if (stopped) return;
			stopped = true;
			scanner.stop();
			scanner.destroy();
		},
	};
	scanner = new QrScanner(video, (result) => onDecode(result.data, controls), {
		preferredCamera: "environment",
		maxScansPerSecond: 10,
		returnDetailedScanResult: true,
	});
	await scanner.start();

	try {
		const cameras = await QrScanner.listCameras(true);
		const primaryCameraId = selectPrimaryEnvironmentCameraId(cameras, getActiveCameraId(video));
		if (primaryCameraId !== null && !stopped) await scanner.setCamera(primaryCameraId);
	} catch {
		// Camera selection is best-effort; the environment camera that already started keeps scanning.
	}
	return controls;
}

function selectPrimaryEnvironmentCameraId(
	cameras: ReadonlyArray<{ id: string; label: string }>,
	activeCameraId: string | undefined,
): string | null {
	if (activeCameraId === undefined) return null;
	const candidates = cameras.filter((camera) => !NON_PRIMARY_CAMERA_LABEL.test(camera.label));
	if (candidates.some((camera) => camera.id === activeCameraId)) return null;
	return candidates[0]?.id ?? null;
}

function getActiveCameraId(video: HTMLVideoElement): string | undefined {
	const stream = video.srcObject;
	if (!stream || !("getVideoTracks" in stream)) return undefined;
	return stream.getVideoTracks()[0]?.getSettings().deviceId;
}
