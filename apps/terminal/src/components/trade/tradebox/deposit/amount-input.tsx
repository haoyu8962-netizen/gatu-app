import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
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
		<div className="flex flex-col gap-2 font-market-close">
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
					mobileSafe
					className={cn(
						"h-11 w-full rounded-[10px] border-market-close-stroke-input bg-modal px-3 text-[13px] font-semibold tabular-nums text-market-close-fg placeholder:text-market-close-subtle focus-visible:border-market-close-focus focus-visible:ring-market-close-focus/20",
						helperText && "border-market-close-danger focus-visible:border-market-close-danger",
					)}
				/>
				<p className={cn("flex h-4 items-center gap-1 text-xs", helperText ? "text-market-close-danger" : "invisible")}>
					<WarningCircleIcon className="size-3" />
					{helperText || " "}
				</p>
			</div>

			<Button
				variant="filled"
				intent="neutral"
				onClick={onSubmit}
				disabled={isSubmitDisabled}
				className="mt-auto min-h-11 w-full rounded-[12px] bg-market-close-control text-[13px] font-bold text-market-close-on-control shadow-none hover:opacity-90 data-disabled:bg-market-close-stroke-control data-disabled:text-market-close-on-control"
			>
				{isPending ? (
					<>
						<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" />
						<Trans>Processing...</Trans>
					</>
				) : (
					<Trans>Deposit</Trans>
				)}
			</Button>
		</div>
	);
}
