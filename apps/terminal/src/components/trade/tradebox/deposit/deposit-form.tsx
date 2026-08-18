import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { formatUnits } from "viem";
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
	isPending: boolean;
	onSubmit: () => void;
	routingStatus: UsdcRoutingQueryStatus;
	depositRoute: UsdcTransferRoute | null;
	onRetryRouting: () => void;
	networkName: string;
	sponsoredCctpEnabled: boolean;
	sponsoredCctpReadiness: SponsoredCctpReadiness;
	depositUnavailableReason?: string | null;
	requiresExplicitFundingDeposit: boolean;
	cctpFee: string | null;
	cctpNetAmount: string | null;
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
	isPending,
	onSubmit,
	routingStatus,
	depositRoute,
	onRetryRouting,
	networkName,
	sponsoredCctpEnabled,
	sponsoredCctpReadiness,
	depositUnavailableReason = null,
	requiresExplicitFundingDeposit,
	cctpFee,
	cctpNetAmount,
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
	const minimumDeposit = `${formatUnits(MIN_DEPOSIT_USDC, USDC_DECIMALS)} USDC`;
	const bridgeRoutingReady = routingStatus === "ready" && depositRoute === "bridge";
	const cctpRoutingReady = routingStatus === "ready" && depositRoute === "cctp";
	const depositRoutingReady = cctpRoutingReady && !fundingAddress;
	const explicitFundingDepositReady =
		requiresExplicitFundingDeposit &&
		cctpRoutingReady &&
		sponsoredCctpEnabled &&
		sponsoredCctpReadiness.status === "ready" &&
		!!fundingAddress;
	const showExplicitFundingDepositAction =
		explicitFundingDepositReady && maxDepositRaw !== undefined && maxDepositRaw > 0n;
	const explicitFundingDepositDisabled =
		!validation.valid ||
		isPending ||
		balanceStatus === "loading" ||
		balanceStatus === "error" ||
		cctpFeeLoading ||
		pendingCctpRecovery;
	const routingNotice = (() => {
		if (routingStatus === "loading" || (cctpRoutingReady && !fundingAddress)) {
			return null;
		}
		return (
			<div
				role="alert"
				className="rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-danger"
			>
				<p>
					{bridgeRoutingReady ? (
						<Trans>Legacy Bridge2 deposits are no longer accepted. Deposits are paused.</Trans>
					) : (
						<Trans>Unable to verify the current Hyperliquid deposit route. Deposits are paused.</Trans>
					)}
				</p>
				{!bridgeRoutingReady ? (
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
			routingStatus === "error" || routingStatus === "unknown" ? (
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
				return null;
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

		return (
			<div className="flex flex-1 flex-col gap-3.5 font-market-close text-market-close-fg">
				<div className="pt-0.5 text-center">
					<h3 className="text-[15px] leading-5 font-bold">
						<Trans>Deposit USDC from Arbitrum</Trans>
					</h3>
				</div>

				{transferSelectors}

				{fundingAddressState ? <FundingAddressCard {...fundingAddressState} /> : null}

				{fundingAddressReady ? (
					<>
						{embeddedDepositStatus ? (
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

						<UnitDepositInfo
							presentation="funding"
							cctpFee={cctpFee}
							cctpNetAmount={cctpNetAmount}
							cctpFeeLoading={cctpFeeLoading}
							cctpFeeError={cctpFeeError}
						/>
					</>
				) : null}

				{fundingAddressReady ? (
					<div className="rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-danger">
						<Trans>
							Important: this address can only receive native USDC on Arbitrum. Do not send USDC.e or assets from other
							networks. Minimum deposit is {minimumDeposit}.
						</Trans>
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
					className="min-h-11 w-full rounded-[12px] bg-market-close-control text-[13px] font-bold text-market-close-on-control shadow-none hover:opacity-90"
				>
					<Trans>Done</Trans>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col gap-3.5 font-market-close text-market-close-fg">
			<div className="pt-0.5 text-center">
				<h3 className="text-[15px] leading-5 font-bold">
					<Trans>Deposit USDC from Arbitrum</Trans>
				</h3>
			</div>

			{transferSelectors}

			{routingNotice}
			{pendingCctpRecovery ? (
				<div className="rounded-[10px] border border-stroke-brand-strong/40 bg-brand-soft px-3 py-2.5 text-center text-xs leading-relaxed text-market-close-muted">
					<Trans>A previous CCTP deposit is still being tracked. Do not resubmit the same transfer.</Trans>
				</div>
			) : null}

			{depositRoutingReady ? (
				<UnitDepositInfo cctpFee={cctpFee} cctpNetAmount={cctpNetAmount} cctpFeeLoading={cctpFeeLoading} />
			) : null}

			<AmountInput
				amount={amount}
				onAmountChange={onAmountChange}
				balance={balance}
				maxAmount={maxAmount}
				balanceStatus={balanceStatus}
				balanceError={balanceError}
				validation={validation}
				isPending={isPending}
				onSubmit={onSubmit}
			/>
		</div>
	);
}
