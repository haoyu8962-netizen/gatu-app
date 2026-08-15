import { AdaptiveModal, Alert, Button, ModalContent, ModalFooter, ModalHeader, ModalTitle, TextInput } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { formatDateTime, shortenAddress } from "@/lib/format";
import { getExplorerTxUrl } from "@/lib/hyperliquid";
import type { FundsActionReference } from "../funds-action/funds-action-marker";
import type { FundsActionMatch } from "../funds-action/funds-action-reconciliation";
import { type FundsActionState, getFundsActionSteps } from "../funds-action/funds-action-state";
import {
	createStakingActionSubmission,
	formatStakingAmount,
	type HypeAmountValidation,
	type StakingActionRequest,
	type StakingActionSubmission,
	validateHypeActionAmount,
} from "./domain/staking";

interface StakingActionModalProps {
	action: StakingActionRequest;
	ownerAddress: `0x${string}`;
	open: boolean;
	isMobile: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (submission: StakingActionSubmission) => void;
	submission?: StakingActionSubmission;
	fundsState?: FundsActionState;
	errorMessage?: string | null;
	match?: FundsActionMatch | null;
	reference?: FundsActionReference | null;
	locked?: boolean;
	isTestnet?: boolean;
	onBack?: () => void;
	onConfirm?: () => void;
	onRetry?: () => void;
	onVerify?: () => void;
}

export function StakingActionModal({
	action,
	ownerAddress,
	open,
	isMobile,
	onOpenChange,
	onSubmit,
	submission: controlledSubmission,
	fundsState,
	errorMessage,
	match,
	reference,
	locked = false,
	isTestnet = false,
	onBack,
	onConfirm,
	onRetry,
	onVerify,
}: StakingActionModalProps) {
	const { t } = useLingui();
	const [amount, setAmount] = useState("");
	const [stage, setStage] = useState<"input" | "review">("input");
	const [showError, setShowError] = useState(false);
	const validation = validateHypeActionAmount(amount, action.maxAmount);
	const submission = controlledSubmission ?? createStakingActionSubmission(action, amount);
	const controlled = Boolean(fundsState && controlledSubmission);
	const visibleStage = controlled ? fundsState?.stage : stage;

	function resetAndClose() {
		if (locked) return;
		setAmount("");
		setStage("input");
		setShowError(false);
		if (open) onOpenChange(false);
	}

	function review() {
		setShowError(true);
		if (validation.valid) setStage("review");
	}

	function submit() {
		if (!submission) return;
		onSubmit(submission);
		resetAndClose();
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) onOpenChange(true);
				else resetAndClose();
			}}
			presentation={isMobile ? "drawer" : "modal"}
			size="sm"
			dismissible={!locked}
			showClose={!locked}
			closeLabel={t`Close staking action`}
		>
			<ModalHeader>
				<ModalTitle>{getActionTitle(action)}</ModalTitle>
				<p className="text-xs text-fg-muted">{getActionDescription(action, isTestnet)}</p>
			</ModalHeader>
			<ModalContent className="space-y-4">
				{controlled && fundsState ? <ActionProgress state={fundsState} /> : null}
				{visibleStage === "input" ? (
					<>
						<TextInput
							label={t`Amount`}
							inputMode="decimal"
							autoComplete="off"
							value={amount}
							onChange={(event) => {
								setAmount(event.currentTarget.value);
								setShowError(false);
							}}
							placeholder="0.00"
							iconRight={<span className="text-xs font-semibold">HYPE</span>}
							error={showError && !validation.valid ? getAmountError(validation, t) : undefined}
						/>
						<div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
							<span>
								<Trans>Available</Trans>: {formatStakingAmount(action.maxAmount)} HYPE
							</span>
							<Button variant="ghost" intent="brand" size="xs" onClick={() => setAmount(action.maxAmount)}>
								<Trans>Max</Trans>
							</Button>
						</div>
						<ActionRisk action={action} isTestnet={isTestnet} />
					</>
				) : visibleStage === "review" ? (
					<>
						<div className="space-y-2 rounded-8 border border-stroke-weak bg-fill-weaker p-3 text-xs">
							<ReviewRow label={t`Signing account`} value={shortenAddress(ownerAddress, 6, 6)} />
							{action.validator ? (
								<ReviewRow
									label={t`Validator`}
									value={action.validatorName || shortenAddress(action.validator, 6, 6)}
								/>
							) : null}
							<ReviewRow label={t`Amount`} value={`${formatStakingAmount(submission?.amount ?? "0", 8)} HYPE`} />
						</div>
						<ActionRisk action={action} isTestnet={isTestnet} />
						<Alert
							tone="information"
							size="xs"
							title={t`Review only`}
							description={t`Continuing hands this verified public operation to the shared funds-action flow. This page never signs or assembles an exchange request.`}
						/>
					</>
				) : (
					<ActionStatus
						state={fundsState}
						errorMessage={errorMessage}
						match={match}
						reference={reference}
						isTestnet={isTestnet}
					/>
				)}
			</ModalContent>
			<ModalFooter>
				{controlled && fundsState ? (
					<ControlledFooter
						state={fundsState}
						onBack={onBack}
						onConfirm={onConfirm}
						onRetry={onRetry}
						onVerify={onVerify}
						onClose={resetAndClose}
					/>
				) : stage === "review" ? (
					<Button variant="outline" intent="neutral" onClick={() => setStage("input")}>
						<Trans>Back</Trans>
					</Button>
				) : (
					<Button variant="outline" intent="neutral" onClick={resetAndClose}>
						<Trans>Cancel</Trans>
					</Button>
				)}
				{!controlled ? (
					<Button onClick={stage === "input" ? review : submit} disabled={stage === "review" && !submission}>
						{stage === "input" ? <Trans>Review</Trans> : <Trans>Continue securely</Trans>}
					</Button>
				) : null}
			</ModalFooter>
		</AdaptiveModal>
	);
}

function ActionProgress({ state }: { state: FundsActionState }) {
	const { t } = useLingui();
	const steps = getFundsActionSteps(state);
	return (
		<ol className="grid grid-cols-5 gap-1" aria-label={t`Funds action progress`}>
			{steps.map((step) => (
				<li
					key={step}
					data-active={state.stage === step ? "true" : undefined}
					className="truncate rounded-8 bg-fill-weaker px-1 py-1 text-center text-2xs text-fg-muted data-[active=true]:bg-brand-soft data-[active=true]:text-brand"
				>
					{getStageLabel(step)}
				</li>
			))}
		</ol>
	);
}

function getStageLabel(stage: FundsActionState["stage"]) {
	if (stage === "review") return <Trans>Review</Trans>;
	if (stage === "awaiting") return <Trans>Authorize</Trans>;
	if (stage === "submitted") return <Trans>Submitted</Trans>;
	if (stage === "reconciling") return <Trans>Verifying</Trans>;
	if (stage === "done") return <Trans>Done</Trans>;
	return <Trans>Amount</Trans>;
}

function ActionStatus({
	state,
	errorMessage,
	match,
	reference,
	isTestnet,
}: {
	state: FundsActionState | undefined;
	errorMessage?: string | null;
	match?: FundsActionMatch | null;
	reference?: FundsActionReference | null;
	isTestnet: boolean;
}) {
	const { t } = useLingui();
	const safeError = getSafeActionError(errorMessage, t);
	if (!state) return null;
	if (state.stage === "awaiting") {
		return (
			<Alert
				tone="information"
				title={t`Approve in wallet`}
				description={t`Confirm the exact public operation in your master wallet.`}
			/>
		);
	}
	if (state.stage === "submitted" || state.stage === "reconciling") {
		return (
			<Alert
				tone="information"
				title={t`Verifying from history`}
				description={t`Do not submit again while Hyperliquid history is checked.`}
			/>
		);
	}
	if (state.result === "success" && match) {
		return (
			<Alert tone="success" title={t`Operation verified`}>
				<p className="text-xs text-fg-muted">
					<a
						href={getExplorerTxUrl(match.hash, isTestnet)}
						target="_blank"
						rel="noopener"
						className="text-brand hover:underline"
					>
						{shortenAddress(match.hash, 6, 6)}
					</a>
				</p>
			</Alert>
		);
	}
	if (state.result === "unknown") {
		return (
			<div className="space-y-3">
				<Alert
					tone="warning"
					title={t`Status not confirmed`}
					description={safeError ?? t`Do not submit this operation again.`}
				/>
				{reference ? <StakingOperationReference reference={reference} /> : null}
			</div>
		);
	}
	if (state.result === "rejected") {
		return (
			<Alert
				tone="warning"
				title={t`Authorization rejected`}
				description={safeError ?? t`No operation was submitted.`}
			/>
		);
	}
	return (
		<Alert
			tone="error"
			title={t`Request rejected`}
			description={safeError ?? t`Review the public fields and try again.`}
		/>
	);
}

function StakingOperationReference({ reference }: { reference: FundsActionReference }) {
	return (
		<dl className="divide-y divide-stroke-weak rounded-8 border border-stroke-weak bg-fill-weaker px-3 text-xs">
			<ReferenceRow label={<Trans>Network</Trans>} value={reference.env} />
			<ReferenceRow label={<Trans>Owner</Trans>} value={reference.owner} mono />
			<ReferenceRow label={<Trans>SDK method</Trans>} value={reference.method} mono />
			<ReferenceRow label={<Trans>Target</Trans>} value={reference.target} mono />
			<ReferenceRow label={<Trans>Direction</Trans>} value={<DirectionLabel direction={reference.direction} />} />
			<ReferenceRow label={<Trans>Amount</Trans>} value={`${reference.displayAmount} ${reference.asset}`} />
			<ReferenceRow label={<Trans>Atomic amount</Trans>} value={reference.atomicAmount} mono />
			<ReferenceRow label={<Trans>Started</Trans>} value={formatDateTime(reference.startedAt)} />
			<ReferenceRow label={<Trans>Identity epoch</Trans>} value={reference.identityEpoch} mono />
		</dl>
	);
}

function ReferenceRow({ label, value, mono = false }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-2">
			<dt className="text-fg-muted">{label}</dt>
			<dd className={mono ? "break-all text-right font-mono text-fg" : "text-right text-fg"}>{value}</dd>
		</div>
	);
}

function DirectionLabel({ direction }: { direction: FundsActionReference["direction"] }) {
	if (direction === "deposit") return <Trans>Deposit</Trans>;
	if (direction === "withdraw") return <Trans>Withdraw</Trans>;
	if (direction === "delegate") return <Trans>Delegate</Trans>;
	return <Trans>Undelegate</Trans>;
}

function getSafeActionError(code: string | null | undefined, t: ReturnType<typeof useLingui>["t"]): string | undefined {
	if (code === "rejected") return t`The master wallet rejected the authorization.`;
	if (code === "preflightFailed")
		return t`Fresh eligibility or account data could not be verified. Review and try again.`;
	if (code === "apiError") return t`Hyperliquid rejected the verified public request.`;
	if (code === "statusUnknown") return t`Hyperliquid history has not confirmed this operation. Do not submit it again.`;
	return undefined;
}

function ControlledFooter({
	state,
	onBack,
	onConfirm,
	onRetry,
	onVerify,
	onClose,
}: {
	state: FundsActionState;
	onBack?: () => void;
	onConfirm?: () => void;
	onRetry?: () => void;
	onVerify?: () => void;
	onClose: () => void;
}) {
	if (state.stage === "review") {
		return (
			<>
				<Button variant="outline" intent="neutral" onClick={onBack}>
					<Trans>Back</Trans>
				</Button>
				<Button onClick={onConfirm}>
					<Trans>Authorize in master wallet</Trans>
				</Button>
			</>
		);
	}
	if (state.stage !== "done")
		return (
			<Button disabled>
				<Trans>Operation in progress</Trans>
			</Button>
		);
	if (state.result === "unknown") {
		return (
			<>
				<Button variant="outline" intent="neutral" onClick={onClose}>
					<Trans>Close</Trans>
				</Button>
				<Button onClick={onVerify}>
					<Trans>Verify again</Trans>
				</Button>
			</>
		);
	}
	if (state.result === "rejected" || state.result === "apiError") {
		return (
			<>
				<Button variant="outline" intent="neutral" onClick={onClose}>
					<Trans>Close</Trans>
				</Button>
				<Button onClick={onRetry}>
					<Trans>Review again</Trans>
				</Button>
			</>
		);
	}
	return (
		<Button onClick={onClose}>
			<Trans>Done</Trans>
		</Button>
	);
}

function getActionTitle(action: StakingActionRequest) {
	switch (action.kind) {
		case "cDeposit":
			return <Trans>Move Spot HYPE to staking</Trans>;
		case "cWithdraw":
			return <Trans>Move staking HYPE to Spot</Trans>;
		case "delegate":
			return <Trans>Delegate HYPE</Trans>;
		case "undelegate":
			return <Trans>Undelegate HYPE</Trans>;
	}
}

function getActionDescription(action: StakingActionRequest, isTestnet: boolean) {
	switch (action.kind) {
		case "cDeposit":
			return <Trans>Transfers HYPE from your Spot balance to your available staking balance.</Trans>;
		case "cWithdraw":
			return isTestnet ? (
				<Trans>Starts the approximately five-minute Testnet transfer queue from staking balance to Spot.</Trans>
			) : (
				<Trans>Starts the seven-day transfer queue from staking balance to Spot.</Trans>
			);
		case "delegate":
			return <Trans>Delegates available staking HYPE to the selected validator.</Trans>;
		case "undelegate":
			return <Trans>Returns delegated HYPE immediately to your available staking balance.</Trans>;
	}
}

function ActionRisk({ action, isTestnet }: { action: StakingActionRequest; isTestnet: boolean }) {
	const { t } = useLingui();
	if (action.kind === "cWithdraw") {
		if (isTestnet) {
			return (
				<Alert
					tone="warning"
					size="xs"
					title={t`Testnet queue: approximately five minutes`}
					description={t`Only this transfer starts the Testnet queue, which takes approximately five minutes. Hyperliquid allows at most five pending withdrawals per address.`}
				/>
			);
		}
		return (
			<Alert
				tone="warning"
				size="xs"
				title={t`Seven-day queue`}
				description={t`Only this transfer starts the seven-day queue. Hyperliquid allows at most five pending withdrawals per address.`}
			/>
		);
	}
	if (action.kind === "delegate") {
		return (
			<Alert
				tone="information"
				size="xs"
				title={t`One-day validator lock`}
				description={t`A new delegation is locked to this validator for one day. Rewards are distributed daily and automatically redelegated.`}
			/>
		);
	}
	if (action.kind === "undelegate") {
		return (
			<Alert
				tone="information"
				size="xs"
				title={t`No withdrawal queue`}
				description={t`Undelegating returns HYPE to the available staking balance. It does not move HYPE to Spot.`}
			/>
		);
	}
	return (
		<Alert
			tone="information"
			size="xs"
			title={t`Staking balance only`}
			description={t`Available staking HYPE can be delegated, but it cannot be traded until a separate transfer back to Spot completes.`}
		/>
	);
}

function ReviewRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-fg-muted">{label}</span>
			<span className="min-w-0 truncate font-semibold text-fg tabular-nums">{value}</span>
		</div>
	);
}

function getAmountError(validation: HypeAmountValidation, t: ReturnType<typeof useLingui>["t"]): string {
	if (validation.valid) return "";
	switch (validation.reason) {
		case "required":
			return t`Enter an amount.`;
		case "format":
			return t`Use a valid HYPE amount with no more than eight decimal places.`;
		case "positive":
			return t`Amount must be greater than zero.`;
		case "maximum":
			return t`Amount exceeds the verified available balance.`;
		case "unsafe":
			return t`Amount is too large to submit safely.`;
	}
}
