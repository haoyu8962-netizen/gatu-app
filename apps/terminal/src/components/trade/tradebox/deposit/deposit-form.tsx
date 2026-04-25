import { Button } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowLineDownIcon, ClockIcon, SpinnerGapIcon, WalletIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { formatUnits } from "viem";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import { NETWORKS } from "@/config/networks";
import { cn } from "@/lib/cn";
import { NetworkSelect } from "./shared-ui";

const ARBITRUM_NETWORK = NETWORKS[0];

interface Props {
	amount: string;
	onAmountChange: (value: string) => void;
	balance: string;
	validation: { valid: boolean; error: string | null };
	isPending: boolean;
	onSubmit: () => void;
}

export function DepositForm({ amount, onAmountChange, balance, validation, isPending, onSubmit }: Props) {
	return (
		<div className="flex flex-1 flex-col gap-2">
			<NetworkSelect label={<Trans>From</Trans>} value="arbitrum" onChange={() => {}} disabled />

			<div>
				<NumberInput
					label={t`Amount`}
					labelValue={
						<>
							Available:{" "}
							<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">
								{balance} USDC
							</span>
						</>
					}
					onLabelValueClick={() => onAmountChange(balance)}
					placeholder="0.00"
					value={amount}
					onChange={(e) => onAmountChange(e.target.value)}
					className={cn(
						"w-full tabular-nums",
						validation.error && "border-stroke-error-strong focus:border-stroke-error-strong",
					)}
				/>
				<p className={cn("h-4 text-xs flex items-center gap-1", validation.error ? "text-error" : "invisible")}>
					<WarningCircleIcon className="size-3" />
					{validation.error || " "}
				</p>
			</div>

			<div className="rounded-8 border border-stroke-weak/40 bg-surface p-3 space-y-2 text-xs">
				<InfoRow
					className="p-0"
					labelClassName="flex items-center gap-1.5 text-fg"
					label={
						<>
							<WalletIcon className="size-3" />
							<Trans>Minimum</Trans>
						</>
					}
					value={`${formatUnits(MIN_DEPOSIT_USDC, USDC_DECIMALS)} USDC`}
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
					value={ARBITRUM_NETWORK.estimatedDepositTime}
					valueClassName="font-medium"
				/>
			</div>

			<Button
				variant="filled"
				intent="neutral"
				onClick={onSubmit}
				disabled={!validation.valid || isPending}
				className="mt-auto w-full"
			>
				{isPending ? (
					<>
						<SpinnerGapIcon className="size-4 animate-spin" />
						<Trans>Processing...</Trans>
					</>
				) : (
					<>
						<ArrowLineDownIcon className="size-4" />
						<Trans>Deposit</Trans>
					</>
				)}
			</Button>
		</div>
	);
}
