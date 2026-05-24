import { Button, TextInput } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	CheckCircleIcon,
	DeviceMobileIcon,
	KeyIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { WalletModal } from "@/components/trade/components/wallet-modal";
import { shortenAddress } from "@/lib/format";
import { useAgentWalletActions, useHyperliquid } from "@/lib/hyperliquid";
import { isMobileSyncImportError, verifyImportedMobileAgent } from "@/lib/mobile-sync/import-verification";
import {
	decryptMobileAgentSyncEnvelope,
	isMobileSyncError,
	MOBILE_SYNC_ROUTE_PATH,
	type MobileSyncEnvelope,
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

function MobileAgentSyncRoute() {
	const { address } = useConnection();
	const { env, info } = useHyperliquid();
	const { setAgent } = useAgentWalletActions();
	const [envelope, setEnvelope] = useState<MobileSyncEnvelope | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [linkInput, setLinkInput] = useState("");
	const [pairingCode, setPairingCode] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [status, setStatus] = useState<ImportStatus>({ state: "idle" });
	const [walletModalOpen, setWalletModalOpen] = useState(false);

	useEffect(() => {
		try {
			setEnvelope(readAndClearMobileSyncEnvelope());
		} catch (error) {
			setLoadError(getMobileSyncImportErrorMessage(error));
		}
	}, []);

	function handleLoadPastedLink(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		try {
			const nextEnvelope = parseMobileSyncUrl(linkInput.trim());
			setEnvelope(nextEnvelope);
			setLoadError(null);
			setSubmitError(null);
			setPairingCode("");
			setStatus({ state: "idle" });
		} catch (error) {
			setEnvelope(null);
			setLoadError(getMobileSyncImportErrorMessage(error));
			setSubmitError(null);
			setStatus({ state: "idle" });
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!envelope || status.state === "importing") return;

		setSubmitError(null);
		if (!address) {
			setSubmitError(t`Connect the same wallet used on desktop before importing phone access.`);
			setStatus({ state: "idle" });
			return;
		}

		const ownerAddress = address;
		setStatus({ state: "importing" });

		try {
			const imported = await decryptMobileAgentSyncEnvelope(envelope, pairingCode, {
				currentOrigin: window.location.origin,
				expectedEnv: env,
				expectedUserAddress: ownerAddress,
			});
			const extraAgents = await info.extraAgents({ user: ownerAddress });
			const verifiedAgent = verifyImportedMobileAgent({
				imported,
				extraAgents,
				expectedEnv: env,
				expectedUserAddress: ownerAddress,
			});
			const { privateKey, publicKey, ...metadata } = verifiedAgent;

			setAgent(imported.env, imported.userAddress, privateKey, publicKey, metadata);
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

	const isImporting = status.state === "importing";
	const disabled = !address || !envelope || !!loadError || isImporting || status.state === "success";
	const needsPastedLink = !envelope || !!loadError;
	const handleLinkInputChange = (event: ChangeEvent<HTMLInputElement>) => setLinkInput(event.target.value);
	const handlePairingCodeChange = (event: ChangeEvent<HTMLInputElement>) =>
		setPairingCode(formatPairingCodeInput(event.target.value));

	return (
		<>
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
								<Trans>Open the phone link, then enter the pairing code shown on desktop.</Trans>
							</p>
						</div>

						<div className="space-y-4 p-4">
							<div className="flex items-center justify-between gap-3 rounded-8 border border-stroke-weak bg-fill-weak px-3 py-2 text-xs">
								<span className="text-fg-muted">
									<Trans>Using</Trans>
								</span>
								<span className="min-w-0 truncate font-medium text-fg">
									{address ? (
										<>
											<span className="font-mono">{shortenAddress(address)}</span>
											<span className="text-fg-muted"> · {env}</span>
										</>
									) : (
										<Trans>No wallet connected</Trans>
									)}
								</span>
							</div>

							{!address && <ConnectWalletCallout onConnect={() => setWalletModalOpen(true)} />}
							{loadError && <ErrorCallout message={loadError} />}
							{submitError && <ErrorCallout message={submitError} />}

							{status.state === "success" ? (
								<SuccessPanel userAddress={status.userAddress} agentAddress={status.agentAddress} />
							) : (
								<div className="space-y-3">
									{needsPastedLink && (
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
										</form>
									)}

									<form className="space-y-3" onSubmit={handleSubmit}>
										<TextInput
											label={t`Pairing code`}
											value={pairingCode}
											onChange={handlePairingCodeChange}
											placeholder="0000-0000-0000-0000"
											autoComplete="one-time-code"
											autoCapitalize="characters"
											inputMode="text"
											iconLeft={<KeyIcon className="size-4" aria-hidden />}
											disabled={!address || !envelope || !!loadError || isImporting}
										/>
										<Button
											type="submit"
											variant="filled"
											intent="brand"
											size="md"
											className="w-full"
											disabled={disabled || pairingCode.replace(/[\s-]/g, "").length !== 16}
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
			<WalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />
		</>
	);
}

function ErrorCallout({ message }: { message: string }) {
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

function ConnectWalletCallout({ onConnect }: { onConnect: () => void }) {
	return (
		<div className="space-y-3 rounded-8 border border-stroke-warning-strong/25 bg-warning-soft p-3 text-xs">
			<div className="flex items-start gap-2">
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" weight="fill" aria-hidden />
				<p className="text-warning">
					<Trans>Connect the same owner wallet used on desktop before importing phone access.</Trans>
				</p>
			</div>
			<Button
				type="button"
				variant="outline"
				intent="neutral"
				size="sm"
				className="w-full"
				iconLeft={<WalletIcon className="size-3.5" aria-hidden />}
				onClick={onConnect}
			>
				<Trans>Connect wallet</Trans>
			</Button>
		</div>
	);
}

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

function formatPairingCodeInput(value: string): string {
	const cleaned = value
		.toUpperCase()
		.replace(/[^0-9A-F]/g, "")
		.slice(0, 16);
	return cleaned.replace(/(.{4})(?=.)/g, "$1-");
}

function getMobileSyncImportErrorMessage(error: unknown): string {
	if (isMobileSyncError(error)) {
		switch (error.code) {
			case "invalid_pairing_code":
				return t`Enter the 16-character pairing code.`;
			case "missing_sync_fragment":
				return t`No mobile link found.`;
			case "sync_payload_in_query":
			case "sync_payload_in_path":
			case "unknown_fragment_key":
			case "invalid_payload_encoding":
			case "invalid_envelope":
			case "invalid_plaintext":
			case "agent_key_mismatch":
				return t`This is not a valid HypeTerminal mobile link.`;
			case "expired_payload":
				return t`This mobile link expired.`;
			case "decrypt_failed":
				return t`Pairing code does not match this link.`;
			case "origin_mismatch":
				return t`This link was created for a different site.`;
			case "env_mismatch":
				return t`This link was created for a different network.`;
			case "account_mismatch":
				return t`Connect the same wallet used on desktop.`;
		}
	}

	if (isMobileSyncImportError(error)) {
		return t`This phone link is not approved on Hyperliquid.`;
	}

	if (error instanceof TypeError) {
		return t`Paste the full phone link from desktop.`;
	}

	return error instanceof Error ? error.message : t`Could not import phone access.`;
}
