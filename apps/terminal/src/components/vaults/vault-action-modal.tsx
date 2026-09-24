import {
	AdaptiveModal,
	Button,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
	TextInput,
} from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { normalizeDecimalInput } from "@/lib/format";
import { formatVaultRatio, formatVaultUsd, type VaultDetail } from "./domain/vaults";

export type VaultActionStage = "input" | "review" | "awaiting" | "submitted" | "reconciling" | "done";
export type VaultActionResult = "success" | "rejected" | "apiError" | "unknown";

export interface VaultActionModalProps {
	open: boolean;
	action: "deposit" | "withdraw";
	stage: VaultActionStage;
	result?: VaultActionResult;
	detail: Pick<VaultDetail, "name" | "vaultAddress" | "leaderCommission" | "alwaysCloseOnWithdraw">;
	ownerAddress: string;
	amount: string;
	availableAmount: string | null;
	errorMessage?: string;
	operationReference?: string;
	canReview: boolean;
	canConfirm: boolean;
	onAmountChange: (value: string) => void;
	onReview: () => void;
	onBack: () => void;
	onConfirm: () => void;
	onVerifyAgain: () => void;
	onClose: () => void;
}

export function VaultActionModal({
	open,
	action,
	stage,
	result,
	detail,
	ownerAddress,
	amount,
	availableAmount,
	errorMessage,
	operationReference,
	canReview,
	canConfirm,
	onAmountChange,
	onReview,
	onBack,
	onConfirm,
	onVerifyAgain,
	onClose,
}: VaultActionModalProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const showsResult = stage === "done" && result === "unknown";
	const isSettling = stage === "done" && !showsResult;
	const locked = stage === "awaiting" || stage === "submitted" || stage === "reconciling" || isSettling;
	const title = action === "deposit" ? t`Deposit to Vault` : t`Withdraw from Vault`;

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={(nextOpen) => !nextOpen && !locked && onClose()}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={!locked}
			showClose={!isMobile && !locked}
			closeLabel={t`Close`}
			showHandle={isMobile && !locked}
			layer="blocking"
			className="max-h-[calc(100dvh-var(--funds-action-modal-inset))] min-[1001px]:max-w-md"
		>
			<ModalHeader divider={false} className="px-4 pt-5 pb-2 min-[1001px]:px-6">
				<ModalTitle>{title}</ModalTitle>
				<ModalDescription>{detail.name}</ModalDescription>
			</ModalHeader>
			<ModalContent className="space-y-4 px-4 py-4 min-[1001px]:px-6">
				{stage === "input" ? (
					<>
						<TextInput
							label={t`Amount (USDC)`}
							value={amount}
							onChange={(event) => onAmountChange(normalizeDecimalInput(event.target.value))}
							inputMode="decimal"
							autoComplete="off"
							placeholder="0.00"
							mobileSafe
							className="max-[1000px]:min-h-11"
							hint={
								availableAmount === null
									? t`Available amount is not verified`
									: action === "deposit"
										? t`Verified wallet balance: ${formatVaultUsd(availableAmount)}`
										: t`Maximum withdrawable: ${formatVaultUsd(availableAmount)}`
							}
						/>
						<p className="text-xs leading-5 text-fg-muted">
							<Trans>
								Enter a positive amount exactly representable in micro-USDC. Hyperliquid applies any Vault-specific
								limits on the server.
							</Trans>
						</p>
					</>
				) : null}

				{stage === "review" ? (
					<div className="space-y-3">
						<dl className="divide-y divide-stroke-weak py-2 text-xs">
							<ReviewRow label={<Trans>Owner</Trans>} value={ownerAddress} mono />
							<ReviewRow label={<Trans>Vault</Trans>} value={detail.vaultAddress} mono />
							<ReviewRow label={<Trans>Amount</Trans>} value={`${amount} USDC`} />
							<ReviewRow label={<Trans>Leader commission</Trans>} value={formatVaultRatio(detail.leaderCommission)} />
						</dl>
						<VaultActionRisk action={action} alwaysCloseOnWithdraw={detail.alwaysCloseOnWithdraw} />
						{errorMessage ? (
							<p role="alert" className="rounded-10 bg-error-soft px-3 py-2 text-xs leading-5 text-error">
								{errorMessage}
							</p>
						) : null}
					</div>
				) : null}

				{locked ? <VaultPendingStage stage={stage === "done" ? "reconciling" : stage} action={action} /> : null}

				{showsResult ? <VaultActionUnknownResult operationReference={operationReference} /> : null}
			</ModalContent>
			<ModalFooter className="gap-2 px-4 pt-0 pb-5 min-[1001px]:px-6">
				{stage === "input" ? (
					<>
						<Button variant="outline" intent="neutral" className="flex-1" onClick={onClose}>
							<Trans>Cancel</Trans>
						</Button>
						<Button className="flex-1" disabled={!canReview} onClick={onReview}>
							<Trans>Review</Trans>
						</Button>
					</>
				) : stage === "review" ? (
					<>
						<Button variant="outline" intent="neutral" className="flex-1" onClick={onBack}>
							<Trans>Back</Trans>
						</Button>
						<Button className="flex-1" disabled={!canConfirm} onClick={onConfirm}>
							<Trans>Confirm</Trans>
						</Button>
					</>
				) : showsResult ? (
					<>
						<Button variant="outline" intent="neutral" className="flex-1" onClick={onVerifyAgain}>
							<Trans>Verify again</Trans>
						</Button>
						<Button className="flex-1" onClick={onClose}>
							<Trans>Close</Trans>
						</Button>
					</>
				) : null}
			</ModalFooter>
		</AdaptiveModal>
	);
}

function VaultActionRisk({
	action,
	alwaysCloseOnWithdraw,
}: {
	action: "deposit" | "withdraw";
	alwaysCloseOnWithdraw: boolean;
}) {
	return (
		<div className="flex items-start gap-2 rounded-10 bg-warning-soft px-3 py-2.5 text-xs leading-5 text-warning">
			<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
			<ul className="list-disc space-y-1 ps-4">
				{action === "deposit" ? (
					<>
						<li>
							<Trans>You can lose all principal, and historical APR does not predict future returns.</Trans>
						</li>
						<li>
							<Trans>The confirmed server lock timestamp governs when withdrawal becomes available.</Trans>
						</li>
						<li>
							<Trans>
								Hyperliquid documents a four-day lock after the latest HLP deposit and a one-day lock for user Vaults.
								The returned server timestamp remains authoritative for this deposit.
							</Trans>
						</li>
					</>
				) : (
					<>
						<li>
							<Trans>
								Withdrawal may cancel orders, close positions, incur slippage, and return less than requested.
							</Trans>
						</li>
						{alwaysCloseOnWithdraw ? (
							<li>
								<Trans>This Vault uses proportional position closing on withdrawal.</Trans>
							</li>
						) : null}
					</>
				)}
			</ul>
		</div>
	);
}

function VaultPendingStage({
	stage,
	action,
}: {
	stage: "awaiting" | "submitted" | "reconciling";
	action: "deposit" | "withdraw";
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: output cannot contain the block content in this status panel.
		<div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
			<SpinnerGapIcon className="size-8 animate-spin text-signal motion-reduce:animate-none" />
			<p className="text-sm font-bold text-fg">
				{stage === "awaiting" ? (
					<Trans>Authorizing request</Trans>
				) : stage === "submitted" ? (
					<Trans>Request submitted</Trans>
				) : (
					<Trans>Reconciling from Hyperliquid</Trans>
				)}
			</p>
			<p className="max-w-sm text-xs leading-5 text-fg-muted">
				{stage === "awaiting" ? (
					<Trans>
						Your trading wallet signs this Vault transfer. Closing is disabled while authorization is active.
					</Trans>
				) : stage === "submitted" ? (
					<Trans>The signed {action} request is dispatched once and will not be retried automatically.</Trans>
				) : (
					<Trans>
						The page is matching a new Vault ledger event and refreshed account state. It will not sign again.
					</Trans>
				)}
			</p>
		</div>
	);
}

function VaultActionUnknownResult({ operationReference }: Pick<VaultActionModalProps, "operationReference">) {
	return (
		<div role="alert" className="flex flex-col items-center gap-3 py-7 text-center">
			<WarningCircleIcon className="size-9 text-error" weight="fill" />
			<p className="text-sm font-bold text-fg">
				<Trans>Result not yet known</Trans>
			</p>
			<p className="text-xs leading-5 text-fg-muted">
				<Trans>Do not submit again. Verify this operation against the public ledger first.</Trans>
			</p>
			{operationReference ? (
				<p className="break-all py-1.5 font-mono text-2xs text-fg-muted">{operationReference}</p>
			) : null}
		</div>
	);
}

function ReviewRow({ label, value, mono = false }: { label: React.ReactNode; value: React.ReactNode; mono?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2.5">
			<dt className="shrink-0 text-fg-muted">{label}</dt>
			<dd
				className={
					mono
						? "min-w-0 break-all text-right font-mono tabular-nums text-fg"
						: "text-right font-semibold tabular-nums text-fg"
				}
			>
				{mono ? <bdi dir="ltr">{value}</bdi> : value}
			</dd>
		</div>
	);
}
