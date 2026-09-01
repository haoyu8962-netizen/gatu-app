import { Trans } from "@lingui/react/macro";
import { ArrowSquareOutIcon, InfoIcon, ShieldCheckIcon, WalletIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format";
import { ApiWalletActionModal } from "./api-wallet-action-modal";
import { ApiWalletCopyButton } from "./api-wallet-copy-button";
import { ApiWalletForm } from "./api-wallet-form";
import { ApiWalletList } from "./api-wallet-list";

const OFFICIAL_AGENT_WALLET_DOCS_URL =
	"https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets";

export type ApiWalletPageState = "normal" | "empty" | "loading" | "error" | "disconnected" | "nonMaster";

export type ApiWalletValidityDays = 30 | 90 | 180;

export type ApiWalletAgentStatus = "active" | "expiring" | "today" | "expired" | "noExpiry" | "unknown";

export interface ApiWalletAgentView {
	id: string;
	name: string;
	address: string;
	expiresAt: string | null;
	expiryLabel: string;
	status: ApiWalletAgentStatus;
	statusDetail?: string;
}

export type ApiWalletActionKind = "authorize" | "remove";

export type ApiWalletActionStage = "review" | "awaiting" | "submitted" | "reconciling" | "done";

export type ApiWalletActionResult = "success" | "rejected" | "apiError" | "unknown";

export interface ApiWalletActionView {
	open: boolean;
	kind: ApiWalletActionKind;
	stage: ApiWalletActionStage;
	result?: ApiWalletActionResult;
	agentName: string;
	agentAddress: string;
	validityLabel?: string;
	errorMessage?: string;
	privateKey?: string;
	privateKeyVisible?: boolean;
	credentialDownloaded?: boolean;
	credentialSaved?: boolean;
	locked: boolean;
}

export interface ApiWalletViewProps {
	pageState: ApiWalletPageState;
	accountAddress?: string;
	accountLabel?: string;
	name: string;
	nameError?: string;
	generatedAddress?: string;
	validityDays: ApiWalletValidityDays;
	agents: ApiWalletAgentView[];
	action: ApiWalletActionView | null;
	canGenerate: boolean;
	canAuthorize: boolean;
	isRefreshing?: boolean;
	onNameChange: (name: string) => void;
	onValidityChange: (validityDays: ApiWalletValidityDays) => void;
	onGenerate: () => void;
	onAuthorize: () => void;
	onRemove: (agent: ApiWalletAgentView) => void;
	onRetry: () => void;
	onConnect: () => void;
	onCloseAction: () => void;
	onConfirmAction: () => void;
	onVerifyAgain: () => void;
	onTogglePrivateKey: () => void;
	onDownloadCredential: () => void;
	onCredentialSavedChange: (saved: boolean) => void;
	onFinishAction: () => void;
}

export function ApiWalletView({
	pageState,
	accountAddress,
	accountLabel,
	name,
	nameError,
	generatedAddress,
	validityDays,
	agents,
	action,
	canGenerate,
	canAuthorize,
	isRefreshing = false,
	onNameChange,
	onValidityChange,
	onGenerate,
	onAuthorize,
	onRemove,
	onRetry,
	onConnect,
	onCloseAction,
	onConfirmAction,
	onVerifyAgain,
	onTogglePrivateKey,
	onDownloadCredential,
	onCredentialSavedChange,
	onFinishAction,
}: ApiWalletViewProps) {
	const isMobile = useIsMobile();

	return (
		<section
			data-api-wallet-state={pageState}
			className={cn(
				"mx-auto flex w-full max-w-[var(--api-wallet-content-max)] flex-col bg-surface text-api-wallet-fg shadow-api-wallet-page",
				!isMobile && "min-h-[var(--api-wallet-page-min-height)] overflow-hidden rounded-32",
			)}
		>
			<header className={cn("flex flex-wrap items-start justify-between gap-4 pt-4 pb-3", isMobile ? "px-4" : "px-5")}>
				<div className="max-w-[var(--api-wallet-description-max)]">
					<p className="text-2xs text-api-wallet-subtle">
						<Trans>Account / API Wallet</Trans>
					</p>
					<h1
						className={cn("mt-1 font-bold tracking-heading-1 text-api-wallet-fg", isMobile ? "text-base" : "text-lg")}
					>
						<Trans>API Wallet</Trans>
					</h1>
					<p className="mt-1 text-2sm leading-6 text-api-wallet-muted">
						<Trans>
							API wallets, also called agents, can sign delegated actions for your Hyperliquid account. Information
							requests still use the account's public address.
						</Trans>
					</p>
				</div>

				{accountAddress ? (
					<div className="flex items-center gap-2 rounded-20 border border-api-wallet-stroke-input px-3 py-2">
						<WalletIcon className="size-4 shrink-0 text-api-wallet-subtle" />
						<div className="min-w-0">
							<p className="text-3xs text-api-wallet-subtle">{accountLabel ?? <Trans>Hyperliquid account</Trans>}</p>
							<p className="font-mono text-xs font-semibold tabular-nums text-api-wallet-fg">
								<bdi dir="ltr">{shortenAddress(accountAddress)}</bdi>
							</p>
						</div>
						<ApiWalletCopyButton value={accountAddress} appearance="icon" />
					</div>
				) : null}
			</header>

			<div
				className={cn(
					"mb-4 flex items-start gap-3 rounded-24 border border-api-wallet-stroke-card bg-api-wallet-card px-3.5 py-3",
					isMobile ? "mx-4" : "mx-5",
				)}
			>
				<InfoIcon className="mt-0.5 size-4 shrink-0 text-api-wallet-subtle" />
				<div className="min-w-0 space-y-1">
					<p className="text-xs font-semibold text-api-wallet-fg">
						<Trans>Understand the approval boundary</Trans>
					</p>
					<p className="text-xs leading-5 text-api-wallet-muted">
						<Trans>
							An approved API wallet can sign delegated L1 actions such as placing and cancelling orders and adjusting
							leverage or margin mode. Approval is not scoped per action. Master-only actions, including external
							withdrawals, still require the master wallet.
						</Trans>
					</p>
					<p className="flex items-start gap-1.5 text-xs leading-5 text-api-wallet-muted">
						<ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-api-wallet-success" weight="fill" />
						<span>
							<Trans>The private key is created in this browser and is never uploaded or stored by Gatu.</Trans>{" "}
							<a
								href={OFFICIAL_AGENT_WALLET_DOCS_URL}
								target="_blank"
								rel="noopener"
								className="inline-flex items-center gap-1 font-semibold text-signal underline decoration-api-wallet-stroke-control underline-offset-4 hover:text-signal-hover"
							>
								<Trans>Read the official agent wallet documentation</Trans>
								<ArrowSquareOutIcon className="size-3" />
							</a>
						</span>
					</p>
				</div>
			</div>

			{pageState === "nonMaster" ? (
				<div
					role="alert"
					className={cn("mb-3 flex items-start gap-3 rounded-24 bg-error-soft px-3.5 py-3", isMobile ? "mx-4" : "mx-5")}
				>
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-error" weight="fill" />
					<div>
						<p className="text-2sm font-bold text-api-wallet-fg">
							<Trans>The active wallet is not this account's master wallet</Trans>
						</p>
						<p className="mt-0.5 text-xs leading-5 text-api-wallet-muted">
							<Trans>
								Only the matching master wallet can approve or remove API wallets. Switch wallets to continue.
							</Trans>
						</p>
					</div>
				</div>
			) : null}

			<ApiWalletForm
				pageState={pageState}
				name={name}
				nameError={nameError}
				generatedAddress={generatedAddress}
				validityDays={validityDays}
				canGenerate={canGenerate}
				canAuthorize={canAuthorize}
				onNameChange={onNameChange}
				onValidityChange={onValidityChange}
				onGenerate={onGenerate}
				onAuthorize={onAuthorize}
				onConnect={onConnect}
			/>

			<ApiWalletList
				pageState={pageState}
				agents={agents}
				isRefreshing={isRefreshing}
				onRemove={onRemove}
				onRetry={onRetry}
			/>

			{action?.open ? (
				<ApiWalletActionModal
					action={action}
					onClose={onCloseAction}
					onConfirm={onConfirmAction}
					onVerifyAgain={onVerifyAgain}
					onTogglePrivateKey={onTogglePrivateKey}
					onDownloadCredential={onDownloadCredential}
					onCredentialSavedChange={onCredentialSavedChange}
					onFinish={onFinishAction}
				/>
			) : null}
		</section>
	);
}
