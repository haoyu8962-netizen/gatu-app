import { Trans } from "@lingui/react/macro";
import { Button } from "@sairn/ui";
import { formatUnits } from "viem";
import { USDC_ICON_URL } from "@/config/bridge";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import type { UsdcRoutingQueryStatus, UsdcTransferRoute } from "@/domain/trade/usdc-routing";
import { useNumberFormat } from "@/lib/format";
import type { SponsoredCctpReadiness } from "@/lib/hyperliquid/use-deposit";
import { AmountInput } from "./amount-input";
import { FundingAddressCard } from "./funding-address-card";
import { FundsRouteDetails } from "./funds-route-details";
import { UnitDepositInfo } from "./unit-deposit-info";

interface Props {
	amount: string;
	onAmountChange: (value: string) => void;
	balance: string;
	maxAmount: string;
	maxDepositRaw: bigint | undefined;
	balanceStatus: "idle" | "loading" | "success" | "error";
	validation: { valid: boolean; error: string | null };
	amountError?: string | null;
	preflightError?: string | null;
	onRetryData: () => void;
	isPending: boolean;
	onSubmit: () => void;
	routingStatus: UsdcRoutingQueryStatus;
	routingPreflightError?: string | null;
	depositRoute: UsdcTransferRoute | null;
	onRetryRouting: () => void;
	networkName: string;
	sponsoredCctpEnabled: boolean;
	sponsoredCctpReadiness: SponsoredCctpReadiness;
	depositUnavailableReason?: string | null;
	requiresExplicitFundingDeposit: boolean;
	cctpFee: string | null;
	cctpFeeLoading: boolean;
	cctpFeeError: boolean;
	pendingCctpRecovery: boolean;
	usesFundingAddressFlow: boolean;
	fundingAddressPending: boolean;
	fundingAddressError?: string | null;
	fundingAddress?: `0x${string}`;
	onRetryFundingAddress?: () => void;
	onDone?: () => void;
}

export function DepositForm({
	amount,
	onAmountChange,
	balance: walletBalance,
	maxAmount,
	maxDepositRaw,
	balanceStatus,
	validation,
	amountError = null,
	preflightError = null,
	onRetryData,
	isPending,
	onSubmit,
	routingStatus,
	routingPreflightError = null,
	depositRoute,
	onRetryRouting,
	networkName,
	sponsoredCctpEnabled,
	sponsoredCctpReadiness,
	depositUnavailableReason = null,
	requiresExplicitFundingDeposit,
	cctpFee: cctpFeeAmount,
	cctpFeeLoading,
	cctpFeeError,
	pendingCctpRecovery,
	usesFundingAddressFlow,
	fundingAddressPending,
	fundingAddressError = null,
	fundingAddress,
	onRetryFundingAddress,
	onDone,
}: Props) {
	const { formatDecimalString } = useNumberFormat();
	const balance = formatDecimalString(walletBalance);
	const cctpFee = cctpFeeAmount === null ? null : formatDecimalString(cctpFeeAmount);
	const minimumDeposit = `${formatDecimalString(formatUnits(MIN_DEPOSIT_USDC, USDC_DECIMALS))} USDC`;
	const bridgeRoutingReady = routingStatus === "ready" && depositRoute === "bridge";
	const cctpRoutingReady = routingStatus === "ready" && depositRoute === "cctp";
	const explicitFundingDepositReady =
		requiresExplicitFundingDeposit &&
		cctpRoutingReady &&
		sponsoredCctpEnabled &&
		sponsoredCctpReadiness.status === "ready" &&
		!!fundingAddress;
	const explicitFundingDepositDisabled =
		!explicitFundingDepositReady ||
		!validation.valid ||
		isPending ||
		fundingAddressPending ||
		!!fundingAddressError ||
		!!depositUnavailableReason ||
		!!routingPreflightError ||
		balanceStatus !== "success" ||
		cctpFeeLoading ||
		cctpFeeError ||
		pendingCctpRecovery;
	const routingNotice = (() => {
		if (!routingPreflightError && !bridgeRoutingReady) {
			return null;
		}
		return (
			<div
				role="alert"
				className="rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-danger"
			>
				<p>
					{routingPreflightError ? (
						routingPreflightError
					) : (
						<Trans>Legacy Bridge2 deposits are no longer accepted. Deposits are paused.</Trans>
					)}
				</p>
				{routingPreflightError && bridgeRoutingReady ? (
					<p className="mt-1">
						<Trans>Legacy Bridge2 deposits are no longer accepted. Deposits are paused.</Trans>
					</p>
				) : null}
				{routingPreflightError ? (
					<Button
						variant="link"
						intent="neutral"
						size="xxs"
						className="mt-1 h-auto p-0 text-market-close-fg active:not-data-disabled:scale-100"
						onClick={onRetryRouting}
					>
						<Trans>Retry</Trans>
					</Button>
				) : null}
			</div>
		);
	})();
	const actionNotice = preflightError ?? depositUnavailableReason;
	const formValidationNotice =
		!routingNotice && actionNotice ? (
			<div
				role="alert"
				className="rounded-8 border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-xs text-market-close-danger"
			>
				{actionNotice}
			</div>
		) : null;
	const retryDataAction =
		(balanceStatus === "error" || cctpFeeError || preflightError) && !depositUnavailableReason ? (
			<Button
				variant="link"
				intent="neutral"
				size="xxs"
				className="h-auto self-start p-0"
				onClick={onRetryData}
				disabled={isPending || balanceStatus === "loading" || cctpFeeLoading}
			>
				<Trans>Retry</Trans>
			</Button>
		) : null;
	const embeddedDepositStatus = (() => {
		if (!sponsoredCctpEnabled) {
			return <Trans>Gas-sponsored CCTP deposits are not enabled for this network.</Trans>;
		}
		if (balanceStatus !== "success") return null;
		if (maxDepositRaw === undefined || maxDepositRaw === 0n) {
			return null;
		}
		if (maxDepositRaw < MIN_DEPOSIT_USDC) {
			return (
				<Trans>
					Available {balance} USDC is below the minimum deposit. Send at least {minimumDeposit}.
				</Trans>
			);
		}
		return null;
	})();
	const transferSelectors = (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-3 text-2xs leading-4 text-market-close-subtle">
				<span className="whitespace-nowrap">
					<Trans>You send</Trans>
				</span>
				<span className="whitespace-nowrap tabular-nums">
					<Trans>Minimum</Trans> {minimumDeposit}
				</span>
			</div>
			<FundsRouteDetails network={networkName} />
		</div>
	);

	if (usesFundingAddressFlow) {
		const retryRoutingAction =
			routingPreflightError || routingStatus === "error" || routingStatus === "unknown" ? (
				<Button
					variant="link"
					intent="neutral"
					size="xxs"
					className="h-auto p-0 text-market-close-fg active:not-data-disabled:scale-100"
					onClick={onRetryRouting}
					disabled={isPending}
				>
					<Trans>Retry</Trans>
				</Button>
			) : undefined;
		const retrySponsoredReadinessAction =
			sponsoredCctpReadiness.status === "error" && sponsoredCctpReadiness.failure !== "build-gate-disabled" ? (
				<Button
					variant="link"
					intent="neutral"
					size="xxs"
					className="h-auto p-0 text-market-close-fg active:not-data-disabled:scale-100"
					onClick={sponsoredCctpReadiness.retry}
				>
					<Trans>Retry</Trans>
				</Button>
			) : undefined;
		const retryFundingAddressAction =
			fundingAddressError && onRetryFundingAddress ? (
				<Button
					variant="link"
					intent="neutral"
					size="xxs"
					className="h-auto p-0 text-market-close-fg active:not-data-disabled:scale-100"
					onClick={onRetryFundingAddress}
				>
					<Trans>Retry</Trans>
				</Button>
			) : undefined;
		const sponsoredReadinessError = (() => {
			switch (sponsoredCctpReadiness.failure) {
				case "build-gate-disabled":
					return <Trans>Gas-sponsored CCTP deposits are not enabled for this network.</Trans>;
				case "wrong-chain":
					return <Trans>The gas-sponsored wallet is configured for a different Arbitrum network.</Trans>;
				default:
					return null;
			}
		})();
		const fundingAddressReady =
			!depositUnavailableReason &&
			cctpRoutingReady &&
			sponsoredCctpEnabled &&
			sponsoredCctpReadiness.status === "ready" &&
			!!fundingAddress;
		const fundingAddressState = (() => {
			if (depositUnavailableReason) {
				return { message: depositUnavailableReason, state: "unavailable" } as const;
			}
			if (routingPreflightError) {
				return { message: routingPreflightError, action: retryRoutingAction, state: "unavailable" } as const;
			}
			if (routingStatus === "loading") {
				return { state: "loading" } as const;
			}
			if (cctpRoutingReady && !sponsoredCctpEnabled) {
				return {
					message: <Trans>Gas-sponsored CCTP deposits are not enabled for this network.</Trans>,
					state: "unavailable",
				} as const;
			}
			if (bridgeRoutingReady) {
				return {
					message: <Trans>Legacy Bridge2 deposits are no longer accepted. Deposits are paused.</Trans>,
					state: "unavailable",
				} as const;
			}
			if (!cctpRoutingReady) {
				return {
					action: retryRoutingAction,
					state: "pending",
				} as const;
			}
			if (fundingAddressPending) {
				return { state: "loading" } as const;
			}
			if (fundingAddressError) {
				return {
					action: retryFundingAddressAction,
					state: "pending",
				} as const;
			}
			if (sponsoredCctpReadiness.status === "idle" || sponsoredCctpReadiness.status === "loading") {
				return { state: "loading" } as const;
			}
			if (sponsoredCctpReadiness.status === "error") {
				return {
					...(sponsoredCctpReadiness.failure === "build-gate-disabled" ||
					sponsoredCctpReadiness.failure === "wrong-chain"
						? { message: sponsoredReadinessError, state: "unavailable" as const }
						: { state: "pending" as const }),
					action: retrySponsoredReadinessAction,
				} as const;
			}
			if (fundingAddressReady && fundingAddress) return { address: fundingAddress, state: "ready" } as const;
			return { state: "pending", action: retryFundingAddressAction } as const;
		})();
		const showFundingDestinationDetails =
			!depositUnavailableReason &&
			cctpRoutingReady &&
			sponsoredCctpEnabled &&
			(fundingAddressState.state === "loading" || fundingAddressState.state === "ready");
		const showFundingDestinationPlaceholders =
			!depositUnavailableReason && routingStatus === "loading" && sponsoredCctpEnabled;
		const showExplicitFundingDepositAction =
			requiresExplicitFundingDeposit &&
			!depositUnavailableReason &&
			sponsoredCctpEnabled &&
			(showFundingDestinationDetails || showFundingDestinationPlaceholders) &&
			maxDepositRaw !== undefined &&
			maxDepositRaw > 0n;
		const fundingNetworkNotice = (
			<Trans>
				Important: this address can only receive native USDC on Arbitrum. Do not send USDC.e or assets from other
				networks. Minimum deposit is {minimumDeposit}.
			</Trans>
		);

		return (
			<div
				className="flex flex-1 flex-col gap-3.5 font-market-close text-market-close-fg"
				data-deposit-layout="funding-address"
				data-deposit-readiness={sponsoredCctpReadiness.status}
				aria-busy={
					routingStatus === "loading" ||
					fundingAddressState.state === "loading" ||
					balanceStatus === "loading" ||
					cctpFeeLoading ||
					isPending
				}
			>
				<div className="pt-0.5 text-center">
					<h3 className="text-[15px] leading-5 font-bold">
						<Trans>Deposit USDC from Arbitrum</Trans>
					</h3>
				</div>

				{requiresExplicitFundingDeposit && fundingAddressState.state !== "unavailable" ? (
					<ol
						className="list-decimal space-y-1 pl-4 text-xs leading-5 text-market-close-muted"
						data-slot="funding-steps"
					>
						<li>
							<Trans>Send USDC to your wallet address below.</Trans>
						</li>
						<li>
							<Trans>
								After the funds arrive, return here and select Deposit to move them into your trading account.
							</Trans>
						</li>
					</ol>
				) : null}
				{transferSelectors}

				<FundingAddressCard {...fundingAddressState} />

				{showFundingDestinationDetails ? (
					<div className="contents" data-deposit-slot="funding-details">
						{fundingAddressReady && embeddedDepositStatus ? (
							<div
								role="alert"
								className="rounded-8 border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-danger"
							>
								{embeddedDepositStatus}
							</div>
						) : null}

						<UnitDepositInfo cctpFee={cctpFeeAmount} cctpFeeLoading={cctpFeeLoading} cctpFeeError={cctpFeeError} />
					</div>
				) : showFundingDestinationPlaceholders ? (
					<div
						aria-hidden="true"
						className="space-y-2 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3.5 py-3"
						data-deposit-placeholder="funding-details"
						data-deposit-slot="funding-details"
					>
						{["receive", "fee", "time"].map((row) => (
							<div
								className={
									row === "receive"
										? "flex h-5 items-center justify-between gap-3"
										: "flex h-4 items-center justify-between gap-3"
								}
								key={row}
							>
								<div className="h-2 w-16 rounded-full bg-market-close-stroke-input/50" />
								<div className="h-2 w-24 rounded-full bg-market-close-stroke-input/50" />
							</div>
						))}
					</div>
				) : null}

				{showFundingDestinationDetails ? (
					<div
						className="rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-danger"
						data-deposit-notice="funding-network"
						data-deposit-slot="funding-network-notice"
					>
						{fundingNetworkNotice}
					</div>
				) : showFundingDestinationPlaceholders ? (
					<div
						aria-hidden="true"
						className="relative overflow-hidden rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-muted"
						data-deposit-placeholder="funding-network-notice"
						data-deposit-slot="funding-network-notice"
					>
						<span className="invisible">{fundingNetworkNotice}</span>
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3">
							<div className="h-2 w-4/5 rounded-full bg-market-close-stroke-input/50" />
							<div className="h-2 w-3/5 rounded-full bg-market-close-stroke-input/50" />
						</div>
					</div>
				) : null}

				{preflightError ? (
					<div role="alert" className="text-xs text-market-close-danger">
						{preflightError}
					</div>
				) : null}
				{retryDataAction}
				{showExplicitFundingDepositAction ? (
					<Button
						variant="filled"
						intent="neutral"
						onClick={onSubmit}
						disabled={explicitFundingDepositDisabled}
						aria-busy={isPending}
						className="min-h-11 w-full rounded-[12px] bg-market-close-control text-[13px] font-bold text-market-close-on-control shadow-none hover:opacity-90 data-disabled:bg-market-close-stroke-control data-disabled:text-market-close-on-control"
					>
						<Trans>Deposit</Trans>{" "}
						<span className="tabular-nums">{balanceStatus === "success" ? balance : "--"} USDC</span>
					</Button>
				) : null}

				<Button
					variant="filled"
					intent="neutral"
					onClick={onDone}
					className="mt-auto min-h-11 w-full rounded-[12px] bg-market-close-control text-[13px] font-bold text-market-close-on-control shadow-none hover:opacity-90"
				>
					<Trans>Done</Trans>
				</Button>
			</div>
		);
	}

	return (
		<div
			className="flex flex-1 flex-col gap-3.5 font-market-close text-market-close-fg"
			aria-busy={routingStatus === "loading" || balanceStatus === "loading" || cctpFeeLoading || isPending}
		>
			<div className="flex flex-col items-center gap-2 text-center">
				<img src={USDC_ICON_URL} alt="" aria-hidden="true" className="size-10 rounded-full" />
				<div className="space-y-0.5">
					<h3 className="text-[15px] leading-[21px] font-bold text-market-close-fg">
						<Trans>Deposit USDC from Arbitrum</Trans>
					</h3>
					<p className="min-h-[18px] text-2xs leading-[18px] text-market-close-subtle">
						{cctpRoutingReady ? (
							!cctpFeeError && !cctpFeeLoading && cctpFee ? (
								<Trans>Up to {cctpFee} USDC in fees will be deducted from your deposit.</Trans>
							) : (
								<span aria-hidden="true">--</span>
							)
						) : null}
					</p>
				</div>
			</div>

			{transferSelectors}

			{routingNotice}
			{formValidationNotice}
			{retryDataAction}
			{!routingNotice && (routingStatus === "error" || routingStatus === "unknown") ? (
				<Button variant="link" intent="neutral" size="xxs" onClick={onRetryRouting} disabled={isPending}>
					<Trans>Retry</Trans>
				</Button>
			) : null}
			{pendingCctpRecovery ? (
				<div className="rounded-[10px] border border-stroke-info-weak bg-info-soft px-3 py-2.5 text-center text-xs leading-relaxed text-info">
					<Trans>A previous CCTP deposit is still being tracked. Do not resubmit the same transfer.</Trans>
				</div>
			) : null}

			<AmountInput
				amount={amount}
				onAmountChange={onAmountChange}
				balance={walletBalance}
				maxAmount={maxAmount}
				balanceStatus={balanceStatus}
				validation={validation}
				amountError={amountError}
				isPending={isPending}
				onSubmit={onSubmit}
			/>
		</div>
	);
}
