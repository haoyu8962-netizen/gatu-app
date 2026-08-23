import { Button, Select, TextInput } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { USDC_TRANSFER_DECIMALS } from "@/config/app";
import { USDC_ICON_URL } from "@/config/bridge";
import { NETWORKS } from "@/config/networks";
import type { UsdcRoutingQueryStatus } from "@/domain/trade/usdc-routing";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
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
	useNumberFormatRevision();
	const { t: translate } = useLingui();
	const amountInputId = useId();
	const amountErrorId = useId();
	const destinationErrorId = useId();
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
				<div className="rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3 py-2.5 text-xs leading-[17px] text-market-close-muted">
					<Trans>Checking the current Hyperliquid withdrawal route...</Trans>
				</div>
			);
		}
		if (routingStatus === "error" || routingStatus === "unknown") {
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
		<div className="flex flex-1 flex-col gap-3.5 font-market-close">
			<div className="flex flex-col items-center gap-2 text-center">
				<div className="grid size-10 place-items-center rounded-full bg-market-close-control" aria-hidden="true">
					<img src={USDC_ICON_URL} alt="" className="size-8 rounded-full" />
				</div>
				<div className="space-y-0.5">
					<h3 className="text-[15px] leading-[21px] font-bold text-market-close-fg">
						<Trans>Withdraw USDC</Trans>
					</h3>
					<p className="text-[11px] leading-[18px] text-market-close-subtle">
						<Trans>Send funds from Hyperliquid to an Arbitrum address.</Trans>
					</p>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<div className="[&>div]:!grid [&>div]:min-h-11 [&>div]:grid-cols-[auto_minmax(0,1fr)] [&>div]:items-center [&>div]:gap-3 [&>div]:rounded-[10px] [&>div]:border [&>div]:border-market-close-stroke-input [&>div]:bg-modal [&>div]:px-3 [&>div>label]:text-[13px] [&>div>label]:font-normal [&>div>label]:!text-market-close-muted [&_[role=combobox]]:min-h-0 [&_[role=combobox]]:justify-end [&_[role=combobox]]:border-0 [&_[role=combobox]]:bg-transparent [&_[role=combobox]]:p-0 [&_[role=combobox]]:shadow-none [&_[role=combobox]]:focus-visible:outline-none [&_[role=combobox]>span]:text-right [&_[role=combobox]>span]:text-[13px] [&_[role=combobox]>span]:font-semibold [&_[role=combobox]>span]:text-market-close-fg">
					<AssetSelect />
				</div>
				<Select
					label={translate`Withdrawal route`}
					value={route}
					options={routeOptions}
					disabled
					className="!grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[10px] border border-market-close-stroke-input bg-modal px-3 [&>label]:text-[13px] [&>label]:font-normal [&>label]:!text-market-close-muted"
					triggerClassName="min-h-0 justify-end !rounded-none !border-0 !bg-transparent !p-0 !shadow-none focus-visible:!outline-none data-disabled:!text-market-close-fg [&>span]:text-right [&>span]:!text-[13px] [&>span]:font-semibold [&>span]:!text-market-close-fg"
				/>
			</div>

			{routingNotice}

			<div>
				<div
					className={cn(
						"grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[10px] border border-market-close-stroke-input bg-modal pl-3",
						validation.error && "border-market-close-danger",
					)}
				>
					<label htmlFor={amountInputId} className="shrink-0 whitespace-nowrap text-[13px] text-market-close-muted">
						<Trans>Amount</Trans>
					</label>
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
									<Trans>Max</Trans>: {formatNumber(maxAmountNum, 2)}
								</span>
							}
							onMaxClick={() => onAmountChange(floorToString(maxAmountNum, USDC_TRANSFER_DECIMALS))}
							className="h-11 rounded-none border-0 bg-transparent px-2 pr-[7.75rem] text-right text-base leading-5 font-semibold text-market-close-fg tabular-nums shadow-none focus-visible:border-transparent focus-visible:ring-0 min-[1001px]:text-[13px] min-[1001px]:leading-[18px]"
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

			{destinationRequired && (
				<div>
					<TextInput
						aria-label={t`Destination address`}
						aria-describedby={destinationError ? destinationErrorId : undefined}
						aria-invalid={destinationError ? true : undefined}
						placeholder={t`Destination address`}
						value={destination}
						onChange={(e) => onDestinationChange(e.target.value)}
						autoComplete="off"
						spellCheck={false}
						disabled={isPending}
						className={cn(
							"min-h-11 !rounded-[10px] !border-market-close-stroke-input !bg-modal px-3 py-0 font-mono tabular-nums focus-within:!outline-market-close-focus",
							destinationError && "!border-market-close-danger focus-within:!outline-market-close-danger",
						)}
						inputClassName="text-base leading-5 font-semibold text-market-close-fg placeholder:text-market-close-muted min-[1001px]:text-[13px] min-[1001px]:leading-[18px]"
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
					<p className="text-[11px] leading-[17px] text-market-close-subtle">
						<Trans>USDC will be sent to this Arbitrum address.</Trans>
					</p>
				</div>
			)}

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

			<div className="space-y-2 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3.5 py-3 text-xs">
				<InfoRow
					className="p-0"
					labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
					label={<Trans>Withdrawal fee</Trans>}
					value={routeFee === null ? "--" : `$${formatNumber(toNumberOrZero(routeFee), 2)}`}
					valueClassName="whitespace-nowrap font-semibold text-market-close-fg"
				/>
				{showActivationFee ? (
					<InfoRow
						className="p-0"
						labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
						label={<Trans>One-time account activation fee</Trans>}
						value={`$${formatNumber(toNumberOrZero(activationFee), 2)}`}
						valueClassName="whitespace-nowrap font-semibold text-market-close-fg"
					/>
				) : null}
				<InfoRow
					className="p-0"
					labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
					label={<Trans>Net received</Trans>}
					value={netReceived === null ? "--" : `$${formatNumber(toNumberOrZero(netReceived), 2)}`}
					valueClassName="whitespace-nowrap font-semibold text-market-close-fg"
				/>
				<InfoRow
					className="p-0"
					labelClassName="min-w-0 pr-3 leading-[17px] text-market-close-muted"
					label={<Trans>Estimated time</Trans>}
					value={ARBITRUM_NETWORK.estimatedWithdrawTime}
					valueClassName="whitespace-nowrap font-semibold text-market-close-fg"
				/>
			</div>

			<Button
				variant="filled"
				intent="neutral"
				onClick={onSubmit}
				disabled={!canSubmit || isPending || prerequisitesPending}
				className="mt-auto min-h-11 w-full !rounded-[10px] !bg-market-close-control text-[13px] font-bold !text-market-close-on-control !shadow-none active:not-data-disabled:!scale-100 data-disabled:!bg-market-close-stroke-control data-disabled:!text-market-close-on-control"
			>
				{isPending || prerequisitesPending ? (
					<>
						<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" />
						<Trans>Processing...</Trans>
					</>
				) : destinationRequired ? (
					<Trans>Withdraw to Arbitrum</Trans>
				) : (
					<Trans>Withdraw</Trans>
				)}
			</Button>
		</div>
	);
}
