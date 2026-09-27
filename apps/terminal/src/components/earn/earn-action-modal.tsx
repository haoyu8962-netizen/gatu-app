import { ExchangeRequestInvalidatedError } from "@gatu/hl-react/internal/exchange/request-scheduler";
import { ModalContent, ModalDescription, ModalHeader, ModalTitle, Select } from "@gatu/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PendingActionModal } from "@/components/trade/components/pending-action-modal";
import { TradingActionButton } from "@/components/trade/components/trading-action-button";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import {
	type EarnAssetRow,
	type EarnOperation,
	getEarnMaxAmount,
	getEarnOperationRows,
	toEarnProtocolAmount,
	validateEarnAmount,
} from "@/domain/earn";
import {
	type EarnSubmissionRequest,
	EarnSubmissionStaleError,
	verifyFreshEarnSubmission,
} from "@/domain/earn-submission";
import { assertFreshFundsAmount, FundsExecutionError } from "@/domain/trade/funds-execution-guard";
import type { EarnData } from "@/hooks/earn/use-earn-data";
import {
	AccountAbstractionExecutionError,
	useAccountAbstractionPreExecutionGuard,
} from "@/hooks/trade/use-account-abstraction-guard";
import { FundsActionGeoExecutionError, useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatExchangeActionError, isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { formatNumber } from "@/lib/format";
import { type ExchangeParams, useExchange, useHyperliquid } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import {
	FundsActionFeedbackCause,
	formatFundsActionFeedback,
	fundsActionFeedbackCause,
} from "@/lib/trade/funds-action-feedback";
import { limitDecimalInput } from "@/lib/trade/numbers";

interface Props {
	open: boolean;
	operation: EarnOperation;
	initialToken: number | null;
	data: EarnData;
	onOpenChange: (open: boolean) => void;
}

interface EarnSubmission {
	identity: object;
	sequence: number;
	request: EarnSubmissionRequest;
	verified: boolean;
}

export function EarnActionModal({ open, operation, initialToken, data, onOpenChange }: Props) {
	return (
		<EarnActionModalBody
			key={`${operation}:${initialToken ?? "any"}:${open ? "open" : "closed"}`}
			open={open}
			operation={operation}
			initialToken={initialToken}
			data={data}
			onOpenChange={onOpenChange}
		/>
	);
}

function EarnActionModalBody({ open, operation, initialToken, data, onOpenChange }: Props) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const translate = (descriptor: MessageDescriptor) => t(descriptor);
	const isMobile = useIsMobile();
	const { hasWalletAccess, walletAddress } = useWalletSession();
	const { clientKey, env, exchangeLifecycle, sessionMode } = useHyperliquid();
	const snapshot = data.snapshot;
	const rows = snapshot ? getEarnOperationRows(operation, snapshot) : [];
	const [selectedToken, setSelectedToken] = useState<number | null>(initialToken ?? rows[0]?.token ?? null);
	const [amount, setAmount] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const dataRef = useRef(data);
	dataRef.current = data;
	const submissionSequenceRef = useRef(0);
	const submissionIdentityRef = useRef<object | null>(null);
	const submissionRef = useRef<EarnSubmission | null>(null);

	const identityKey = [
		env,
		clientKey.toLowerCase(),
		sessionMode,
		data.ownerAddress?.toLowerCase() ?? "disconnected",
		walletAddress?.toLowerCase() ?? "no-wallet",
		data.accountAbstraction,
	].join(":");
	useLayoutEffect(() => {
		const identity = { exchangeLifecycle, key: identityKey };
		submissionIdentityRef.current = identity;
		return () => {
			if (submissionIdentityRef.current === identity) submissionIdentityRef.current = null;
			if (submissionRef.current?.identity === identity) submissionRef.current = null;
			submissionSequenceRef.current += 1;
		};
	}, [exchangeLifecycle, identityKey]);

	const fundsAvailability = useFundsActionAvailability({
		accountDataReady: data.accountStatus === "ready",
		accountAbstraction: data.accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: true,
	});
	const availability = fundsAvailability.withdrawal;
	const assertAccountAbstraction = useAccountAbstractionPreExecutionGuard(data.accountAbstraction, data.ownerAddress);

	const row = rows.find((candidate) => candidate.token === selectedToken) ?? null;
	const spotAvailable = row ? getSpotAvailable(data, row.token) : null;
	const maxAmount =
		snapshot && row ? getEarnMaxAmount({ operation, row, summary: snapshot.summary, spotAvailable }) : null;
	const validation = row ? validateEarnAmount(amount, maxAmount, row.weiDecimals) : "unavailable";
	const { mutateAsync: borrowLend, isPending } = useExchange("borrowLend", {
		executionGuard: assertCurrentSubmission,
	});
	const pending = isSubmitting || isPending;
	const canSubmit = availability.available && !data.portfolioMargin && validation === "valid" && !pending;

	function assertCurrentSubmission(params: ExchangeParams<"borrowLend">) {
		const submission = submissionRef.current;
		if (
			!submission ||
			!submission.verified ||
			!exchangeLifecycle.active ||
			submission.identity !== submissionIdentityRef.current ||
			submission.sequence !== submissionSequenceRef.current ||
			params.operation !== submission.request.operation ||
			params.token !== submission.request.token ||
			params.amount !== submission.request.amount
		) {
			throw new ExchangeRequestInvalidatedError();
		}
	}

	async function verifyFreshState(request: EarnSubmissionRequest, signal: AbortSignal) {
		try {
			await assertAccountAbstraction(signal);
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof AccountAbstractionExecutionError) {
				throw fundsActionFeedbackCause(
					error.reason === "changed" ? "account-mode-changed" : "account-mode-unavailable",
				);
			}
			throw error;
		}
		try {
			await fundsAvailability.assertFreshGeoAllowed(signal);
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof FundsActionGeoExecutionError) {
				throw fundsActionFeedbackCause(error.reason === "restricted" ? "geo-restricted" : "geo-unavailable");
			}
			throw error;
		}
		const fresh = await dataRef.current.fetchFreshState();
		signal.throwIfAborted();
		const latest = dataRef.current;
		if (!fresh) throw fundsActionFeedbackCause("balance-unavailable");
		if (request.operation === "supply" || request.operation === "repay") {
			try {
				assertFreshFundsAmount(request.amount, getSpotAvailable(latest, request.token), latest.spotStateReceivedAt);
			} catch (error) {
				if (!(error instanceof FundsExecutionError)) throw error;
				throw fundsActionFeedbackCause(error.reason === "balance-changed" ? "balance-changed" : "balance-unavailable");
			}
		}
		verifyFreshEarnSubmission({
			request,
			reserves: fresh.reserves,
			userState: fresh.userState,
			inputs: latest.snapshotInputs,
			spotAvailable: getSpotAvailable(latest, request.token),
		});
	}

	async function handleSubmit() {
		if (!canSubmit || !row || maxAmount === null || submissionRef.current) return;
		const identity = submissionIdentityRef.current;
		if (!identity) return;
		const sequence = ++submissionSequenceRef.current;
		const request: EarnSubmissionRequest = {
			operation,
			token: row.token,
			amount: toEarnProtocolAmount(amount),
			displayedMax: maxAmount,
		};
		const submission: EarnSubmission = { identity, sequence, request, verified: false };
		submissionRef.current = submission;
		const isCurrent = () => submissionIdentityRef.current === identity && submissionSequenceRef.current === sequence;
		const controller = new AbortController();
		const tokenLabel = row.displayName;
		const summary = (
			<bdi dir="ltr">
				{formatNumber(request.amount)} {tokenLabel}
			</bdi>
		);
		setIsSubmitting(true);
		try {
			await verifyFreshState(request, controller.signal);
			if (!isCurrent() || submissionRef.current !== submission) throw new ExchangeRequestInvalidatedError();
			submission.verified = true;
			await borrowLend({ operation: request.operation, token: request.token, amount: request.amount });
			if (isCurrent()) {
				toast.success(getSuccessTitle(operation, tokenLabel), {
					description: summary,
					duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
				});
			}
		} catch (error) {
			if (isCurrent()) reportFailure(error);
		} finally {
			controller.abort();
			if (submissionRef.current === submission) submissionRef.current = null;
			setIsSubmitting(false);
			dataRef.current.retryAccount();
			dataRef.current.retryPublic();
			if (isCurrent()) onOpenChange(false);
		}
	}

	function reportFailure(error: unknown) {
		if (isAmbiguousExchangeActionError(error)) {
			toast.warning(t`Earn request status unknown`, {
				description: t`Check Earn Action History before retrying.`,
				duration: Number.POSITIVE_INFINITY,
				closeButton: true,
			});
			return;
		}
		if (error instanceof FundsActionFeedbackCause) {
			toast.error(formatFundsActionFeedback(error.code, (descriptor) => t(descriptor)));
			return;
		}
		if (error instanceof EarnSubmissionStaleError) {
			toast.error(t`Earn balances changed before submission. Review the updated amounts and try again.`);
			return;
		}
		toast.error(formatExchangeActionError(error, t`Earn request failed`));
	}

	function getSuccessTitle(currentOperation: EarnOperation, token: string) {
		if (currentOperation === "supply") return t`Supplied ${token}`;
		if (currentOperation === "withdraw") return t`Withdrew ${token}`;
		if (currentOperation === "borrow") return t`Borrowed ${token}`;
		return t`Repaid ${token}`;
	}

	function handleTokenChange(value: string | null) {
		if (pending || value === null) return;
		setSelectedToken(Number(value));
		setAmount("");
	}

	function handleAmountChange(value: string) {
		if (!row) return;
		setAmount(limitDecimalInput(value, row.weiDecimals));
	}

	function handleMaxClick() {
		if (pending || maxAmount === null) return;
		setAmount(maxAmount);
	}

	const title = getTitle(operation, row, translate);
	const description = getDescription(operation, row, translate);
	const tokenOptions = getTokenOptions(operation, rows, translate);
	const amountError = getAmountError(validation, translate);
	const submitLabel = getSubmitLabel(operation, translate);

	return (
		<PendingActionModal
			open={open}
			onOpenChange={onOpenChange}
			isPending={pending}
			presentation={isMobile ? "drawer" : "modal"}
		>
			<ModalHeader>
				<ModalTitle>{title}</ModalTitle>
				{description ? <ModalDescription>{description}</ModalDescription> : null}
			</ModalHeader>
			<ModalContent>
				<div className="space-y-4">
					{availability.unavailableReason ? (
						<div className="flex items-center gap-2 rounded-16 border border-stroke-info-weak bg-info-soft p-2.5 text-xs text-info">
							<WarningCircleIcon aria-hidden="true" className="size-3.5 shrink-0 text-icon-info" />
							<span className="flex-1">{availability.unavailableReason}</span>
						</div>
					) : null}
					<Select
						value={row ? String(row.token) : null}
						onValueChange={handleTokenChange}
						options={tokenOptions}
						disabled={pending || rows.length === 0}
						triggerAriaLabel={t`Asset`}
						className="w-full"
					/>
					<div className="space-y-1">
						<NumberInput
							label={operation === "repay" ? t`Amount to repay` : t`Amount`}
							labelValue={
								row && maxAmount !== null ? (
									<>
										{t`Max`}:{" "}
										<bdi dir="ltr" className="underline decoration-dashed underline-offset-2 decoration-stroke-weak">
											{formatNumber(maxAmount)} {row.displayName}
										</bdi>
									</>
								) : null
							}
							onLabelValueClick={handleMaxClick}
							placeholder="0.00"
							value={amount}
							maxAllowedDecimals={row?.weiDecimals}
							onChange={(event) => handleAmountChange(event.target.value)}
							disabled={pending || !row}
							mobileSafe
							aria-invalid={amountError ? true : undefined}
							className={cn(
								"w-full tabular-nums max-[1000px]:h-11",
								amountError && "border-stroke-error-strong focus:border-stroke-error-strong",
							)}
						/>
						{amountError ? (
							<p role="alert" className="text-2xs text-error">
								{amountError}
							</p>
						) : null}
					</div>
					{row ? <EarnActionSummary operation={operation} row={row} maxAmount={maxAmount} /> : null}
					<TradingActionButton
						requiresBuilderFee={false}
						requireReadyConfirmation
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="w-full"
						containerClassName="w-full items-stretch"
					>
						{submitLabel}
					</TradingActionButton>
				</div>
			</ModalContent>
		</PendingActionModal>
	);
}

interface SummaryProps {
	operation: EarnOperation;
	row: EarnAssetRow;
	maxAmount: string | null;
}

function EarnActionSummary({ operation, row, maxAmount }: SummaryProps) {
	const { t } = useLingui();
	useNumberFormatRevision();
	if (operation === "repay") {
		return (
			<InfoRowGroup>
				<InfoRow label={t`Total Borrowed`} value={formatAssetAmount(row.borrowed, row)} />
			</InfoRowGroup>
		);
	}
	if (operation === "withdraw") {
		return (
			<div className="space-y-1.5">
				<InfoRowGroup>
					<InfoRow label={t`Total Supplied`} value={formatAssetAmount(row.supplied, row)} />
					<InfoRow
						label={t`Available to Withdraw`}
						value={maxAmount === null ? "-" : formatAssetAmount(maxAmount, row)}
					/>
				</InfoRowGroup>
				{row.isCollateral ? (
					<p className="px-2 text-2xs text-fg-muted">{t`Repay borrows to withdraw collateral.`}</p>
				) : null}
			</div>
		);
	}
	return null;
}

function formatAssetAmount(value: string, row: EarnAssetRow) {
	return (
		<bdi dir="ltr">
			{formatNumber(value, row.amountDecimals)} {row.displayName}
		</bdi>
	);
}

function getSpotAvailable(data: EarnData, token: number): string | null {
	if (data.accountStatus !== "ready") return null;
	return data.snapshotInputs.spotBalances.get(token)?.available ?? "0";
}

type Translate = (descriptor: MessageDescriptor) => string;

function getTitle(operation: EarnOperation, row: EarnAssetRow | null, translate: Translate) {
	if (operation === "supply")
		return row?.isCollateral ? translate(msg`Supply to Borrow`) : translate(msg`Supply to Earn`);
	if (operation === "withdraw") return translate(msg`Withdraw`);
	if (operation === "borrow") return translate(msg`Borrow`);
	return translate(msg`Repay`);
}

function getDescription(operation: EarnOperation, row: EarnAssetRow | null, translate: Translate) {
	if (operation === "borrow")
		return translate(msg`Borrow against your supplied collateral. To borrow, manually supply HYPE or BTC.`);
	if (operation === "repay" && row) {
		const token = row.displayName;
		return translate(msg`Repay borrows from your ${token} available balance.`);
	}
	return null;
}

function getSubmitLabel(operation: EarnOperation, translate: Translate) {
	if (operation === "supply") return translate(msg`Supply`);
	if (operation === "withdraw") return translate(msg`Withdraw`);
	if (operation === "borrow") return translate(msg`Borrow`);
	return translate(msg`Repay`);
}

function getTokenOptions(operation: EarnOperation, rows: readonly EarnAssetRow[], translate: Translate) {
	const toOption = (row: EarnAssetRow) => ({ value: String(row.token), label: row.displayName });
	if (operation !== "supply") return rows.map(toOption);
	const earning = rows.filter((row) => !row.isCollateral).map(toOption);
	const collateral = rows.filter((row) => row.isCollateral).map(toOption);
	return [
		...(earning.length > 0 ? [{ label: translate(msg`Supply to Earn`), options: earning }] : []),
		...(collateral.length > 0 ? [{ label: translate(msg`Supply to Borrow`), options: collateral }] : []),
	];
}

function getAmountError(validation: ReturnType<typeof validateEarnAmount>, translate: Translate): string | null {
	if (validation === "invalid") return translate(msg`Enter a valid amount`);
	if (validation === "exceedsMax") return translate(msg`Insufficient funds`);
	return null;
}
