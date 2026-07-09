import { Button, TextInput } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
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
import { WITHDRAWAL_FEE_USD } from "@/config/contracts";
import { NETWORKS } from "@/config/networks";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { floorToString, limitDecimalInput, toNumber, toNumberOrZero } from "@/lib/trade/numbers";
import { NetworkSelect } from "./shared-ui";

const ARBITRUM_NETWORK = NETWORKS[0];

interface Props {
	amount: string;
	onAmountChange: (value: string) => void;
	destination: string;
	onDestinationChange: (value: string) => void;
	destinationRequired: boolean;
	destinationError: string | null;
	available: string;
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
	validation,
	canSubmit,
	isPending,
	onSubmit,
	spotAvailable = 0,
	showSpotFundsNotice = false,
	onTransferClick,
}: Props) {
	const availableNum = toNumberOrZero(available);
	const amountNum = toNumber(amount);
	const netReceived = amountNum !== null && amountNum > 0 ? Math.max(amountNum - WITHDRAWAL_FEE_USD, 0) : null;

	return (
		<div className="flex flex-1 flex-col gap-2">
			<NetworkSelect label={<Trans>To</Trans>} value="arbitrum" onChange={() => {}} disabled />

			<div>
				<NumberInput
					label={t`Amount`}
					labelValue={
						<>
							Available:{" "}
							<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">
								{formatNumber(availableNum, 2)} USDC
							</span>
						</>
					}
					onLabelValueClick={() => !isPending && onAmountChange(floorToString(availableNum, USDC_TRANSFER_DECIMALS))}
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

			<div className="rounded-8 border border-stroke-weak/40 bg-surface p-3 space-y-2 text-xs">
				<InfoRow
					className="p-0"
					labelClassName="flex items-center gap-1.5 text-fg"
					label={
						<>
							<WalletIcon className="size-3" />
							<Trans>Network fee</Trans>
						</>
					}
					value={`$${WITHDRAWAL_FEE_USD}`}
				/>
				<InfoRow
					className="p-0"
					labelClassName="flex items-center gap-1.5 text-fg"
					label={
						<>
							<ArrowLineDownIcon className="size-3" />
							<Trans>Net received</Trans>
						</>
					}
					value={netReceived === null ? "--" : `$${formatNumber(netReceived, 2)}`}
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
				disabled={!canSubmit || isPending}
				className="mt-auto w-full"
			>
				{isPending ? (
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
