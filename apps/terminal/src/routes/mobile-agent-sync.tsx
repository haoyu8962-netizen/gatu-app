import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckCircleIcon, DeviceMobileIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import {
	activateAgentOwnerForRegistration,
	cancelAgentRegistrationEpochAndRemove,
	captureAgentRegistrationEpoch,
	persistAgentForRegistration,
	verifyAgentRegistrationOrRemove,
} from "@sairn/hl-react";
import { createMobileAgentWalletRecord, verifyExpectedMobileAgent } from "@sairn/hl-react/signing/mobile-agent";
import { Button } from "@sairn/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { formatDateTime } from "@/lib/format";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	isMobileSyncError,
	isMobileSyncPayloadExpired,
	MOBILE_SYNC_ROUTE_PATH,
	type MobileAgentSyncPayload,
	type MobileSyncErrorCode,
	parseMobileSyncFragment,
} from "@/lib/mobile-sync/sync-core";
import { buildPageHead } from "@/lib/seo";
import type { Translate } from "@/lib/translate";

export const Route = createFileRoute("/mobile-agent-sync")({
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Phone Access",
			path: MOBILE_SYNC_ROUTE_PATH,
			noIndex: true,
		}),
	component: MobileAgentSyncRoute,
});

type LoadErrorCode = MobileSyncErrorCode | "unavailable";
type ImportErrorCode = "not_approved" | "remote_unavailable" | "storage_failed" | "expired_payload";

type LoadState =
	| { state: "empty" }
	| { state: "loaded"; payload: MobileAgentSyncPayload }
	| { state: "error"; code: LoadErrorCode };

type ImportStatus =
	| { state: "idle"; error: ImportErrorCode | null }
	| { state: "importing" }
	| { state: "success"; agentAddress: Address; agentValidUntilMs: number };

class MobileAgentImportError extends Error {
	readonly code: ImportErrorCode;

	constructor(code: ImportErrorCode) {
		super(`Mobile agent import failed: ${code}`);
		this.name = "MobileAgentImportError";
		this.code = code;
	}
}

function takeLocationFragment(): string {
	const { hash, pathname, search } = window.location;
	if (hash.length > 1) window.history.replaceState(window.history.state, "", `${pathname}${search}`);
	return hash;
}

function MobileAgentSyncRoute() {
	const { i18n, t } = useLingui();
	const { env, info } = useHyperliquid();
	const [loadState, setLoadState] = useState<LoadState>({ state: "empty" });
	const [status, setStatus] = useState<ImportStatus>({ state: "idle", error: null });
	const importAbortRef = useRef<AbortController | null>(null);

	useLayoutEffect(() => {
		function loadFragment() {
			const hash = takeLocationFragment();
			if (hash.length <= 1) return;
			if (!MOBILE_PAIRING_FEATURES.enabled) {
				setLoadState({ state: "error", code: "unavailable" });
				return;
			}
			try {
				setLoadState({ state: "loaded", payload: parseMobileSyncFragment(hash, { expectedEnv: env }) });
				setStatus({ state: "idle", error: null });
			} catch (error) {
				setLoadState({ state: "error", code: isMobileSyncError(error) ? error.code : "invalid_payload" });
			}
		}

		loadFragment();
		window.addEventListener("hashchange", loadFragment);
		return () => window.removeEventListener("hashchange", loadFragment);
	}, [env]);

	useEffect(() => () => importAbortRef.current?.abort(), []);

	const payload = loadState.state === "loaded" ? loadState.payload : null;

	async function handleImport() {
		if (!payload || status.state !== "idle") return;
		importAbortRef.current?.abort();
		const abortController = new AbortController();
		importAbortRef.current = abortController;
		setStatus({ state: "importing" });

		try {
			const extraAgents = await info.extraAgents({ user: payload.userAddress }, abortController.signal).catch(() => {
				throw new MobileAgentImportError("remote_unavailable");
			});
			if (abortController.signal.aborted) return;
			const verification = verifyExpectedMobileAgent(extraAgents, {
				agentAddress: payload.agentAddress,
				agentNameBase: payload.agentNameBase,
				agentValidUntilMs: payload.agentValidUntilMs,
			});
			if (verification.status !== "approved") throw new MobileAgentImportError("not_approved");
			if (isMobileSyncPayloadExpired(payload)) throw new MobileAgentImportError("expired_payload");

			await storeImportedAgent(payload);
			setLoadState({ state: "empty" });
			setStatus({ state: "success", agentAddress: payload.agentAddress, agentValidUntilMs: payload.agentValidUntilMs });
		} catch (error) {
			if (abortController.signal.aborted) return;
			const code = error instanceof MobileAgentImportError ? error.code : "storage_failed";
			if (code === "expired_payload") {
				setLoadState({ state: "error", code });
				setStatus({ state: "idle", error: null });
				return;
			}
			setStatus({ state: "idle", error: code });
		} finally {
			if (importAbortRef.current === abortController) importAbortRef.current = null;
		}
	}

	const loadError =
		loadState.state === "error" ? getLoadErrorMessage(loadState.code, (descriptor) => t(descriptor)) : null;
	const importError =
		status.state === "idle" && status.error ? getImportErrorMessage(status.error, (descriptor) => t(descriptor)) : null;
	const isImporting = status.state === "importing";

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
							{payload ? (
								<Trans>
									Once imported, this phone trades on {payload.env} with the desktop-approved key until{" "}
									{formatDateTime(payload.agentValidUntilMs, { locale: i18n.locale })}. It cannot withdraw.
								</Trans>
							) : (
								<Trans>Scan the QR from Link mobile device on your desktop to load a trading key.</Trans>
							)}
						</p>
					</div>

					<div className="space-y-4 p-4">
						{loadError && <ErrorCallout message={loadError} />}
						{importError && <ErrorCallout message={importError} />}

						{status.state === "success" ? (
							<SuccessPanel agentAddress={status.agentAddress} agentValidUntilMs={status.agentValidUntilMs} />
						) : (
							<Button
								type="button"
								variant="filled"
								intent="brand"
								size="md"
								className="w-full"
								disabled={!payload || isImporting}
								onClick={handleImport}
								iconLeft={
									isImporting ? (
										<SpinnerGapIcon className="size-4 animate-spin" aria-hidden />
									) : (
										<DeviceMobileIcon className="size-4" aria-hidden />
									)
								}
							>
								<Trans>Import</Trans>
							</Button>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}

async function storeImportedAgent(payload: MobileAgentSyncPayload) {
	const record = createMobileAgentWalletRecord({
		privateKey: payload.agentPrivateKey,
		publicKey: payload.agentAddress,
		agentName: payload.agentName,
		agentValidUntilMs: payload.agentValidUntilMs,
		importedAtMs: Date.now(),
	});
	const { privateKey, publicKey, ...metadata } = record;
	const registration = await captureAgentRegistrationEpoch(payload.env, payload.userAddress);
	if (registration.status !== "ready") throw new MobileAgentImportError("storage_failed");

	let persistenceAttempted = false;
	try {
		persistenceAttempted = true;
		const stored = await persistAgentForRegistration(registration.epoch, privateKey, publicKey, metadata, {
			scope: "local",
		});
		if (stored.status !== "stored") throw new MobileAgentImportError("storage_failed");
		const activation = await activateAgentOwnerForRegistration(registration.epoch, publicKey);
		if (activation.status !== "current") throw new MobileAgentImportError("storage_failed");
		const verified = await verifyAgentRegistrationOrRemove(registration.epoch, publicKey);
		if (verified.status !== "current") throw new MobileAgentImportError("storage_failed");
	} catch (error) {
		await cancelAgentRegistrationEpochAndRemove(registration.epoch, persistenceAttempted ? publicKey : undefined).catch(
			() => undefined,
		);
		throw error;
	}
}

function getLoadErrorMessage(code: LoadErrorCode, translate: Translate): string {
	switch (code) {
		case "unavailable":
			return translate(msg`Mobile QR import is temporarily unavailable.`);
		case "expired_payload":
			return translate(msg`This QR expired. Create a new QR on desktop.`);
		case "not_yet_valid":
			return translate(
				msg`This QR's time does not match this phone. Check the date and time on both devices, then create a new QR.`,
			);
		case "env_mismatch":
			return translate(msg`This QR belongs to a different network. Switch networks or create a new QR on desktop.`);
		case "unsupported_version":
			return translate(msg`Refresh both devices to update phone access, then create a new QR.`);
		case "missing_fragment":
		case "invalid_payload":
			return translate(msg`This QR is invalid or incomplete. Create a new QR on desktop.`);
	}
}

function getImportErrorMessage(code: ImportErrorCode, translate: Translate): string {
	switch (code) {
		case "not_approved":
			return translate(msg`The desktop has not approved this key. Create a new QR on desktop.`);
		case "remote_unavailable":
			return translate(msg`Could not check the approval on Hyperliquid. Nothing was imported. Try again.`);
		case "storage_failed":
			return translate(msg`This phone could not store the trading key. Clear this site's data and scan again.`);
		case "expired_payload":
			return translate(msg`This QR expired. Create a new QR on desktop.`);
	}
}

function ErrorCallout({ message }: { message: string }) {
	return (
		<div
			role="alert"
			className="flex items-start gap-2 rounded-16 border border-stroke-error-weak bg-error-soft p-3 text-xs text-error"
		>
			<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
			<p>{message}</p>
		</div>
	);
}

function SuccessPanel({ agentAddress, agentValidUntilMs }: { agentAddress: string; agentValidUntilMs: number }) {
	const { i18n } = useLingui();

	return (
		<div className="space-y-3">
			<output className="flex items-start gap-2 rounded-16 border border-stroke-success-weak bg-success-soft p-3">
				<CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" weight="fill" aria-hidden />
				<div className="min-w-0">
					<p className="text-sm font-semibold text-fg">
						<Trans>Phone access ready</Trans>
					</p>
					<p className="mt-1 truncate font-mono text-xs text-fg-muted">{agentAddress}</p>
					<p className="mt-1 text-xs text-fg-muted">
						<Trans>
							Stays on this phone until {formatDateTime(agentValidUntilMs, { locale: i18n.locale })} unless you revoke
							it from the master wallet on desktop.
						</Trans>
					</p>
				</div>
			</output>
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
