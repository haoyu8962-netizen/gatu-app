import { Trans, useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button, TextInput } from "@sairn/ui";
import { useId } from "react";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { USDC_TRANSFER_DECIMALS } from "@/config/app";
import { USDC_DECIMALS } from "@/config/contracts";
import type { UsdcRoutingQueryStatus } from "@/domain/trade/usdc-routing";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import { floorToString, limitDecimalInput } from "@/lib/trade/numbers";
import { getMinimumWithdrawal, getWithdrawalNetReceived, type WithdrawalRoute } from "@/lib/trade/withdrawal";
import { FundsRouteDetails } from "./funds-route-details";

interface Props {
	amount: string;
	onAmountChange: (value: string) => void;
	destination: string;
	onDestinationChange: (value: string) => void;
	destinationRequired: boolean;
	destinationError: string | null;
	available: string;
	maxAmount: string;
	route: WithdrawalRoute;
	routingStatus: UsdcRoutingQueryStatus;
	routingPreflightFailed?: boolean;
	routeChanged: boolean;
	routeFee: string | null;
	activationFee: string;
	showActivationFee: boolean;
	prerequisitesPending: boolean;
	prerequisiteError: string | null;
	canRetryPrerequisites: boolean;
	onRetryPrerequisites: () => void;
	validation: { valid: boolean; error: string | null };
	canSubmit: boolean;
	isPending: boolean;
	onSubmit: () => void;
	spotAvailable?: number;
	showSpotFundsNotice?: boolean;
	onTransferClick?: () => void;
}

export function WithdrawForm({
	amount,
	onAmountChange,
	destination,
	onDestinationChange,
	destinationRequired,
	destinationError,
	maxAmount,
	route,
	routingStatus,
	routingPreflightFailed = false,
	routeChanged,
	routeFee,
	activationFee,
	showActivationFee,
	prerequisitesPending,
	prerequisiteError,
	canRetryPrerequisites,
	onRetryPrerequisites,
	validation,
	canSubmit,
	isPending,
	onSubmit,
	spotAvailable = 0,
	showSpotFundsNotice = false,
	onTransferClick,
}: Props) {
	const { formatNumber } = useNumberFormat();
	const { t: translate } = useLingui();
	const amountInputId = useId();
	const amountErrorId = useId();
	const destinationErrorId = useId();
	const destinationInputId = useId();
	const maximumAmount = floorToString(maxAmount, USDC_TRANSFER_DECIMALS);
	const netReceived = validation.valid ? getWithdrawalNetReceived(amount, routeFee) : null;
	const minimumAmount = getMinimumWithdrawal(route, routeFee);
	const showsReviewedRoute = routingStatus === "ready" || routingPreflightFailed || routeChanged;
	const networkLabel = !showsReviewedRoute
		? "--"
		: route === "arbitrum-cctp"
			? translate`Arbitrum (CCTP)`
			: translate`Arbitrum (Legacy)`;
	const canRetryRouting = routingStatus === "error" || routingStatus === "unknown";
	const routingNotice = (() => {
		if (routingPreflightFailed) {
			return (
				<div
					role="alert"
					className="rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-xs leading-[17px] text-market-close-danger"
				>
					<p>
						<Trans>Unable to verify the current Hyperliquid withdrawal route.</Trans>
					</p>
					<Button
						variant="link"
						intent="neutral"
						size="xxs"
						className="mt-1 h-auto p-0 text-market-close-fg active:not-data-disabled:scale-100"
						onClick={onRetryPrerequisites}
						disabled={isPending}
					>
						<Trans>Retry</Trans>
					</Button>
				</div>
			);
		}
		if (routeChanged) {
			return (
				<div
					role="alert"
					className="rounded-[10px] border border-market-close-warning/30 bg-warning-soft px-3 py-2.5 text-xs leading-[17px] text-market-close-warning"
				>
					<Trans>The Hyperliquid withdrawal route changed. Review the updated route and fee, then submit again.</Trans>
				</div>
			);
		}
		return null;
	})();

	return (
		<div
			className="flex flex-1 flex-col gap-3.5 font-market-close"
			aria-busy={routingStatus === "loading" || prerequisitesPending || isPending}
		>
			<h3 className="text-base leading-6 font-semibold text-market-close-fg">
				<Trans>Withdraw USDC to Arbitrum</Trans>
			</h3>
			<FundsRouteDetails network={networkLabel} />

			{routingNotice}
			{!routingPreflightFailed && !prerequisiteError && (canRetryRouting || canRetryPrerequisites) ? (
				<Button
					variant="link"
					intent="neutral"
					size="xxs"
					className="h-auto self-start p-0 text-market-close-fg active:not-data-disabled:scale-100"
					onClick={onRetryPrerequisites}
					disabled={isPending || prerequisitesPending}
				>
					<Trans>Retry</Trans>
				</Button>
			) : null}

			<div>
				<div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-market-close-muted">
					<label htmlFor={amountInputId}>
						<Trans>Amount</Trans>
					</label>
					<span className="tabular-nums">
						<Trans>Minimum</Trans>{" "}
						{showsReviewedRoute && minimumAmount !== null
							? formatNumber(minimumAmount, {
									minimumFractionDigits: USDC_TRANSFER_DECIMALS,
									maximumFractionDigits: USDC_DECIMALS,
								})
							: "--"}{" "}
						USDC
					</span>
				</div>
				<div
					className={cn(
						"min-h-11 rounded-8 border border-market-close-stroke-input bg-modal",
						validation.error && "border-market-close-danger",
					)}
				>
					<div className="min-w-0 [&_button]:right-3 [&_button]:min-h-11 [&_button]:text-market-close-success [&_button]:active:scale-100">
						<NumberInput
							id={amountInputId}
							aria-describedby={validation.error ? amountErrorId : undefined}
							aria-invalid={validation.error ? true : undefined}
							placeholder="0.00"
							value={amount}
							onChange={(e) => onAmountChange(limitDecimalInput(e.target.value, USDC_TRANSFER_DECIMALS))}
							disabled={isPending}
							mobileSafe
							maxLabel={
								<span className="font-semibold tabular-nums">
									<Trans>Max</Trans>: {formatNumber(maximumAmount, USDC_TRANSFER_DECIMALS)}
								</span>
							}
							onMaxClick={() => onAmountChange(maximumAmount)}
							className="h-11 rounded-none border-0 bg-transparent px-3 pr-[7.75rem] text-right text-base leading-5 font-semibold text-market-close-fg tabular-nums shadow-none focus-visible:border-transparent focus-visible:ring-0 min-[1001px]:text-2sm min-[1001px]:leading-[18px]"
						/>
					</div>
				</div>
				<p
					id={amountErrorId}
					role={validation.error ? "alert" : undefined}
					className={cn(
						"flex h-4 items-center gap-1 text-xs",
						validation.error ? "text-market-close-danger" : "invisible",
					)}
				>
					<WarningCircleIcon className="size-3 shrink-0" />
					{validation.error || " "}
				</p>
			</div>

			<div>
				<label htmlFor={destinationInputId} className="mb-1.5 block text-xs text-market-close-muted">
					<Trans>Destination address</Trans>
				</label>
				<TextInput
					id={destinationInputId}
					readOnly={!destinationRequired}
					aria-label={translate`Destination address`}
					aria-describedby={destinationError ? destinationErrorId : undefined}
					aria-invalid={destinationError ? true : undefined}
					placeholder="0x…"
					value={destination}
					onChange={(e) => onDestinationChange(e.target.value)}
					dir="ltr"
					autoCapitalize="none"
					autoComplete="off"
					spellCheck={false}
					disabled={isPending}
					className={cn(
						"min-h-11 !rounded-[10px] !border-market-close-stroke-input !bg-modal px-3 py-0 font-mono tabular-nums focus-within:!outline-market-close-focus",
						destinationError && "!border-market-close-danger focus-within:!outline-market-close-danger",
					)}
					inputClassName="text-base leading-5 font-semibold text-market-close-fg placeholder:text-market-close-muted min-[1001px]:text-2sm min-[1001px]:leading-[18px]"
				/>
				<p
					id={destinationErrorId}
					role={destinationError ? "alert" : undefined}
					className={cn(
						"flex h-4 items-center gap-1 text-xs",
						destinationError ? "text-market-close-danger" : "invisible",
					)}
				>
					<WarningCircleIcon className="size-3 shrink-0" />
					{destinationError || " "}
				</p>
			</div>

			{showSpotFundsNotice && (
				<div className="rounded-[10px] border border-market-close-warning/30 bg-warning-soft px-3 py-2.5 text-xs leading-[17px] text-market-close-warning">
					<div className="tabular-nums">
						<Trans>Funds are in Spot account</Trans>: {formatNumber(spotAvailable, 2)} USDC
					</div>
					{onTransferClick ? (
						<Button
							variant="link"
							intent="neutral"
							size="xxs"
							className="mt-1 h-auto p-0 text-market-close-fg active:not-data-disabled:scale-100"
							onClick={onTransferClick}
							disabled={isPending}
						>
							<Trans>Perps / Spot</Trans>
						</Button>
					) : null}
				</div>
			)}

			{prerequisiteError ? (
				<div
					role="alert"
					className="rounded-[10px] border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-xs leading-[17px] text-market-close-danger"
				>
					<p>{prerequisiteError}</p>
					{canRetryPrerequisites ? (
						<Button
							variant="link"
							intent="neutral"
							size="xxs"
							className="mt-1 h-auto p-0 text-market-close-fg active:not-data-disabled:scale-100"
							onClick={onRetryPrerequisites}
							disabled={isPending}
						>
							<Trans>Retry</Trans>
						</Button>
					) : null}
				</div>
			) : null}

			<div className="space-y-2 py-3 text-xs">
				<InfoRow
					className="p-0"
					labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
					label={<Trans>Withdrawal fee</Trans>}
					value={!showsReviewedRoute || routeFee === null ? "--" : `$${formatNumber(routeFee, 2)}`}
					valueClassName="whitespace-nowrap font-semibold text-market-close-fg"
				/>
				{showsReviewedRoute && showActivationFee ? (
					<InfoRow
						className="p-0"
						labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
						label={<Trans>One-time account activation fee</Trans>}
						value={`$${formatNumber(activationFee, 2)}`}
						valueClassName="whitespace-nowrap font-semibold text-market-close-fg"
					/>
				) : null}
				<InfoRow
					className="p-0"
					labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
					label={<Trans>Net received</Trans>}
					value={!showsReviewedRoute || netReceived === null ? "--" : `$${formatNumber(netReceived, 2)}`}
					valueClassName="whitespace-nowrap font-semibold text-market-close-fg"
				/>
				<InfoRow
					className="p-0"
					labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
					label={<Trans>Estimated time</Trans>}
					value={<Trans>Depends on network confirmation</Trans>}
					valueClassName="min-w-0 text-end font-semibold text-market-close-fg"
				/>
			</div>

			<Button
				variant="filled"
				intent="neutral"
				onClick={onSubmit}
				disabled={!canSubmit || isPending || prerequisitesPending}
				className="mt-auto min-h-11 w-full !rounded-[10px] !bg-market-close-control text-[13px] font-bold !text-market-close-on-control !shadow-none active:not-data-disabled:!scale-100 data-disabled:!bg-market-close-stroke-control data-disabled:!text-market-close-on-control"
			>
				{destinationRequired ? <Trans>Withdraw to Arbitrum</Trans> : <Trans>Withdraw</Trans>}
			</Button>
		</div>
	);
}
