import { ExchangeRequestInvalidatedError } from "@gatu/hl-react/internal/exchange/request-scheduler";
import { Button, ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN, USDC_TRANSFER_DECIMALS } from "@/config/app";
import { exceedsBalance, isAmountWithinBalance } from "@/domain/market";
import {
	getAccountBalanceSummary,
	getSpotBalance,
	getSpotTransferable,
	getSpotTransferableValue,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import { assertFreshFundsAmount, FundsExecutionError } from "@/domain/trade/funds-execution-guard";
import {
	AccountAbstractionExecutionError,
	useAccountAbstractionPreExecutionGuard,
} from "@/hooks/trade/use-account-abstraction-guard";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { FundsActionGeoExecutionError, useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatExchangeActionError } from "@/lib/errors/format";
import { type ExchangeParams, useExchange, useHyperliquid } from "@/lib/hyperliquid";
import {
	FundsActionFeedbackCause,
	type FundsActionFeedbackCode,
	formatFundsActionFeedback,
	fundsActionFeedbackCause,
} from "@/lib/trade/funds-action-feedback";
import { floorToString, limitDecimalInput } from "@/lib/trade/numbers";
import { PendingActionModal } from "../components/pending-action-modal";

type TransferDirection = "toSpot" | "toPerp";

type TransferError = { kind: "local"; code: FundsActionFeedbackCode } | { kind: "raw"; cause: unknown };

interface TransferSubmission {
	identity: object;
	sequence: number;
	amount: string;
	toPerp: boolean;
}

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialDirection?: TransferDirection;
}

export function TransferModal({ open, onOpenChange, initialDirection = "toSpot" }: Props) {
	return (
		<TransferModalBody
			key={`${initialDirection}:${open ? "open" : "closed"}`}
			onOpenChange={onOpenChange}
			initialDirection={initialDirection}
			open={open}
		/>
	);
}

interface BodyProps {
	onOpenChange: (open: boolean) => void;
	initialDirection: TransferDirection;
	open: boolean;
}

function TransferModalBody({ onOpenChange, initialDirection, open }: BodyProps) {
	const { t } = useLingui();
	const submissionSequenceRef = useRef(0);
	const submissionIdentityRef = useRef<object | null>(null);
	const submissionRef = useRef<TransferSubmission | null>(null);
	const requestSubmissionsRef = useRef(new WeakMap<object, TransferSubmission>());
	const [direction, setDirection] = useState<TransferDirection>(initialDirection);
	const [amount, setAmount] = useState("");
	const [error, setError] = useState<TransferError | null>(null);
	const errorMessage = error
		? error.kind === "local"
			? formatFundsActionFeedback(error.code, (descriptor) => t(descriptor))
			: formatExchangeActionError(error.cause, t`Transfer failed`)
		: null;

	const { address, hasWalletAccess, sessionMode: walletSessionMode, walletAddress } = useWalletSession();
	const {
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		withdrawable,
		spotStateStatus,
		perpStateStatus,
		spotStateReceivedAt,
		perpStateReceivedAt,
		isDataStale,
		hasError: hasBalanceError,
	} = useDefaultDexBalances();
	const accountDataReady =
		spotStateStatus === "success" && perpStateStatus === "success" && !isDataStale && !hasBalanceError;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const { clientKey, env, exchangeLifecycle, sessionMode: exchangeSessionMode } = useHyperliquid();
	const submissionIdentityKey = [
		env,
		clientKey.toLowerCase(),
		exchangeSessionMode,
		address?.toLowerCase() ?? "disconnected",
		walletAddress?.toLowerCase() ?? "no-wallet",
		walletSessionMode,
		accountAbstraction,
	].join(":");
	useLayoutEffect(() => {
		const identity = { exchangeLifecycle, key: submissionIdentityKey };
		submissionIdentityRef.current = identity;
		return () => {
			if (submissionIdentityRef.current === identity) submissionIdentityRef.current = null;
			if (submissionRef.current?.identity === identity) submissionRef.current = null;
			submissionSequenceRef.current += 1;
		};
	}, [exchangeLifecycle, submissionIdentityKey]);
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady,
		accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: !isQuoteBalanceSharedWithPerps(accountAbstraction),
	});
	const accountDataReadyRef = useRef(accountDataReady);
	accountDataReadyRef.current = accountDataReady;
	const availableBalanceRef = useRef({ value: "0", receivedAt: undefined as number | undefined, direction });
	const assertAccountAbstraction = useAccountAbstractionPreExecutionGuard(accountAbstraction, walletAddress);
	async function assertCurrentAccountAbstraction(signal: AbortSignal) {
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
	}
	async function assertCurrentGeo(signal: AbortSignal) {
		try {
			await fundsActionAvailability.assertFreshGeoAllowed(signal);
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof FundsActionGeoExecutionError) {
				throw fundsActionFeedbackCause(error.reason === "restricted" ? "geo-restricted" : "geo-unavailable");
			}
			throw error;
		}
	}
	function assertCurrentFundsAmount(amount: unknown, available: unknown, receivedAt: number | undefined) {
		try {
			assertFreshFundsAmount(amount, available, receivedAt);
		} catch (error) {
			if (!(error instanceof FundsExecutionError)) throw error;
			throw fundsActionFeedbackCause(error.reason === "balance-changed" ? "balance-changed" : "balance-unavailable");
		}
	}
	function assertCurrentTransferBalance(params: ExchangeParams<"usdClassTransfer">) {
		if (!accountDataReadyRef.current) throw fundsActionFeedbackCause("balance-unavailable");
		const current = availableBalanceRef.current;
		if (params.toPerp !== (current.direction === "toPerp")) {
			throw fundsActionFeedbackCause("balance-unavailable");
		}
		assertCurrentFundsAmount(params.amount, current.value, current.receivedAt);
	}
	function assertCurrentTransferSubmission(params: ExchangeParams<"usdClassTransfer">): void {
		const submission = submissionRef.current;
		const boundSubmission = requestSubmissionsRef.current.get(params);
		if (
			!submission ||
			!exchangeLifecycle.active ||
			submission.identity !== submissionIdentityRef.current ||
			submission.sequence !== submissionSequenceRef.current ||
			(boundSubmission && boundSubmission !== submission) ||
			submission.amount !== params.amount ||
			submission.toPerp !== params.toPerp
		) {
			throw new ExchangeRequestInvalidatedError();
		}
		requestSubmissionsRef.current.set(params, submission);
	}
	const { mutateAsync: usdClassTransfer, isPending } = useExchange("usdClassTransfer", {
		executionGuard: (params) => {
			assertCurrentTransferSubmission(params);
			assertCurrentTransferBalance(params);
		},
		preExecutionGuard: async (params, signal) => {
			assertCurrentTransferBalance(params);
			await Promise.all([assertCurrentAccountAbstraction(signal), assertCurrentGeo(signal)]);
			signal.throwIfAborted();
			assertCurrentTransferBalance(params);
		},
	});

	const spotUsdcBal = getSpotBalance(spotBalances, DEFAULT_QUOTE_TOKEN);
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary,
		perpSummary,
		withdrawable,
		spotBalances,
		spotAvailableAfterMaintenance,
	});
	const internalTransfersDisabled = !fundsActionAvailability.internalTransfer.available;
	const internalTransfersDisabledReason = getFundsAvailabilityNotice(fundsActionAvailability.internalTransfer);
	const availableBalanceValue =
		accountModeReady && accountDataReady
			? direction === "toSpot"
				? accountSummary.withdrawable
				: getSpotTransferable(spotUsdcBal)
			: 0;
	const availableBalanceExact =
		accountModeReady && accountDataReady
			? direction === "toSpot"
				? String(withdrawable)
				: getSpotTransferableValue(spotUsdcBal)
			: "0";
	availableBalanceRef.current = {
		value: availableBalanceExact,
		receivedAt: direction === "toSpot" ? perpStateReceivedAt : spotStateReceivedAt,
		direction,
	};

	const isValidAmount =
		fundsActionAvailability.internalTransfer.available &&
		isAmountWithinBalance(amount, availableBalanceValue) &&
		hasWalletAccess &&
		!!walletAddress;

	const fromLabel = direction === "toSpot" ? t`Perp` : t`Spot`;
	const toLabel = direction === "toSpot" ? t`Spot` : t`Perp`;

	function handleFlip() {
		if (internalTransfersDisabled || !accountDataReady || isPending) return;
		setDirection((prev) => (prev === "toSpot" ? "toPerp" : "toSpot"));
		setAmount("");
	}

	async function handleTransfer() {
		if (!isValidAmount || !accountDataReady || isPending || !walletAddress || internalTransfersDisabled) return;

		const submissionIdentity = submissionIdentityRef.current;
		if (!submissionIdentity || submissionRef.current) return;
		const submissionSequence = ++submissionSequenceRef.current;
		const submission: TransferSubmission = {
			identity: submissionIdentity,
			sequence: submissionSequence,
			amount,
			toPerp: direction === "toPerp",
		};
		submissionRef.current = submission;
		const isCurrentSubmission = () =>
			submissionIdentityRef.current === submissionIdentity && submissionSequenceRef.current === submissionSequence;
		setError(null);
		try {
			await usdClassTransfer({ amount, toPerp: direction === "toPerp" });
			if (isCurrentSubmission()) {
				setAmount("");
				onOpenChange(false);
			}
		} catch (err) {
			if (!isCurrentSubmission()) return;
			setError(
				err instanceof FundsActionFeedbackCause ? { kind: "local", code: err.code } : { kind: "raw", cause: err },
			);
		} finally {
			if (submissionRef.current === submission) submissionRef.current = null;
		}
	}

	function handleAmountChange(value: string) {
		setAmount(limitDecimalInput(value, USDC_TRANSFER_DECIMALS));
	}

	function handleMaxClick() {
		if (internalTransfersDisabled || !accountDataReady || isPending) return;
		setAmount(floorToString(availableBalanceValue, USDC_TRANSFER_DECIMALS));
	}

	return (
		<PendingActionModal open={open} onOpenChange={onOpenChange} isPending={isPending}>
			<ModalHeader>
				<ModalTitle>{t`Transfer USDC`}</ModalTitle>
				<ModalDescription>{t`Move USDC between your Perp and Spot accounts.`}</ModalDescription>
			</ModalHeader>

			<ModalContent>
				<div className="space-y-4">
					{!hasWalletAccess && (
						<div className="flex items-center gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft p-2.5 text-xs text-warning">
							<WarningCircleIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{t`Connect your wallet to transfer funds.`}</span>
						</div>
					)}
					{internalTransfersDisabledReason && (
						<div className="flex items-center gap-2 rounded-8 border border-stroke-info-weak bg-info-soft p-2.5 text-xs text-info">
							<WarningCircleIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{internalTransfersDisabledReason}</span>
						</div>
					)}

					{accountModeReady ? (
						<>
							<div className="flex items-center justify-center gap-3 py-2">
								<div className="flex flex-col items-center">
									<span
										className={cn(
											"bg-fill-weak text-xs px-2 py-1 uppercase font-medium",
											direction === "toSpot" ? "text-scope-perp" : "text-scope-spot",
										)}
									>
										{fromLabel}
									</span>
								</div>
								<button
									type="button"
									onClick={handleFlip}
									aria-label={t`Flip transfer direction`}
									disabled={internalTransfersDisabled || isPending}
									className="p-1.5 rounded-8 hover:bg-fill-hover transition-colors text-fg-muted hover:text-action"
								>
									<ArrowsLeftRightIcon className="size-4" />
								</button>
								<div className="flex flex-col items-center">
									<span
										className={cn(
											"bg-fill-weak text-xs px-2 py-1 uppercase font-medium",
											direction === "toPerp" ? "text-scope-perp" : "text-scope-spot",
										)}
									>
										{toLabel}
									</span>
								</div>
							</div>

							<NumberInput
								label={t`Amount`}
								labelValue={
									<>
										{t`Available`}:{" "}
										<span className="underline decoration-dashed underline-offset-2 decoration-stroke-weak">
											{floorToString(availableBalanceValue, USDC_TRANSFER_DECIMALS)} USDC
										</span>
									</>
								}
								onLabelValueClick={handleMaxClick}
								placeholder="0.00"
								value={amount}
								onChange={(e) => handleAmountChange(e.target.value)}
								disabled={internalTransfersDisabled || isPending}
								mobileSafe
								className={cn(
									"w-full tabular-nums max-[1000px]:h-11",
									accountDataReady &&
										exceedsBalance(amount, availableBalanceValue) &&
										"border-stroke-error-strong focus:border-stroke-error-strong",
								)}
							/>
						</>
					) : null}

					{errorMessage && (
						<div
							role="alert"
							className="flex items-center gap-2 p-2.5 rounded-8 bg-error-soft border border-stroke-error-weak text-xs text-error"
						>
							<WarningCircleIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{errorMessage}</span>
						</div>
					)}

					<Button
						variant="filled"
						intent="neutral"
						onClick={handleTransfer}
						disabled={!isValidAmount || isPending}
						className="w-full"
					>
						{isPending && <SpinnerGapIcon className="me-2 size-3.5 animate-spin" />}
						{isPending ? t`Transferring...` : t`Transfer`}
					</Button>
				</div>
			</ModalContent>
		</PendingActionModal>
	);
}
