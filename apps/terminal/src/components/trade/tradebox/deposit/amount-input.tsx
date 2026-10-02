import { Trans, useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { useId } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";

interface Props {
	amount: string;
	onAmountChange: (value: string) => void;
	maxAmount: string;
	balance: string;
	balanceStatus: "idle" | "loading" | "success" | "error";
	validation: { valid: boolean; error: string | null };
	amountError?: string | null;
	isPending: boolean;
	onSubmit: () => void;
}

export function AmountInput({
	amount,
	onAmountChange,
	maxAmount,
	balance,
	balanceStatus,
	validation,
	amountError = null,
	isPending,
	onSubmit,
}: Props) {
	const { t } = useLingui();
	const { formatDecimalString } = useNumberFormat();
	const helperId = useId();
	const isBalanceLoading = balanceStatus === "loading";
	const isBalanceReady = balanceStatus === "success";
	const isSubmitDisabled = !validation.valid || isPending || !isBalanceReady;
	const helperText = balanceStatus === "success" ? amountError : null;
	const hasHelper = Boolean(helperText);
	const hasAmountError = Boolean(helperText);

	return (
		<div className="flex flex-col gap-2 font-market-close" aria-busy={isBalanceLoading || isPending}>
			<div>
				<NumberInput
					label={t`Deposit amount`}
					labelValue={
						<>
							<Trans>Available</Trans>:{" "}
							<span className="tabular-nums">
								{balanceStatus === "success" ? formatDecimalString(balance) : "--"} USDC
							</span>
						</>
					}
					onLabelValueClick={() => onAmountChange(maxAmount)}
					maxLabel={<Trans>Max</Trans>}
					onMaxClick={() => onAmountChange(maxAmount)}
					placeholder="0.00"
					value={amount}
					onChange={(e) => onAmountChange(e.target.value)}
					aria-describedby={hasAmountError ? helperId : undefined}
					aria-invalid={hasAmountError ? true : undefined}
					disabled={isPending || !isBalanceReady}
					maxAllowedDecimals={6}
					mobileSafe
					className={cn(
						"h-11 w-full rounded-[10px] border-market-close-stroke-input bg-modal px-3 text-[13px] font-semibold tabular-nums text-market-close-fg placeholder:text-market-close-subtle focus-visible:border-market-close-focus focus-visible:ring-market-close-focus/20",
						helperText && "border-market-close-danger focus-visible:border-market-close-danger",
					)}
				/>
				{hasHelper ? (
					<p id={helperId} role="alert" className="flex h-4 items-center gap-1 text-xs text-market-close-danger">
						<WarningCircleIcon className="size-3" />
						{helperText}
					</p>
				) : (
					<div aria-hidden="true" className="h-4" />
				)}
			</div>

			<Button
				variant="filled"
				intent="neutral"
				onClick={onSubmit}
				disabled={isSubmitDisabled}
				className="mt-auto min-h-11 w-full rounded-[12px] bg-market-close-control text-[13px] font-bold text-market-close-on-control shadow-none hover:opacity-90 data-disabled:bg-market-close-stroke-control data-disabled:text-market-close-on-control"
			>
				<Trans>Deposit</Trans>
			</Button>
		</div>
	);
}
