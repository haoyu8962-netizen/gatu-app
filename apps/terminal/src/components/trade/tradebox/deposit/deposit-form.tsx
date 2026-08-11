import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { formatUnits } from "viem";
import { USDC_ICON_URL } from "@/config/bridge";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import type { UsdcRoutingQueryStatus, UsdcTransferRoute } from "@/domain/trade/usdc-routing";
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
	smartDepositEnabled: boolean;
	fundingAddress?: `0x${string}`;
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
	smartDepositEnabled,
	fundingAddress,
	onDone,
}: Props) {
	const minimumDeposit = `${formatUnits(MIN_DEPOSIT_USDC, USDC_DECIMALS)} USDC`;
	const bridgeRoutingReady = routingStatus === "ready" && depositRoute === "bridge";
	const routingNotice = (() => {
		if (bridgeRoutingReady) return null;
		if (routingStatus === "loading") {
			return (
				<div className="rounded-xs border border-stroke-weak/50 bg-fill-weaker px-3 py-2 text-center text-xs leading-relaxed text-fg-muted">
					<Trans>Checking the current Hyperliquid deposit route...</Trans>
				</div>
			);
		}
		const isCctp = routingStatus === "ready" && depositRoute === "cctp";
		return (
			<div
				role="alert"
				className="rounded-xs border border-stroke-error-strong/60 bg-error-soft px-3 py-2 text-center text-xs leading-relaxed text-error"
			>
				<p>
					{isCctp ? (
						<Trans>Hyperliquid currently requires CCTP deposits. Bridge deposits are paused in this app.</Trans>
					) : (
						<Trans>Unable to verify the current Hyperliquid deposit route. Deposits are paused.</Trans>
					)}
				</p>
				{!isCctp ? (
					<Button variant="link" intent="brand" size="xxs" className="mt-1 h-auto p-0" onClick={onRetryRouting}>
						<Trans>Retry</Trans>
					</Button>
				) : null}
			</div>
		);
	})();
	const embeddedDepositStatus = (() => {
		if (!smartDepositEnabled) {
			return {
				tone: "error" as const,
				text: <Trans>Smart wallet deposits are not enabled for this network.</Trans>,
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
		return null;
	})();

	if (fundingAddress) {
		return (
			<div className="flex flex-1 flex-col gap-4">
				<div className="flex flex-col items-center gap-3 pt-1">
					<div className="flex size-12 items-center justify-center rounded-full border border-stroke-brand-strong/40 bg-brand-soft">
						<img src={USDC_ICON_URL} alt="USDC" className="size-8 rounded-full" />
					</div>
					<h3 className="text-base font-semibold text-fg">
						<Trans>Deposit USDC from Arbitrum</Trans>
					</h3>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<AssetSelect />
					<NetworkSelect
						label={<Trans>Funding chain</Trans>}
						value="arbitrum"
						onChange={() => {}}
						disabled
						displayName={networkName}
					/>
				</div>

				{routingNotice}

				{bridgeRoutingReady ? (
					<>
						<FundingAddressCard address={fundingAddress} />

						{embeddedDepositStatus ? (
							<div
								className={
									embeddedDepositStatus.tone === "error"
										? "rounded-xs border border-stroke-error-strong/60 bg-error-soft px-3 py-2 text-center text-xs leading-relaxed text-error"
										: embeddedDepositStatus.tone === "success"
											? "rounded-xs border border-stroke-success-strong/50 bg-success-soft px-3 py-2 text-center text-xs leading-relaxed text-success"
											: "rounded-xs border border-stroke-weak/50 bg-fill-weaker px-3 py-2 text-center text-xs leading-relaxed text-fg-muted"
								}
							>
								{embeddedDepositStatus.text}
							</div>
						) : null}

						<UnitDepositInfo networkName={networkName} />
					</>
				) : null}

				<Button variant="filled" intent="brand" onClick={onDone} className="w-full">
					<Trans>Done</Trans>
				</Button>

				{bridgeRoutingReady ? (
					<div className="rounded-xs border border-stroke-error-strong/60 bg-error-soft px-3 py-2 text-center text-xs leading-relaxed text-error">
						<WarningCircleIcon className="mr-1 inline size-3.5 align-[-2px]" />
						<Trans>
							Important: this address can only receive native USDC on Arbitrum. Do not send USDC.e or assets from other
							networks. Minimum deposit is {minimumDeposit}.
						</Trans>
					</div>
				) : null}
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col gap-2">
			<div className="grid grid-cols-2 gap-2">
				<AssetSelect />
				<NetworkSelect
					label={<Trans>Network</Trans>}
					value="arbitrum"
					onChange={() => {}}
					disabled
					displayName={networkName}
				/>
			</div>

			{routingNotice}

			{bridgeRoutingReady ? <UnitDepositInfo networkName={networkName} /> : null}

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
