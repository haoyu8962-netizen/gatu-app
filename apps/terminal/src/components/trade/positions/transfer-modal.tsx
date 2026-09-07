import { Button, ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowsLeftRightIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
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
import { assertFreshFundsAmount } from "@/domain/trade/funds-execution-guard";
import { useAccountAbstractionPreExecutionGuard } from "@/hooks/trade/use-account-abstraction-guard";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatExchangeActionError } from "@/lib/errors/format";
import { useExchange } from "@/lib/hyperliquid";
import { floorToString, limitDecimalInput } from "@/lib/trade/numbers";
import { PendingActionModal } from "../components/pending-action-modal";

type TransferDirection = "toSpot" | "toPerp";

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
	const [direction, setDirection] = useState<TransferDirection>(initialDirection);
	const [amount, setAmount] = useState("");
	const [error, setError] = useState<string | null>(null);

	const { hasWalletAccess, walletAddress } = useWalletSession();
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
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady,
		accountModeReady,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: !isQuoteBalanceSharedWithPerps(accountAbstraction),
	});
	const accountDataReadyRef = useRef(accountDataReady);
	accountDataReadyRef.current = accountDataReady;
	const availableBalanceRef = useRef({ value: "0", receivedAt: undefined as number | undefined, direction });
	const assertAccountAbstraction = useAccountAbstractionPreExecutionGuard(accountAbstraction, walletAddress);
	const { mutateAsync: usdClassTransfer, isPending } = useExchange("usdClassTransfer", {
		preExecutionGuard: async (params, signal) => {
			const assertCurrentBalance = () => {
				if (!accountDataReadyRef.current)
					throw new Error(t`Balance data is unavailable. Try again after the connection recovers.`);
				const current = availableBalanceRef.current;
				if (params.toPerp !== (current.direction === "toPerp")) {
					throw new Error(t`Balance data is unavailable. Try again after the connection recovers.`);
				}
				assertFreshFundsAmount(params.amount, current.value, current.receivedAt);
			};
			assertCurrentBalance();
			await Promise.all([assertAccountAbstraction(signal), fundsActionAvailability.assertFreshGeoAllowed(signal)]);
			signal.throwIfAborted();
			assertCurrentBalance();
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

		setError(null);
		try {
			await usdClassTransfer({ amount, toPerp: direction === "toPerp" });
			setAmount("");
			onOpenChange(false);
		} catch (err) {
			setError(formatExchangeActionError(err, t`Transfer failed`));
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

					{error && (
						<div className="flex items-center gap-2 p-2.5 rounded-8 bg-error-soft border border-stroke-error-weak text-xs text-error">
							<WarningCircleIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{error}</span>
						</div>
					)}

					<Button
						variant="filled"
						intent="neutral"
						onClick={handleTransfer}
						disabled={!isValidAmount || isPending}
						className="w-full"
					>
						{isPending && <SpinnerGapIcon className="size-3.5 animate-spin mr-2" />}
						{isPending ? t`Transferring...` : t`Transfer`}
					</Button>
				</div>
			</ModalContent>
		</PendingActionModal>
	);
}
