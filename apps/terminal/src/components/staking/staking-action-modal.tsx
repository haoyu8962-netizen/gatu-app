import { AdaptiveModal, Alert, Button, ModalContent, ModalFooter, ModalHeader, ModalTitle, TextInput } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { normalizeDecimalInputEvent } from "@/components/ui/decimal-input-event";
import { formatDateTime, shortenAddress } from "@/lib/format";
import type { FundsActionReference } from "../funds-action/funds-action-marker";
import { type FundsActionState, getFundsActionSteps } from "../funds-action/funds-action-state";
import {
	createStakingActionSubmission,
	formatStakingAmount,
	type HypeAmountValidation,
	type StakingActionRequest,
	type StakingActionSubmission,
	validateHypeActionAmount,
} from "./domain/staking";
import { formatStakingActionError } from "./domain/staking-action-feedback";

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
	reference?: FundsActionReference | null;
	locked?: boolean;
	isTestnet?: boolean;
	onBack?: () => void;
	onConfirm?: () => void;
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
	reference,
	locked = false,
	isTestnet = false,
	onBack,
	onConfirm,
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
							dir="ltr"
							autoComplete="off"
							value={amount}
							onChange={(event) => {
								setAmount(normalizeDecimalInputEvent(event).currentTarget.value);
								setShowError(false);
							}}
							placeholder="0.00"
							mobileSafe
							className="max-[1000px]:min-h-11"
							iconRight={<span className="text-xs font-semibold">HYPE</span>}
							error={showError && !validation.valid ? getAmountError(validation, t) : undefined}
						/>
						<div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
							<span>
								<Trans>Available</Trans>: <bdi dir="ltr">{formatStakingAmount(action.maxAmount)} HYPE</bdi>
							</span>
							<Button variant="ghost" intent="brand" size="xs" onClick={() => setAmount(action.maxAmount)}>
								<Trans>Max</Trans>
							</Button>
						</div>
						<ActionRisk action={action} isTestnet={isTestnet} />
					</>
				) : visibleStage === "review" ? (
					<>
						<div className="space-y-2 py-3 text-xs">
							<ReviewRow label={t`Signing account`} value={shortenAddress(ownerAddress, 6, 6)} ltr />
							{action.validator ? (
								<ReviewRow
									label={t`Validator`}
									value={action.validatorName || shortenAddress(action.validator, 6, 6)}
									ltr={!action.validatorName}
								/>
							) : null}
							<ReviewRow label={t`Amount`} value={`${formatStakingAmount(submission?.amount ?? "0", 8)} HYPE`} ltr />
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
					<ActionStatus state={fundsState} errorMessage={errorMessage} reference={reference} />
				)}
			</ModalContent>
			<ModalFooter>
				{controlled && fundsState ? (
					<ControlledFooter
						state={fundsState}
						onBack={onBack}
						onConfirm={onConfirm}
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
					className="truncate rounded-8 bg-fill-weaker px-1 py-1 text-center text-2xs text-fg-muted data-[active=true]:bg-fill-weak data-[active=true]:text-action"
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
	reference,
}: {
	state: FundsActionState | undefined;
	errorMessage?: string | null;
	reference?: FundsActionReference | null;
}) {
	const { t } = useLingui();
	const safeError = formatStakingActionError(errorMessage, (descriptor) => t(descriptor));
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
	if (state.stage === "done" && state.result === "unknown") {
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
	if (state.stage === "submitted" || state.stage === "reconciling" || state.stage === "done") {
		return (
			<Alert
				tone="information"
				title={t`Verifying from history`}
				description={t`Do not submit again while Hyperliquid history is checked.`}
			/>
		);
	}
	return null;
}

function StakingOperationReference({ reference }: { reference: FundsActionReference }) {
	return (
		<dl className="divide-y divide-stroke-weak rounded-8 border border-stroke-weak bg-fill-weaker px-3 text-xs">
			<ReferenceRow label={<Trans>Network</Trans>} value={reference.env} />
			<ReferenceRow label={<Trans>Owner</Trans>} value={reference.owner} mono />
			<ReferenceRow label={<Trans>SDK method</Trans>} value={reference.method} mono />
			<ReferenceRow label={<Trans>Target</Trans>} value={reference.target} mono />
			<ReferenceRow label={<Trans>Direction</Trans>} value={<DirectionLabel direction={reference.direction} />} />
			<ReferenceRow label={<Trans>Amount</Trans>} value={`${reference.displayAmount} ${reference.asset}`} ltr />
			<ReferenceRow label={<Trans>Atomic amount</Trans>} value={reference.atomicAmount} mono />
			<ReferenceRow label={<Trans>Started</Trans>} value={formatDateTime(reference.startedAt)} ltr />
			<ReferenceRow label={<Trans>Identity epoch</Trans>} value={reference.identityEpoch} mono />
		</dl>
	);
}

function ReferenceRow({
	label,
	value,
	mono = false,
	ltr = false,
}: {
	label: ReactNode;
	value: ReactNode;
	mono?: boolean;
	ltr?: boolean;
}) {
	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-2">
			<dt className="text-fg-muted">{label}</dt>
			<dd className={mono ? "break-all text-right font-mono text-fg" : "text-right text-fg"}>
				{mono || ltr ? <bdi dir="ltr">{value}</bdi> : value}
			</dd>
		</div>
	);
}

function DirectionLabel({ direction }: { direction: FundsActionReference["direction"] }) {
	if (direction === "deposit") return <Trans>Deposit</Trans>;
	if (direction === "withdraw") return <Trans>Withdraw</Trans>;
	if (direction === "delegate") return <Trans>Delegate</Trans>;
	return <Trans>Undelegate</Trans>;
}

function ControlledFooter({
	state,
	onBack,
	onConfirm,
	onVerify,
	onClose,
}: {
	state: FundsActionState;
	onBack?: () => void;
	onConfirm?: () => void;
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
	if (state.stage !== "done" || state.result !== "unknown") return null;
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

function ReviewRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-fg-muted">{label}</span>
			<span className="min-w-0 truncate font-semibold text-fg tabular-nums">
				{ltr ? <bdi dir="ltr">{value}</bdi> : value}
			</span>
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
