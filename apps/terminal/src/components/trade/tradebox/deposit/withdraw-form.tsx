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
import { NETWORKS } from "@/config/networks";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { floorToString, limitDecimalInput, toNumberOrZero } from "@/lib/trade/numbers";
import { getWithdrawalNetReceived, isWithdrawalRoute, type WithdrawalRoute } from "@/lib/trade/withdrawal";

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
	onRouteChange: (route: WithdrawalRoute) => void;
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
	onRouteChange,
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
		{ value: "arbitrum-cctp", label: translate`Arbitrum (CCTP)` },
		{ value: "arbitrum-legacy", label: translate`Arbitrum (Legacy)` },
	];

	return (
		<div className="flex flex-1 flex-col gap-2">
			<Select
				label={translate`Withdrawal route`}
				value={route}
				onValueChange={(value) => {
					if (isWithdrawalRoute(value)) onRouteChange(value);
				}}
				options={routeOptions}
				disabled={isPending}
			/>

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

			<div className="rounded-8 border border-stroke-weak/40 bg-surface p-3 space-y-2 text-xs">
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
