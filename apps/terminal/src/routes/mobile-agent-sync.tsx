import { createMobileAgentWalletRecord } from "@gatu/hl-react/signing/mobile-agent";
import { Button, TextInput } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { CheckCircleIcon, DeviceMobileIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, type FormEvent, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { setActiveAgentOwner, useAgentWalletActions, useHyperliquid } from "@/lib/hyperliquid";
import {
	clearMobileSyncDraft,
	isMobileSyncEnvelopeExpired,
	readMobileSyncDraft,
	saveMobileSyncDraft,
} from "@/lib/mobile-sync/draft-storage";
import {
	decodeSyncKey,
	decryptMobileAgentSyncEnvelope,
	isMobileSyncError,
	MOBILE_SYNC_ROUTE_PATH,
	type MobileSyncEnvelope,
	type ParsedMobileSync,
	parseMobileSyncUrl,
	readAndClearMobileSyncEnvelope,
} from "@/lib/mobile-sync/sync-core";
import { buildPageHead } from "@/lib/seo";

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

type ImportStatus =
	| { state: "idle" }
	| { state: "importing" }
	| { state: "success"; userAddress: string; agentAddress: string };

type EnvelopeSource = "url" | "stored" | "manual";

function MobileAgentSyncRoute() {
	const { env } = useHyperliquid();
	const { setAgent } = useAgentWalletActions();
	const [sync, setSync] = useState<ParsedMobileSync | null>(null);
	const [envelopeSource, setEnvelopeSource] = useState<EnvelopeSource | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [linkInput, setLinkInput] = useState("");
	const [showLinkInput, setShowLinkInput] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [status, setStatus] = useState<ImportStatus>({ state: "idle" });
	const errorAlertRef = useRef<HTMLDivElement | null>(null);

	const clearExpiredSync = useCallback(() => {
		clearMobileSyncDraft();
		setSync(null);
		setEnvelopeSource(null);
		setLoadError(t`This mobile link expired.`);
		setSubmitError(null);
		setStatus({ state: "idle" });
		setShowLinkInput(true);
	}, []);

	const clearInvalidSync = useCallback((message: string) => {
		clearMobileSyncDraft();
		setSync(null);
		setEnvelopeSource(null);
		setLoadError(message);
		setSubmitError(null);
		setStatus({ state: "idle" });
		setShowLinkInput(true);
	}, []);

	const loadSync = useCallback(
		(next: ParsedMobileSync, source: EnvelopeSource) => {
			if (isMobileSyncEnvelopeExpired(next.envelope)) {
				clearExpiredSync();
				return;
			}

			setSync(next);
			setEnvelopeSource(source);
			setLoadError(null);
			setSubmitError(null);
			setStatus({ state: "idle" });
			setShowLinkInput(false);
			saveMobileSyncDraft(next.envelope, next.encodedKey);
		},
		[clearExpiredSync],
	);

	const restoreStoredDraft = useCallback(() => {
		const storedDraft = readMobileSyncDraft();
		if (storedDraft.status === "found") {
			try {
				const keyBytes = decodeSyncKey(storedDraft.draft.encodedKey);
				setSync({ envelope: storedDraft.draft.envelope, keyBytes, encodedKey: storedDraft.draft.encodedKey });
				setEnvelopeSource("stored");
				setLoadError(null);
				setShowLinkInput(false);
			} catch {
				clearInvalidSync(t`Saved phone link was invalid. Paste the link again.`);
			}
			return;
		}
		if (storedDraft.status === "expired") {
			clearInvalidSync(t`This mobile link expired.`);
			return;
		}
		if (storedDraft.status === "invalid") {
			clearInvalidSync(t`Saved phone link was invalid. Paste the link again.`);
		}
	}, [clearInvalidSync]);

	const processLocationSyncHash = useCallback(() => {
		if (window.location.hash) {
			try {
				const next = readAndClearMobileSyncEnvelope();
				loadSync(next, "url");
			} catch (error) {
				clearInvalidSync(getMobileSyncImportErrorMessage(error));
			}
			return;
		}

		restoreStoredDraft();
	}, [clearInvalidSync, loadSync, restoreStoredDraft]);

	useEffect(() => {
		processLocationSyncHash();

		function handleLocationChange() {
			if (window.location.pathname === MOBILE_SYNC_ROUTE_PATH && window.location.hash) {
				processLocationSyncHash();
			}
		}

		window.addEventListener("hashchange", handleLocationChange);
		window.addEventListener("popstate", handleLocationChange);
		return () => {
			window.removeEventListener("hashchange", handleLocationChange);
			window.removeEventListener("popstate", handleLocationChange);
		};
	}, [processLocationSyncHash]);

	useEffect(() => {
		if (!sync || loadError || status.state === "success") return;

		const expiresInMs = sync.envelope.expiresAtMs - Date.now();
		if (expiresInMs <= 0) {
			clearExpiredSync();
			return;
		}

		const timeoutId = window.setTimeout(clearExpiredSync, expiresInMs + 1);
		return () => window.clearTimeout(timeoutId);
	}, [clearExpiredSync, sync, loadError, status.state]);

	useEffect(() => {
		if (!loadError && !submitError) return;
		errorAlertRef.current?.focus();
	}, [loadError, submitError]);

	function handleLoadPastedLink(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		try {
			const next = parseMobileSyncUrl(linkInput.trim());
			setLinkInput("");
			loadSync(next, "manual");
		} catch (error) {
			clearMobileSyncDraft();
			setSync(null);
			setEnvelopeSource(null);
			setLoadError(getMobileSyncImportErrorMessage(error));
			setSubmitError(null);
			setStatus({ state: "idle" });
			setShowLinkInput(true);
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!sync || status.state === "importing") return;

		setSubmitError(null);
		setStatus({ state: "importing" });

		try {
			const imported = await decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
				currentOrigin: window.location.origin,
				expectedEnv: env,
			});
			const record = createMobileAgentWalletRecord({
				privateKey: imported.agentPrivateKey,
				publicKey: imported.agentAddress,
				agentName: imported.agentName,
				agentValidUntilMs: imported.agentValidUntilMs,
				importedAtMs: imported.importedAtMs,
				syncId: imported.syncId,
			});
			const { privateKey, publicKey, ...metadata } = record;

			setAgent(imported.env, imported.userAddress, privateKey, publicKey, metadata);
			setActiveAgentOwner(imported.env, imported.userAddress);
			clearMobileSyncDraft();
			setSync(null);
			setEnvelopeSource(null);
			setStatus({
				state: "success",
				userAddress: imported.userAddress,
				agentAddress: imported.agentAddress,
			});
		} catch (error) {
			setSubmitError(getMobileSyncImportErrorMessage(error));
			setStatus({ state: "idle" });
		}
	}

	function handleResetLink() {
		clearMobileSyncDraft();
		setSync(null);
		setEnvelopeSource(null);
		setLoadError(null);
		setLinkInput("");
		setSubmitError(null);
		setStatus({ state: "idle" });
		setShowLinkInput(false);
	}

	const isImporting = status.state === "importing";
	const hasValidCredential = !!sync && !loadError && !isMobileSyncEnvelopeExpired(sync.envelope);
	const importDisabled = !hasValidCredential || isImporting || status.state === "success";
	const needsPastedLink = !sync || !!loadError;
	const showPhoneLinkForm = needsPastedLink || showLinkInput;
	const handleLinkInputChange = (event: ChangeEvent<HTMLInputElement>) => setLinkInput(event.target.value);

	return (
		<main className="min-h-[100dvh] bg-background px-4 py-5 text-fg sm:px-6">
			<div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-md flex-col justify-center">
				<div className="rounded-12 border border-stroke-weak bg-overlay shadow-overlay">
					<div className="border-b border-stroke-weak p-4">
						<div className="flex items-center gap-2">
							<DeviceMobileIcon className="size-5 text-brand" weight="duotone" aria-hidden />
							<h1 className="text-base font-semibold text-fg">
								<Trans>Import phone access</Trans>
							</h1>
						</div>
						<p className="mt-1 text-xs text-fg-muted">
							<Trans>Import the trading key from your desktop. No wallet connection is required on this phone.</Trans>
						</p>
					</div>

					<div className="space-y-4 p-4">
						<div className="flex items-center justify-between gap-3 rounded-8 border border-stroke-weak bg-fill-weak px-3 py-2 text-xs">
							<span className="text-fg-muted">
								<Trans>Mode</Trans>
							</span>
							<span className="min-w-0 truncate font-medium text-fg">
								<Trans>Phone import</Trans>
								<span className="text-fg-muted"> · {env}</span>
							</span>
						</div>

						{sync && !loadError && (
							<LoadedLinkPanel envelope={sync.envelope} env={env} source={envelopeSource} onReset={handleResetLink} />
						)}
						{loadError && <ErrorCallout ref={errorAlertRef} message={loadError} />}
						{submitError && !loadError && <ErrorCallout ref={errorAlertRef} message={submitError} />}
						{submitError && loadError && <ErrorCallout message={submitError} />}

						{status.state === "success" ? (
							<SuccessPanel userAddress={status.userAddress} agentAddress={status.agentAddress} />
						) : (
							<div className="space-y-3">
								{sync && !loadError && !showLinkInput && (
									<Button
										type="button"
										variant="outline"
										intent="neutral"
										size="sm"
										className="w-full"
										onClick={() => setShowLinkInput(true)}
									>
										<Trans>Use a different phone link</Trans>
									</Button>
								)}

								{showPhoneLinkForm && (
									<form className="space-y-3" onSubmit={handleLoadPastedLink}>
										<TextInput
											label={t`Phone link`}
											value={linkInput}
											onChange={handleLinkInputChange}
											placeholder={t`Paste link from desktop`}
											autoCapitalize="none"
											autoCorrect="off"
											inputMode="url"
											type="url"
										/>
										<Button
											type="submit"
											variant="outline"
											intent="neutral"
											size="md"
											className="w-full"
											disabled={!linkInput.trim()}
										>
											<Trans>Use phone link</Trans>
										</Button>
										{sync && !loadError && (
											<Button
												type="button"
												variant="ghost"
												intent="neutral"
												size="sm"
												className="w-full"
												onClick={() => {
													setShowLinkInput(false);
													setLinkInput("");
												}}
											>
												<Trans>Cancel</Trans>
											</Button>
										)}
									</form>
								)}

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
										{isImporting ? <Trans>Importing...</Trans> : <Trans>Import phone access</Trans>}
									</Button>
								</form>
							</div>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}

function LoadedLinkPanel({
	envelope,
	env,
	source,
	onReset,
}: {
	envelope: MobileSyncEnvelope;
	env: string;
	source: EnvelopeSource | null;
	onReset: () => void;
}) {
	const expiresAtLabel = new Date(envelope.expiresAtMs).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
	const syncPreview = envelope.syncId.slice(0, 8);

	return (
		<div className="space-y-3 rounded-8 border border-stroke-brand-strong/25 bg-fill-weak p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					<CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" weight="fill" aria-hidden />
					<div className="min-w-0">
						<p className="text-sm font-semibold text-fg">
							<Trans>Phone link loaded</Trans>
						</p>
						<p className="mt-0.5 truncate text-xs text-fg-muted">
							{source === "stored" ? (
								<Trans>Recovered after reload. Expires {expiresAtLabel}.</Trans>
							) : (
								<Trans>Expires {expiresAtLabel}.</Trans>
							)}
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={onReset}
					className="shrink-0 rounded-xs px-2 py-1 text-xs font-medium text-fg-muted hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				>
					<Trans>Reset</Trans>
				</button>
			</div>

			<div className="grid gap-2 text-xs">
				<RequirementRow label={t`Sync ID`} value={syncPreview} complete />
				<RequirementRow label={t`Network`} value={env} complete />
				<RequirementRow label={t`Trading key`} value={t`Ready to import`} complete />
			</div>
		</div>
	);
}

function RequirementRow({ label, value, complete }: { label: string; value: string; complete: boolean }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-8 border border-stroke-weak bg-background px-3 py-2">
			<span className="text-fg-muted">{label}</span>
			<span className="flex min-w-0 items-center gap-1.5 font-medium text-fg">
				<span
					className={
						complete ? "size-1.5 shrink-0 rounded-full bg-success" : "size-1.5 shrink-0 rounded-full bg-warning"
					}
					aria-hidden
				/>
				<span className="truncate">{value}</span>
			</span>
		</div>
	);
}

const ErrorCallout = forwardRef<HTMLDivElement, { message: string }>(function ErrorCallout({ message }, ref) {
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

function SuccessPanel({ userAddress, agentAddress }: { userAddress: string; agentAddress: string }) {
	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2 rounded-8 border border-stroke-brand-strong/25 bg-fill-weak p-3">
				<CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" weight="fill" aria-hidden />
				<div className="min-w-0">
					<p className="text-sm font-semibold text-fg">
						<Trans>Phone access ready</Trans>
					</p>
					<p className="mt-1 truncate font-mono text-xs text-fg-muted">{agentAddress}</p>
				</div>
			</div>
			<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3 text-xs">
				<p className="text-fg-muted">
					<Trans>Owner account</Trans>
				</p>
				<p className="mt-1 truncate font-mono font-semibold text-fg">{userAddress}</p>
			</div>
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

function getMobileSyncImportErrorMessage(error: unknown): string {
	if (isMobileSyncError(error)) {
		switch (error.code) {
			case "missing_sync_fragment":
			case "missing_sync_key":
				return t`No mobile link found.`;
			case "sync_payload_in_query":
			case "sync_payload_in_path":
			case "unknown_fragment_key":
			case "invalid_payload_encoding":
			case "invalid_envelope":
			case "invalid_plaintext":
			case "agent_key_mismatch":
				return t`This is not a valid gatu mobile link.`;
			case "expired_payload":
				return t`This mobile link expired.`;
			case "decrypt_failed":
				return t`This mobile link is damaged or incomplete. Scan or paste it again.`;
			case "origin_mismatch":
				return t`This link was created for a different site.`;
			case "env_mismatch":
				return t`This link was created for a different network.`;
			case "account_mismatch":
				return t`This phone link belongs to a different owner account.`;
		}
	}

	if (error instanceof TypeError) {
		return t`Paste the full phone link from desktop.`;
	}

	return error instanceof Error ? error.message : t`Could not import phone access.`;
}
