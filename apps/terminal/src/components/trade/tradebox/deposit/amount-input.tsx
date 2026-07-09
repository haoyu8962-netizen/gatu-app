import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowLineDownIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/cn";

interface Props {
	amount: string;
	onAmountChange: (value: string) => void;
	maxAmount: string;
	balance: string;
	balanceStatus: "idle" | "loading" | "success" | "error";
	balanceError: Error | null;
	validation: { valid: boolean; error: string | null };
	isPending: boolean;
	onSubmit: () => void;
}

export function AmountInput({
	amount,
	onAmountChange,
	maxAmount,
	balance,
	balanceStatus,
	balanceError,
	validation,
	isPending,
	onSubmit,
}: Props) {
	const isBalanceLoading = balanceStatus === "loading";
	const hasBalanceError = balanceStatus === "error";
	const isSubmitDisabled = !validation.valid || isPending || isBalanceLoading || hasBalanceError;
	const helperText = hasBalanceError
		? balanceError?.message || t`Unable to load Arbitrum USDC balance`
		: validation.error;

	return (
		<div className="flex flex-col gap-2">
			<div>
				<NumberInput
					label={t`Deposit amount`}
					labelValue={
						isBalanceLoading ? (
							<Trans>Loading...</Trans>
						) : (
							<>
								<Trans>Available</Trans>:{" "}
								<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">
									{balance} USDC
								</span>
							</>
						)
					}
					onLabelValueClick={() => onAmountChange(maxAmount)}
					maxLabel={<Trans>Max</Trans>}
					onMaxClick={() => onAmountChange(maxAmount)}
					placeholder="0.00"
					value={amount}
					onChange={(e) => onAmountChange(e.target.value)}
					disabled={isPending || isBalanceLoading || hasBalanceError}
					maxAllowedDecimals={6}
					className={cn(
						"w-full tabular-nums",
						helperText && "border-stroke-error-strong focus:border-stroke-error-strong",
					)}
				/>
				<p className={cn("h-4 text-xs flex items-center gap-1", helperText ? "text-error" : "invisible")}>
					<WarningCircleIcon className="size-3" />
					{helperText || " "}
				</p>
			</div>

			<Button
				variant="filled"
				intent="neutral"
				onClick={onSubmit}
				disabled={isSubmitDisabled}
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
