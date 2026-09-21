import {
	type AgentRegistrationEpoch,
	activateAgentOwnerForRegistration,
	cancelAgentRegistrationEpochAndRemove,
	captureAgentRegistrationEpoch,
	createMobileAgentWalletRecord,
	persistAgentForRegistration,
	verifyAgentRegistrationOrRemove,
} from "@gatu/hl-react";
import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { CheckCircleIcon, DeviceMobileIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { formatDateTime } from "@/lib/format";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	consumeBootstrappedMobileAgentSyncUrl,
	consumeInvalidBootstrappedMobileAgentSyncLocation,
	consumeUnsafeMobileAgentSyncLinkNotice,
} from "@/lib/mobile-sync/bootstrap-fragment";
import {
	clearMobileSyncDraft,
	getMobileSyncRemainingLifetimeMs,
	isMobileSyncEnvelopeExpired,
	readMobileSyncDraft,
	saveMobileSyncDraft,
} from "@/lib/mobile-sync/draft-storage";
import { hasImportedMobileSyncId, recordImportedMobileSyncId } from "@/lib/mobile-sync/imported-sync-ids";
import { classifyPairingPath } from "@/lib/mobile-sync/pairing-location";
import { waitForExpectedMobileAgent } from "@/lib/mobile-sync/remote-verification";
import {
	decodeSyncKey,
	decryptMobileAgentSyncEnvelope,
	isMobileSyncCleanNavigationRequiredError,
	isMobileSyncError,
	MOBILE_SYNC_FRAGMENT_KEY,
	MOBILE_SYNC_KEY_FRAGMENT_KEY,
	MOBILE_SYNC_ROUTE_PATH,
	type MobileSyncEnvelope,
	type ParsedMobileSync,
	parseMobileSyncUrl,
	readAndClearMobileSyncEnvelope,
} from "@/lib/mobile-sync/sync-core";
import { buildPageHead } from "@/lib/seo";

type MobileSyncImportMessage = string;

type InitialHashCapture =
	| { status: "loaded"; sync: ParsedMobileSync }
	| { status: "error"; message: MobileSyncImportMessage }
	| null;

class MobileAgentRemoteVerificationError extends Error {
	constructor(readonly hadNetworkError: boolean) {
		super("Mobile Agent remote verification failed");
	}
}

class MobileAgentStorageError extends Error {
	constructor(readonly cleanupIncomplete = false) {
		super("Mobile Agent storage verification failed");
	}
}

class MobileAgentAlreadyImportedError extends Error {
	constructor() {
		super("Mobile Agent QR was already imported on this device");
	}
}

// Direct-load fragments are captured and removed by the zero-dependency client
// bootstrap before React/providers hydrate. This route consumes that value once.
const initialHashCaptureRef: { current: InitialHashCapture } = {
	current: captureBootstrappedLocationHash(),
};

export const Route = createFileRoute("/mobile-agent-sync")({
	ssr: false,
	beforeLoad: () => {
		// Route chunks may be preloaded before an SPA navigation. Capture again
		// at the navigation boundary so the fragment never waits for mount.
		if (!initialHashCaptureRef.current) initialHashCaptureRef.current = captureSpaLocationHash();
	},
	head: () =>
		buildPageHead({
			title: "Phone Access",
			path: MOBILE_SYNC_ROUTE_PATH,
			noIndex: true,
		}),
	component: MobileAgentSyncRoute,
});

type ImportStatus =
	| { state: "idle" }
	| { state: "importing" }
	| {
			state: "success";
			userAddress: string;
			agentAddress: string;
			agentValidUntilMs: number;
			localCleanupIncomplete: boolean;
	  };

type EnvelopeSource = "url" | "stored";

type LoadState =
	| { state: "empty" }
	| { state: "loaded"; sync: ParsedMobileSync; source: EnvelopeSource }
	| { state: "error"; message: MobileSyncImportMessage };

function MobileAgentSyncRoute() {
	const { env, info } = useHyperliquid();
	const [loadState, setLoadState] = useState<LoadState>(createInitialLoadState);
	const [submitError, setSubmitError] = useState<MobileSyncImportMessage | null>(null);
	const [status, setStatus] = useState<ImportStatus>({ state: "idle" });
	const errorAlertRef = useRef<HTMLDivElement | null>(null);
	const importAbortRef = useRef<AbortController | null>(null);
	const pendingKeyWipeRef = useRef<ParsedMobileSync | null>(null);

	const clearExpiredSync = useCallback((syncToClear?: ParsedMobileSync) => {
		syncToClear?.keyBytes.fill(0);
		importAbortRef.current?.abort();
		const draftCleared = clearMobileSyncDraft();
		setLoadState({
			state: "error",
			message: draftCleared
				? t`This desktop wallet QR expired.`
				: t`This desktop wallet QR expired, but its temporary copy could not be cleared. Close this tab and clear this site's data.`,
		});
		setSubmitError(null);
		setStatus({ state: "idle" });
	}, []);

	const clearInvalidSync = useCallback((message: MobileSyncImportMessage) => {
		importAbortRef.current?.abort();
		const draftCleared = clearMobileSyncDraft();
		setLoadState((previous) => {
			if (previous.state === "loaded") previous.sync.keyBytes.fill(0);
			return {
				state: "error",
				message: draftCleared
					? message
					: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
			};
		});
		setSubmitError(null);
		setStatus({ state: "idle" });
	}, []);

	const loadSync = useCallback(
		(next: ParsedMobileSync, source: EnvelopeSource) => {
			if (!MOBILE_PAIRING_FEATURES.importFromQr) {
				next.keyBytes.fill(0);
				clearInvalidSync(t`Mobile QR import is temporarily unavailable.`);
				return;
			}
			if (isMobileSyncEnvelopeExpired(next.envelope)) {
				next.keyBytes.fill(0);
				clearExpiredSync(next);
				return;
			}
			if (!saveMobileSyncDraft(next.envelope, next.encodedKey)) {
				next.keyBytes.fill(0);
				clearInvalidSync(t`This device could not securely hold the QR. Check browser storage and scan again.`);
				return;
			}

			importAbortRef.current?.abort();
			setLoadState((previous) => {
				if (previous.state === "loaded" && previous.sync !== next) previous.sync.keyBytes.fill(0);
				return { state: "loaded", sync: next, source };
			});
			setSubmitError(null);
			setStatus({ state: "idle" });
		},
		[clearExpiredSync, clearInvalidSync],
	);

	useEffect(() => {
		// Both StrictMode render passes may need the same pre-render capture. It
		// is released after commit so the bearer key is not retained by the module.
		initialHashCaptureRef.current = null;

		function handleLocationChange() {
			if (!getSpaLocationScrubState().shouldScrub) return;
			try {
				loadSync(readAndClearMobileSyncEnvelope(), "url");
			} catch (error) {
				if (isMobileSyncCleanNavigationRequiredError(error)) return;
				clearInvalidSync(getMobileSyncImportErrorMessage(error));
			}
		}

		window.addEventListener("hashchange", handleLocationChange);
		window.addEventListener("popstate", handleLocationChange);
		return () => {
			importAbortRef.current?.abort();
			window.removeEventListener("hashchange", handleLocationChange);
			window.removeEventListener("popstate", handleLocationChange);
		};
	}, [clearInvalidSync, loadSync]);

	const loadedSync = loadState.state === "loaded" ? loadState.sync : null;

	useEffect(() => {
		if (!loadedSync) return;
		if (pendingKeyWipeRef.current === loadedSync) pendingKeyWipeRef.current = null;
		return () => {
			pendingKeyWipeRef.current = loadedSync;
			queueMicrotask(() => {
				if (pendingKeyWipeRef.current !== loadedSync) return;
				pendingKeyWipeRef.current = null;
				loadedSync.keyBytes.fill(0);
			});
		};
	}, [loadedSync]);

	useEffect(() => {
		if (!loadedSync || status.state === "success") return;

		const expiresInMs = getMobileSyncRemainingLifetimeMs(loadedSync.envelope);
		if (expiresInMs <= 0) {
			clearExpiredSync(loadedSync);
			return;
		}

		const timeoutId = window.setTimeout(() => clearExpiredSync(loadedSync), expiresInMs + 1);
		return () => window.clearTimeout(timeoutId);
	}, [clearExpiredSync, loadedSync, status.state]);

	useEffect(() => {
		if (loadState.state !== "error" && !submitError) return;
		errorAlertRef.current?.focus();
	}, [loadState.state, submitError]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!loadedSync || status.state === "importing") return;
		if (!MOBILE_PAIRING_FEATURES.importFromQr) {
			loadedSync.keyBytes.fill(0);
			clearInvalidSync(t`Mobile QR import is temporarily unavailable.`);
			return;
		}

		importAbortRef.current?.abort();
		const abortController = new AbortController();
		importAbortRef.current = abortController;
		setSubmitError(null);
		setStatus({ state: "importing" });

		let registrationToRollback:
			| {
					epoch: AgentRegistrationEpoch;
					publicKey: `0x${string}`;
					persistenceAttempted: boolean;
			  }
			| undefined;

		try {
			const imported = await decryptMobileAgentSyncEnvelope(loadedSync.envelope, loadedSync.keyBytes, {
				currentOrigin: window.location.origin,
				expectedEnv: env,
			});
			if (abortController.signal.aborted) return;

			const importIdentity = { env: imported.env, userAddress: imported.userAddress, syncId: imported.syncId };
			if (hasImportedMobileSyncId(importIdentity)) throw new MobileAgentAlreadyImportedError();

			const remoteVerification = await waitForExpectedMobileAgent(
				(attemptSignal) => info.extraAgents({ user: imported.userAddress }, attemptSignal),
				{
					agentAddress: imported.agentAddress,
					agentNameBase: imported.agentNameBase,
					agentValidUntilMs: imported.agentValidUntilMs,
				},
				{ signal: abortController.signal },
			);
			if (remoteVerification.status === "aborted") return;
			if (remoteVerification.status !== "approved") {
				throw new MobileAgentRemoteVerificationError(remoteVerification.hadNetworkError);
			}
			if (isMobileSyncEnvelopeExpired(loadedSync.envelope)) {
				clearExpiredSync(loadedSync);
				return;
			}

			const record = createMobileAgentWalletRecord({
				privateKey: imported.agentPrivateKey,
				publicKey: imported.agentAddress,
				agentName: imported.agentName,
				agentValidUntilMs: imported.agentValidUntilMs,
				importedAtMs: Date.now(),
				syncId: imported.syncId,
			});
			const { privateKey, publicKey, ...metadata } = record;
			const registration = await captureAgentRegistrationEpoch(imported.env, imported.userAddress);
			if (registration.status !== "ready") {
				throw new MobileAgentStorageError();
			}
			registrationToRollback = {
				epoch: registration.epoch,
				publicKey,
				persistenceAttempted: false,
			};
			if (abortController.signal.aborted) throw new MobileAgentStorageError();

			registrationToRollback.persistenceAttempted = true;
			const storageResult = await persistAgentForRegistration(registration.epoch, privateKey, publicKey, metadata, {
				scope: "local",
			});
			if (storageResult.status !== "stored") throw new MobileAgentStorageError();
			if (abortController.signal.aborted) throw new MobileAgentStorageError();

			const activation = await activateAgentOwnerForRegistration(registration.epoch, publicKey);
			if (activation.status !== "current") {
				throw new MobileAgentStorageError();
			}
			const afterActivation = await verifyAgentRegistrationOrRemove(registration.epoch, publicKey);
			if (afterActivation.status !== "current") {
				throw new MobileAgentStorageError();
			}
			if (abortController.signal.aborted) throw new MobileAgentStorageError();

			registrationToRollback = undefined;
			recordImportedMobileSyncId({ ...importIdentity, expiresAtMs: loadedSync.envelope.expiresAtMs });
			loadedSync.keyBytes.fill(0);
			const localCleanupIncomplete = !clearMobileSyncDraft();
			setLoadState({ state: "empty" });
			setStatus({
				state: "success",
				userAddress: imported.userAddress,
				agentAddress: imported.agentAddress,
				agentValidUntilMs: imported.agentValidUntilMs,
				localCleanupIncomplete,
			});
		} catch (caughtError) {
			let error = caughtError;
			if (registrationToRollback) {
				const cleanupIncomplete = await rollbackImportedMobileAccess(registrationToRollback);
				if (cleanupIncomplete) error = new MobileAgentStorageError(true);
			}
			if (abortController.signal.aborted) return;
			if (isMobileSyncError(error) || error instanceof MobileAgentAlreadyImportedError) {
				loadedSync.keyBytes.fill(0);
				const draftCleared = clearMobileSyncDraft();
				setLoadState({
					state: "error",
					message: draftCleared
						? getMobileSyncImportErrorMessage(error)
						: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
				});
				setSubmitError(null);
			} else {
				setSubmitError(getMobileSyncImportErrorMessage(error));
			}
			setStatus({ state: "idle" });
		} finally {
			if (importAbortRef.current === abortController) importAbortRef.current = null;
		}
	}

	function handleDiscardQr() {
		loadedSync?.keyBytes.fill(0);
		importAbortRef.current?.abort();
		const draftCleared = clearMobileSyncDraft();
		setLoadState(
			draftCleared
				? { state: "empty" }
				: {
						state: "error",
						message: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
					},
		);
		setSubmitError(null);
		setStatus({ state: "idle" });
	}

	async function rollbackImportedMobileAccess({
		epoch,
		publicKey,
		persistenceAttempted,
	}: {
		epoch: AgentRegistrationEpoch;
		publicKey: `0x${string}`;
		persistenceAttempted: boolean;
	}): Promise<boolean> {
		let cleanupIncomplete = false;
		try {
			const cancellation = await cancelAgentRegistrationEpochAndRemove(
				epoch,
				persistenceAttempted ? publicKey : undefined,
			);
			if (cancellation.status === "failed") {
				cleanupIncomplete = true;
			}
		} catch {
			cleanupIncomplete = true;
		}
		return cleanupIncomplete;
	}

	const isImporting = status.state === "importing";
	const hasValidCredential = !!loadedSync && !isMobileSyncEnvelopeExpired(loadedSync.envelope);
	const importDisabled = !hasValidCredential || isImporting || status.state === "success";

	return (
		<main className="min-h-[100dvh] bg-background px-4 py-5 text-fg sm:px-6">
			<div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-md flex-col justify-center">
				<div className="rounded-12 border border-stroke-weak bg-overlay shadow-overlay">
					<div className="border-b border-stroke-weak p-4">
						<div className="flex items-center gap-2">
							<DeviceMobileIcon className="size-5 text-signal" weight="duotone" aria-hidden />
							<h1 className="text-base font-semibold text-fg">
								<Trans>Import phone access</Trans>
							</h1>
						</div>
						<p className="mt-1 text-xs text-fg-muted">
							<Trans>Review and import the desktop-approved trading key. No phone wallet is required.</Trans>
						</p>
					</div>

					<div className="space-y-4 p-4">
						<div className="flex items-center justify-between gap-3 rounded-8 border border-stroke-weak bg-fill-weak px-3 py-2 text-xs">
							<span className="text-fg-muted">
								<Trans>Network</Trans>
							</span>
							<span className="font-medium text-fg">{env}</span>
						</div>

						{loadState.state === "loaded" && (
							<LoadedQrPanel
								envelope={loadState.sync.envelope}
								env={env}
								source={loadState.source}
								onDiscard={handleDiscardQr}
							/>
						)}
						{loadState.state === "empty" && status.state !== "success" && <EmptyQrPanel />}
						{loadState.state === "error" && <ErrorCallout ref={errorAlertRef} message={loadState.message} />}
						{submitError && loadState.state !== "error" && <ErrorCallout ref={errorAlertRef} message={submitError} />}
						{submitError && loadState.state === "error" && <ErrorCallout message={submitError} />}

						{status.state === "success" ? (
							<SuccessPanel
								userAddress={status.userAddress}
								agentAddress={status.agentAddress}
								agentValidUntilMs={status.agentValidUntilMs}
								localCleanupIncomplete={status.localCleanupIncomplete}
							/>
						) : (
							<form className="space-y-3" onSubmit={handleSubmit}>
								<Button
									type="submit"
									variant="filled"
									intent="brand"
									size="md"
									className="w-full"
									disabled={importDisabled}
									iconLeft={
										isImporting ? (
											<SpinnerGapIcon className="size-4 animate-spin" aria-hidden />
										) : (
											<DeviceMobileIcon className="size-4" aria-hidden />
										)
									}
								>
									{isImporting ? <Trans>Verifying approval...</Trans> : <Trans>Import phone access</Trans>}
								</Button>
							</form>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}

function LoadedQrPanel({
	envelope,
	env,
	source,
	onDiscard,
}: {
	envelope: MobileSyncEnvelope;
	env: string;
	source: EnvelopeSource;
	onDiscard: () => void;
}) {
	const expiresAtLabel = new Date(envelope.expiresAtMs).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<div className="space-y-3 rounded-8 border border-stroke-weak bg-fill-weak p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					<CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" weight="fill" aria-hidden />
					<div className="min-w-0">
						<p className="text-sm font-semibold text-fg">
							<Trans>Desktop QR loaded</Trans>
						</p>
						<p className="mt-0.5 text-xs text-fg-muted">
							{source === "stored" ? (
								<Trans>Recovered in this tab. Expires {expiresAtLabel}.</Trans>
							) : (
								<Trans>Expires {expiresAtLabel}.</Trans>
							)}
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={onDiscard}
					className="shrink-0 rounded-xs px-2 py-1 text-xs font-medium text-fg-muted hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				>
					<Trans>Discard</Trans>
				</button>
			</div>

			<div className="grid gap-2 text-xs">
				<RequirementRow label={t`Network`} value={env} />
				<RequirementRow label={t`Trading key`} value={t`Ready for verification`} />
			</div>
		</div>
	);
}

function EmptyQrPanel() {
	return (
		<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3 text-xs text-fg-muted">
			<Trans>No desktop QR is loaded. Return to the terminal scanner or scan a fresh QR with your system camera.</Trans>
		</div>
	);
}

function RequirementRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-8 border border-stroke-weak bg-background px-3 py-2">
			<span className="text-fg-muted">{label}</span>
			<span className="flex min-w-0 items-center gap-1.5 font-medium text-fg">
				<span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
				<span className="truncate">{value}</span>
			</span>
		</div>
	);
}

const ErrorCallout = forwardRef<HTMLDivElement, { message: MobileSyncImportMessage }>(function ErrorCallout(
	{ message },
	ref,
) {
	return (
		<div
			ref={ref}
			role="alert"
			tabIndex={-1}
			className="flex items-start gap-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-3 text-xs text-error"
		>
			<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
			<p>{message}</p>
		</div>
	);
});

function SuccessPanel({
	userAddress,
	agentAddress,
	agentValidUntilMs,
	localCleanupIncomplete,
}: {
	userAddress: string;
	agentAddress: string;
	agentValidUntilMs: number;
	localCleanupIncomplete: boolean;
}) {
	useLingui();
	const validUntilLabel = formatDateTime(agentValidUntilMs);

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2 rounded-8 border border-stroke-weak bg-fill-weak p-3">
				<CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" weight="fill" aria-hidden />
				<div className="min-w-0">
					<p className="text-sm font-semibold text-fg">
						<Trans>Phone access ready</Trans>
					</p>
					<p className="mt-1 truncate font-mono text-xs text-fg-muted">{agentAddress}</p>
				</div>
			</div>
			<p className="text-xs text-fg-muted">
				<Trans>
					Stays on this phone until {validUntilLabel} unless you disconnect it here or revoke it from the master wallet
					on desktop.
				</Trans>
			</p>
			<p className="text-xs text-fg-muted">
				<Trans>If you did not import this yourself, revoke phone access from the master wallet on desktop now.</Trans>
			</p>
			<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3 text-xs">
				<p className="text-fg-muted">
					<Trans>Owner account</Trans>
				</p>
				<p className="mt-1 truncate font-mono font-semibold text-fg">{userAddress}</p>
			</div>
			{localCleanupIncomplete && (
				<div className="flex items-start gap-2 rounded-8 border border-stroke-error-strong/25 bg-error-soft p-3 text-xs text-error">
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
					<p>
						<Trans>
							Phone access is ready, but the temporary QR copy could not be cleared. Close this tab and clear this
							site's data.
						</Trans>
					</p>
				</div>
			)}
			<Button
				type="button"
				variant="outline"
				intent="neutral"
				size="md"
				className="w-full"
				onClick={() => window.location.assign("/")}
			>
				<Trans>Open terminal</Trans>
			</Button>
		</div>
	);
}

function captureBootstrappedLocationHash(): InitialHashCapture {
	if (consumeUnsafeMobileAgentSyncLinkNotice()) {
		return {
			status: "error",
			message: clearMobileSyncDraft()
				? t`That link could not be opened safely, so nothing was loaded. Create a new QR on your desktop and scan it again.`
				: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
		};
	}
	if (consumeInvalidBootstrappedMobileAgentSyncLocation()) {
		return {
			status: "error",
			message: clearMobileSyncDraft()
				? t`This is not a valid gatu desktop wallet QR.`
				: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
		};
	}
	const bootstrappedUrl = consumeBootstrappedMobileAgentSyncUrl();
	if (!bootstrappedUrl) return null;
	if (!MOBILE_PAIRING_FEATURES.importFromQr) {
		return {
			status: "error",
			message: clearMobileSyncDraft()
				? t`Mobile QR import is temporarily unavailable.`
				: t`Mobile QR import is unavailable and its temporary copy could not be cleared. Close this tab and clear this site's data.`,
		};
	}

	try {
		return { status: "loaded", sync: parseMobileSyncUrl(bootstrappedUrl) };
	} catch (error) {
		return {
			status: "error",
			message: clearMobileSyncDraft()
				? getMobileSyncImportErrorMessage(error)
				: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
		};
	}
}

function captureSpaLocationHash(): InitialHashCapture {
	if (typeof window === "undefined") return null;
	const scrubState = getSpaLocationScrubState();
	if (!scrubState.isRouteLocation) return null;
	if (!scrubState.shouldScrub) {
		if (MOBILE_PAIRING_FEATURES.importFromQr) return null;
		return {
			status: "error",
			message: clearMobileSyncDraft()
				? t`Mobile QR import is temporarily unavailable.`
				: t`Mobile QR import is unavailable and its temporary copy could not be cleared. Close this tab and clear this site's data.`,
		};
	}

	try {
		const sync = readAndClearMobileSyncEnvelope();
		if (!MOBILE_PAIRING_FEATURES.importFromQr) {
			sync.keyBytes.fill(0);
			return {
				status: "error",
				message: clearMobileSyncDraft()
					? t`Mobile QR import is temporarily unavailable.`
					: t`Mobile QR import is unavailable and its temporary copy could not be cleared. Close this tab and clear this site's data.`,
			};
		}
		return { status: "loaded", sync };
	} catch (error) {
		if (isMobileSyncCleanNavigationRequiredError(error)) throw error;
		return {
			status: "error",
			message: clearMobileSyncDraft()
				? getMobileSyncImportErrorMessage(error)
				: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
		};
	}
}

function getSpaLocationScrubState(): { isRouteLocation: boolean; shouldScrub: boolean } {
	if (typeof window === "undefined") return { isRouteLocation: false, shouldScrub: false };

	const kind = classifyPairingPath(window.location.pathname);
	const searchParams = new URLSearchParams(window.location.search);
	const hasCredentialQuery =
		searchParams.has(MOBILE_SYNC_FRAGMENT_KEY) || searchParams.has(MOBILE_SYNC_KEY_FRAGMENT_KEY);
	return {
		isRouteLocation: kind !== "other",
		shouldScrub: kind === "rejected" || (kind === "pairing" && (window.location.hash !== "" || hasCredentialQuery)),
	};
}

function createInitialLoadState(): LoadState {
	if (!MOBILE_PAIRING_FEATURES.importFromQr) {
		return {
			state: "error",
			message: clearMobileSyncDraft()
				? t`Mobile QR import is temporarily unavailable.`
				: t`Mobile QR import is unavailable and its temporary copy could not be cleared. Close this tab and clear this site's data.`,
		};
	}
	if (initialHashCaptureRef.current?.status === "loaded") {
		if (isMobileSyncEnvelopeExpired(initialHashCaptureRef.current.sync.envelope)) {
			initialHashCaptureRef.current.sync.keyBytes.fill(0);
			return {
				state: "error",
				message: clearMobileSyncDraft()
					? t`This desktop wallet QR expired.`
					: t`This desktop wallet QR expired, but its temporary copy could not be cleared. Close this tab and clear this site's data.`,
			};
		}
		if (
			!saveMobileSyncDraft(initialHashCaptureRef.current.sync.envelope, initialHashCaptureRef.current.sync.encodedKey)
		) {
			initialHashCaptureRef.current.sync.keyBytes.fill(0);
			const draftCleared = clearMobileSyncDraft();
			return {
				state: "error",
				message: draftCleared
					? t`This device could not securely hold the QR. Check browser storage and scan again.`
					: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
			};
		}
		return { state: "loaded", sync: initialHashCaptureRef.current.sync, source: "url" };
	}
	if (initialHashCaptureRef.current?.status === "error") {
		return { state: "error", message: initialHashCaptureRef.current.message };
	}

	const storedDraft = readMobileSyncDraft();
	if (storedDraft.status === "found") {
		try {
			const keyBytes = decodeSyncKey(storedDraft.draft.encodedKey);
			return {
				state: "loaded",
				source: "stored",
				sync: {
					envelope: storedDraft.draft.envelope,
					keyBytes,
					encodedKey: storedDraft.draft.encodedKey,
				},
			};
		} catch {
			return {
				state: "error",
				message: clearMobileSyncDraft()
					? t`The saved desktop QR was invalid. Scan a fresh QR.`
					: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
			};
		}
	}
	if (storedDraft.status === "expired") {
		return {
			state: "error",
			message: clearMobileSyncDraft()
				? t`This desktop wallet QR expired.`
				: t`This desktop wallet QR expired, but its temporary copy could not be cleared. Close this tab and clear this site's data.`,
		};
	}
	if (storedDraft.status === "invalid") {
		return {
			state: "error",
			message: clearMobileSyncDraft()
				? t`The saved desktop QR was invalid. Scan a fresh QR.`
				: t`The temporary phone-access QR could not be cleared. Close this tab and clear this site's data before scanning again.`,
		};
	}
	if (storedDraft.status === "unavailable") {
		return {
			state: "error",
			message: t`Phone-access storage is unavailable. Close this tab and clear this site's data before scanning again.`,
		};
	}
	return { state: "empty" };
}

function getMobileSyncImportErrorMessage(error: unknown): MobileSyncImportMessage {
	if (error instanceof MobileAgentAlreadyImportedError) {
		return t`This QR was already imported on this phone. Create a new desktop QR to link again.`;
	}
	if (error instanceof MobileAgentRemoteVerificationError) {
		return error.hadNetworkError
			? t`Hyperliquid approval could not be checked. Check your connection and retry.`
			: t`This trading key is not the currently approved Mobile Agent. Create a new desktop QR.`;
	}
	if (error instanceof MobileAgentStorageError) {
		return error.cleanupIncomplete
			? t`Phone access could not be activated or fully removed from this device. Clear this site's data before retrying.`
			: t`Phone access could not be saved on this device. Check browser storage and retry.`;
	}
	if (isMobileSyncError(error)) {
		switch (error.code) {
			case "missing_sync_fragment":
			case "missing_sync_key":
				return t`No desktop wallet QR was found.`;
			case "sync_payload_in_query":
			case "sync_payload_in_path":
			case "unknown_fragment_key":
			case "invalid_payload_encoding":
			case "invalid_envelope":
			case "invalid_plaintext":
			case "agent_key_mismatch":
				return t`This is not a valid gatu desktop wallet QR.`;
			case "unsupported_version":
				return t`Refresh both devices to update phone access, then create a new QR.`;
			case "expired_payload":
				return t`This desktop wallet QR expired.`;
			case "not_yet_valid":
				return t`This QR's time does not match this phone. Check the date and time on both devices, then create a new QR.`;
			case "decrypt_failed":
				return t`This desktop wallet QR is damaged or incomplete. Scan a new QR.`;
			case "origin_mismatch":
				return t`This QR was created for a different site.`;
			case "env_mismatch":
				return t`This QR was created for a different network.`;
			case "account_mismatch":
				return t`This QR belongs to a different owner account.`;
		}
	}

	return t`Could not import phone access. Retry or create a new desktop QR.`;
}
