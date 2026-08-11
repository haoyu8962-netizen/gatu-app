import { Button, Select, TextInput } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowLineDownIcon,
	ArrowLineUpIcon,
	ClockIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { USDC_TRANSFER_DECIMALS } from "@/config/app";
import { USDC_ICON_URL } from "@/config/bridge";
import { NETWORKS } from "@/config/networks";
import type { UsdcRoutingQueryStatus } from "@/domain/trade/usdc-routing";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { floorToString, limitDecimalInput, toNumberOrZero } from "@/lib/trade/numbers";
import { getWithdrawalNetReceived, type WithdrawalRoute } from "@/lib/trade/withdrawal";
import { AssetSelect } from "./asset-select";

const ARBITRUM_NETWORK = NETWORKS[0];

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
	available,
	maxAmount,
	route,
	routingStatus,
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
	const { t: translate } = useLingui();
	const availableNum = toNumberOrZero(available);
	const maxAmountNum = toNumberOrZero(maxAmount);
	const netReceived = getWithdrawalNetReceived(amount, routeFee);
	const routeOptions = [
		{
			value: route,
			label: route === "arbitrum-cctp" ? translate`Arbitrum (CCTP)` : translate`Arbitrum (Legacy)`,
		},
	];
	const routingNotice = (() => {
		if (routingStatus === "loading") {
			return (
				<div className="rounded-8 border border-stroke-weak/40 bg-fill-weaker p-2.5 text-xs text-fg-muted">
					<Trans>Checking the current Hyperliquid withdrawal route...</Trans>
				</div>
			);
		}
		if (routingStatus === "error" || routingStatus === "unknown") {
			return (
				<div role="alert" className="rounded-8 border border-stroke-error-weak bg-error-soft p-2.5 text-xs text-error">
					<p>
						<Trans>Unable to verify the current Hyperliquid withdrawal route.</Trans>
					</p>
					<Button
						variant="link"
						intent="brand"
						size="xxs"
						className="mt-1 h-auto p-0"
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
					className="rounded-8 border border-stroke-warning-weak bg-warning-soft p-2.5 text-xs text-warning"
				>
					<Trans>The Hyperliquid withdrawal route changed. Review the updated route and fee, then submit again.</Trans>
				</div>
			);
		}
		return null;
	})();

	return (
		<div className="flex flex-1 flex-col gap-4">
			<div className="flex flex-col items-center gap-3 pt-1 text-center">
				<div className="flex size-12 items-center justify-center rounded-full border border-stroke-brand-strong/40 bg-brand-soft">
					<img src={USDC_ICON_URL} alt="USDC" className="size-8 rounded-full" />
				</div>
				<div className="space-y-1">
					<h3 className="text-base font-semibold text-fg">
						<Trans>Withdraw USDC</Trans>
					</h3>
					<p className="text-xs text-fg-muted">
						<Trans>Send funds from Hyperliquid to an Arbitrum address.</Trans>
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<AssetSelect />
				<Select label={translate`Withdrawal route`} value={route} options={routeOptions} disabled />
			</div>

			{routingNotice}

			<div>
				<NumberInput
					label={t`Amount`}
					labelValue={
						<>
							{t`Available`}:{" "}
							<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">
								{formatNumber(availableNum, 2)} USDC
							</span>
						</>
					}
					onLabelValueClick={() => !isPending && onAmountChange(floorToString(maxAmountNum, USDC_TRANSFER_DECIMALS))}
					placeholder="0.00"
					value={amount}
					onChange={(e) => onAmountChange(limitDecimalInput(e.target.value, USDC_TRANSFER_DECIMALS))}
					disabled={isPending}
					mobileSafe
					className={cn(
						"w-full tabular-nums",
						validation.error && "border-stroke-error-strong focus:border-stroke-error-strong",
					)}
				/>
				<p className={cn("h-4 text-xs flex items-center gap-1", validation.error ? "text-error" : "invisible")}>
					<WarningCircleIcon className="size-3" />
					{validation.error || " "}
				</p>
			</div>

			{destinationRequired && (
				<div>
					<TextInput
						placeholder={t`Destination address`}
						value={destination}
						onChange={(e) => onDestinationChange(e.target.value)}
						autoComplete="off"
						spellCheck={false}
						disabled={isPending}
						className={cn(
							"font-mono text-xs tabular-nums",
							destinationError && "border-stroke-error-strong focus-visible:border-stroke-error-strong",
						)}
						inputClassName="max-[1000px]:text-base max-[1000px]:leading-5"
					/>
					<p className={cn("h-4 text-xs flex items-center gap-1", destinationError ? "text-error" : "invisible")}>
						<WarningCircleIcon className="size-3" />
						{destinationError || " "}
					</p>
					<p className="text-2xs text-fg-muted">
						<Trans>USDC will be sent to this Arbitrum address.</Trans>
					</p>
				</div>
			)}

			{showSpotFundsNotice && (
				<div className="rounded-8 border border-stroke-warning-weak bg-warning-soft p-2.5 text-xs text-warning">
					<div className="tabular-nums">
						<Trans>Funds are in Spot account</Trans>: {formatNumber(spotAvailable, 2)} USDC
					</div>
					{onTransferClick ? (
						<Button
							variant="link"
							intent="brand"
							size="xxs"
							className="mt-1 h-auto p-0"
							onClick={onTransferClick}
							disabled={isPending}
						>
							<Trans>Perps / Spot</Trans>
						</Button>
					) : null}
				</div>
			)}

			{prerequisiteError ? (
				<div role="alert" className="rounded-8 border border-stroke-error-weak bg-error-soft p-2.5 text-xs text-error">
					<p>{prerequisiteError}</p>
					{canRetryPrerequisites ? (
						<Button
							variant="link"
							intent="brand"
							size="xxs"
							className="mt-1 h-auto p-0"
							onClick={onRetryPrerequisites}
							disabled={isPending}
						>
							<Trans>Retry</Trans>
						</Button>
					) : null}
				</div>
			) : null}

			<div className="space-y-2 rounded-8 border border-stroke-weak/40 bg-fill-weaker p-3 text-xs">
				<InfoRow
					className="p-0"
					labelClassName="flex items-center gap-1.5 text-fg"
					label={
						<>
							<WalletIcon className="size-3" />
							<Trans>Withdrawal fee</Trans>
						</>
					}
					value={routeFee === null ? "--" : `$${formatNumber(toNumberOrZero(routeFee), 2)}`}
				/>
				{showActivationFee ? (
					<InfoRow
						className="p-0"
						labelClassName="flex items-center gap-1.5 text-fg"
						label={<Trans>One-time account activation fee</Trans>}
						value={`$${formatNumber(toNumberOrZero(activationFee), 2)}`}
					/>
				) : null}
				<InfoRow
					className="p-0"
					labelClassName="flex items-center gap-1.5 text-fg"
					label={
						<>
							<ArrowLineDownIcon className="size-3" />
							<Trans>Net received</Trans>
						</>
					}
					value={netReceived === null ? "--" : `$${formatNumber(toNumberOrZero(netReceived), 2)}`}
				/>
				<InfoRow
					className="p-0"
					labelClassName="flex items-center gap-1.5 text-fg"
					label={
						<>
							<ClockIcon className="size-3" />
							<Trans>Estimated time</Trans>
						</>
					}
					value={ARBITRUM_NETWORK.estimatedWithdrawTime}
					valueClassName="font-medium"
				/>
			</div>

			<Button
				variant="filled"
				intent="neutral"
				onClick={onSubmit}
				disabled={!canSubmit || isPending || prerequisitesPending}
				className="mt-auto w-full"
			>
				{isPending || prerequisitesPending ? (
					<>
						<SpinnerGapIcon className="size-4 animate-spin" />
						<Trans>Processing...</Trans>
					</>
				) : (
					<>
						<ArrowLineUpIcon className="size-4" />
						{destinationRequired ? <Trans>Withdraw to Arbitrum</Trans> : <Trans>Withdraw</Trans>}
					</>
				)}
			</Button>
		</div>
	);
}
