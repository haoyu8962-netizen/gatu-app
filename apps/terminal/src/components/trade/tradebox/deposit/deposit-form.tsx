import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatUnits } from "viem";
import { USDC_ICON_URL } from "@/config/bridge";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import type { UsdcRoutingQueryStatus, UsdcTransferRoute } from "@/domain/trade/usdc-routing";
import type { SponsoredCctpReadiness } from "@/lib/hyperliquid/use-deposit";
import { AmountInput } from "./amount-input";
import { AssetSelect } from "./asset-select";
import { FundingAddressCard } from "./funding-address-card";
import { NetworkSelect } from "./shared-ui";
import { UnitDepositInfo } from "./unit-deposit-info";

interface Props {
	amount: string;
	onAmountChange: (value: string) => void;
	balance: string;
	maxAmount: string;
	maxDepositRaw: bigint | undefined;
	balanceStatus: "idle" | "loading" | "success" | "error";
	balanceError: Error | null;
	validation: { valid: boolean; error: string | null };
	amountError?: string | null;
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
	balance,
	maxAmount,
	maxDepositRaw,
	balanceStatus,
	balanceError,
	validation,
	amountError = null,
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
	cctpFee,
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
	const { t } = useLingui();
	const minimumDeposit = `${formatUnits(MIN_DEPOSIT_USDC, USDC_DECIMALS)} USDC`;
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
		balanceStatus === "loading" ||
		balanceStatus === "error" ||
		cctpFeeLoading ||
		pendingCctpRecovery;
	const routingNotice = (() => {
		if (!routingPreflightError && (routingStatus === "loading" || (cctpRoutingReady && !fundingAddress))) {
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
					) : bridgeRoutingReady ? (
						<Trans>Legacy Bridge2 deposits are no longer accepted. Deposits are paused.</Trans>
					) : (
						<Trans>Unable to verify the current Hyperliquid deposit route. Deposits are paused.</Trans>
					)}
				</p>
				{routingPreflightError && bridgeRoutingReady ? (
					<p className="mt-1">
						<Trans>Legacy Bridge2 deposits are no longer accepted. Deposits are paused.</Trans>
					</p>
				) : null}
				{routingPreflightError || !bridgeRoutingReady ? (
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
	const formValidationNotice =
		!routingNotice && validation.error && validation.error !== amountError ? (
			<div
				role="alert"
				className="rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-danger"
			>
				{validation.error}
			</div>
		) : null;
	const embeddedDepositStatus = (() => {
		if (!sponsoredCctpEnabled) {
			return {
				tone: "error" as const,
				text: <Trans>Gas-sponsored CCTP deposits are not enabled for this network.</Trans>,
			};
		}
		if (balanceStatus === "loading") {
			return null;
		}
		if (balanceStatus === "error") {
			return {
				tone: "error" as const,
				text: balanceError?.message || t`Unable to load Arbitrum USDC balance`,
			};
		}
		if (maxDepositRaw === undefined || maxDepositRaw === 0n) {
			return null;
		}
		if (maxDepositRaw < MIN_DEPOSIT_USDC) {
			return {
				tone: "error" as const,
				text: (
					<Trans>
						Available {balance} USDC is below the minimum deposit. Send at least {minimumDeposit}.
					</Trans>
				),
			};
		}
		if (validation.error) {
			return {
				tone: "error" as const,
				text: validation.error,
			};
		}
		return null;
	})();
	const transferSelectors = (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-3 text-[11px] leading-4 text-market-close-subtle">
				<span className="whitespace-nowrap">
					<Trans>You send</Trans>
				</span>
				<span className="whitespace-nowrap tabular-nums">
					<Trans>Minimum</Trans> {minimumDeposit}
				</span>
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
				<AssetSelect presentation="funding" />
				<span className="text-[13px] text-market-close-stroke-control" aria-hidden="true">
					·
				</span>
				<NetworkSelect
					label={usesFundingAddressFlow ? t`Funding chain` : t`Network`}
					value="arbitrum"
					onChange={() => {}}
					disabled
					displayName={networkName}
					presentation="funding"
				/>
			</div>
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
				case "paymaster-unavailable":
					return <Trans>Gas sponsorship is unavailable for this Arbitrum network.</Trans>;
				default:
					return <Trans>Unable to prepare the gas-sponsored wallet for this network.</Trans>;
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
				return { message: <Trans>Checking the current Hyperliquid deposit route...</Trans>, state: "loading" } as const;
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
					message: <Trans>Unable to verify the current Hyperliquid deposit route. Deposits are paused.</Trans>,
					action: retryRoutingAction,
					state: "unavailable",
				} as const;
			}
			if (fundingAddressPending) {
				return { message: <Trans>Creating your wallet. Please wait...</Trans>, state: "loading" } as const;
			}
			if (fundingAddressError) {
				return {
					message: fundingAddressError,
					action: retryFundingAddressAction,
					state: "unavailable",
				} as const;
			}
			if (sponsoredCctpReadiness.status === "idle" || sponsoredCctpReadiness.status === "loading") {
				return { state: "loading" } as const;
			}
			if (sponsoredCctpReadiness.status === "error") {
				return {
					message: sponsoredReadinessError,
					action: retrySponsoredReadinessAction,
					state: "unavailable",
				} as const;
			}
			if (fundingAddressReady && fundingAddress) return { address: fundingAddress, state: "ready" } as const;
			return {
				message: (
					<Trans>Your email wallet is unavailable. Sign out and log in again with the same email, then retry.</Trans>
				),
				state: "unavailable",
			} as const;
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
				className="flex flex-1 flex-col gap-3.5 font-market-close text-market-close-fg min-[1001px]:min-h-[37.5rem]"
				data-deposit-layout="funding-address"
				data-deposit-readiness={sponsoredCctpReadiness.status}
			>
				<div className="pt-0.5 text-center">
					<h3 className="text-[15px] leading-5 font-bold">
						<Trans>Deposit USDC from Arbitrum</Trans>
					</h3>
				</div>

				{transferSelectors}

				<FundingAddressCard {...fundingAddressState} />

				{showFundingDestinationDetails ? (
					<div className="contents" data-deposit-slot="funding-details">
						{fundingAddressReady && embeddedDepositStatus ? (
							<div
								role={embeddedDepositStatus.tone === "error" ? "alert" : "status"}
								className={
									embeddedDepositStatus.tone === "error"
										? "rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-danger"
										: embeddedDepositStatus.tone === "success"
											? "rounded-[10px] border border-stroke-success-weak bg-success-soft px-3 py-2.5 text-center text-xs leading-relaxed text-success"
											: "rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-muted"
								}
							>
								{embeddedDepositStatus.text}
							</div>
						) : null}

						<UnitDepositInfo cctpFee={cctpFee} cctpFeeLoading={cctpFeeLoading} cctpFeeError={cctpFeeError} />
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

				{showExplicitFundingDepositAction ? (
					<Button
						variant="filled"
						intent="neutral"
						onClick={onSubmit}
						disabled={explicitFundingDepositDisabled}
						aria-busy={isPending}
						className="min-h-11 w-full rounded-[12px] bg-market-close-control text-[13px] font-bold text-market-close-on-control shadow-none hover:opacity-90 data-disabled:bg-market-close-stroke-control data-disabled:text-market-close-on-control"
					>
						<Trans>Deposit</Trans> <span className="tabular-nums">{balance} USDC</span>
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
		<div className="flex flex-1 flex-col gap-3.5 font-market-close text-market-close-fg">
			<div className="flex flex-col items-center gap-2 text-center">
				<img src={USDC_ICON_URL} alt="" aria-hidden="true" className="size-10 rounded-full" />
				<div className="space-y-0.5">
					<h3 className="text-[15px] leading-[21px] font-bold text-market-close-fg">
						<Trans>Deposit USDC from Arbitrum</Trans>
					</h3>
					<p className="min-h-[18px] text-[11px] leading-[18px] text-market-close-subtle">
						{cctpRoutingReady ? (
							cctpFeeError ? (
								<Trans>Unable to verify the current Circle fee. Deposits are temporarily unavailable.</Trans>
							) : cctpFee ? (
								<Trans>Up to {cctpFee} USDC in fees will be deducted from your deposit.</Trans>
							) : (
								<Trans>The fee will be confirmed using Circle's latest quote before submission.</Trans>
							)
						) : null}
					</p>
				</div>
			</div>

			{transferSelectors}

			{routingNotice}
			{formValidationNotice}
			{pendingCctpRecovery ? (
				<div className="rounded-[10px] border border-stroke-weak bg-fill-weak px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-muted">
					<Trans>A previous CCTP deposit is still being tracked. Do not resubmit the same transfer.</Trans>
				</div>
			) : null}

			<AmountInput
				amount={amount}
				onAmountChange={onAmountChange}
				balance={balance}
				maxAmount={maxAmount}
				balanceStatus={balanceStatus}
				balanceError={balanceError}
				validation={validation}
				amountError={amountError}
				isPending={isPending}
				onSubmit={onSubmit}
			/>
		</div>
	);
}
