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
import { CheckCircleIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useIsMobile } from "@/hooks/use-mobile";
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
	transactionHash?: string;
	finalAmount?: string;
	commission?: string;
	closingCost?: string;
	canReview: boolean;
	canConfirm: boolean;
	onAmountChange: (value: string) => void;
	onReview: () => void;
	onBack: () => void;
	onConfirm: () => void;
	onRetry: () => void;
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
	transactionHash,
	finalAmount,
	commission,
	closingCost,
	canReview,
	canConfirm,
	onAmountChange,
	onReview,
	onBack,
	onConfirm,
	onRetry,
	onVerifyAgain,
	onClose,
}: VaultActionModalProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const locked = stage === "awaiting" || stage === "submitted" || stage === "reconciling";
	const title = action === "deposit" ? t`Deposit to Vault` : t`Withdraw from Vault`;

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={(nextOpen) => !nextOpen && !locked && onClose()}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={!locked}
			showClose={!isMobile && !locked}
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
							onChange={(event) => onAmountChange(event.target.value)}
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
						<dl className="divide-y divide-stroke-weak rounded-12 border border-stroke-weak px-3 text-xs">
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

				{locked ? <VaultPendingStage stage={stage} action={action} /> : null}

				{stage === "done" ? (
					<VaultActionResultView
						result={result}
						errorMessage={errorMessage}
						operationReference={operationReference}
						transactionHash={transactionHash}
						finalAmount={finalAmount}
						commission={commission}
						closingCost={closingCost}
					/>
				) : null}
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
				) : stage === "done" ? (
					<>
						{result === "rejected" || result === "apiError" ? (
							<Button variant="outline" intent="neutral" className="flex-1" onClick={onRetry}>
								<Trans>Review again</Trans>
							</Button>
						) : null}
						{result === "unknown" ? (
							<Button variant="outline" intent="neutral" className="flex-1" onClick={onVerifyAgain}>
								<Trans>Verify again</Trans>
							</Button>
						) : null}
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
			<ul className="list-disc space-y-1 pl-4">
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
		<output aria-live="polite" className="flex flex-col items-center gap-3 py-8 text-center">
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
		</output>
	);
}

function VaultActionResultView({
	result,
	errorMessage,
	operationReference,
	transactionHash,
	finalAmount,
	commission,
	closingCost,
}: Pick<
	VaultActionModalProps,
	"result" | "errorMessage" | "operationReference" | "transactionHash" | "finalAmount" | "commission" | "closingCost"
>) {
	if (result === "success") {
		return (
			<output aria-live="polite" className="flex flex-col items-center gap-3 py-8 text-center">
				<CheckCircleIcon className="size-9 text-success" weight="fill" />
				<p className="text-sm font-bold text-fg">
					<Trans>Vault transfer confirmed</Trans>
				</p>
				{transactionHash ? <p className="break-all font-mono text-2xs text-fg-muted">{transactionHash}</p> : null}
				{finalAmount || commission || closingCost ? (
					<dl className="w-full divide-y divide-stroke-weak rounded-12 border border-stroke-weak px-3 text-xs">
						{finalAmount ? <ReviewRow label={<Trans>Final amount</Trans>} value={`${finalAmount} USDC`} /> : null}
						{commission ? <ReviewRow label={<Trans>Commission</Trans>} value={`${commission} USDC`} /> : null}
						{closingCost ? <ReviewRow label={<Trans>Closing cost</Trans>} value={`${closingCost} USDC`} /> : null}
					</dl>
				) : null}
				{operationReference ? (
					<p className="break-all rounded-8 bg-fill-weak px-2 py-1.5 font-mono text-2xs text-fg-muted">
						{operationReference}
					</p>
				) : null}
			</output>
		);
	}
	return (
		<div role="alert" className="flex flex-col items-center gap-3 py-7 text-center">
			<WarningCircleIcon className="size-9 text-error" weight="fill" />
			<p className="text-sm font-bold text-fg">
				{result === "rejected" ? (
					<Trans>Authorization rejected</Trans>
				) : result === "apiError" ? (
					<Trans>Vault request failed</Trans>
				) : (
					<Trans>Result not yet known</Trans>
				)}
			</p>
			<p className="text-xs leading-5 text-fg-muted">
				{result === "unknown" ? (
					<Trans>Do not submit again. Verify this operation against the public ledger first.</Trans>
				) : (
					errorMessage
				)}
			</p>
			{operationReference ? (
				<p className="break-all rounded-8 bg-fill-weak px-2 py-1.5 font-mono text-2xs text-fg-muted">
					{operationReference}
				</p>
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
				{value}
			</dd>
		</div>
	);
}
