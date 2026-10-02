import { Trans } from "@lingui/react/macro";
import { CaretRightIcon, CreditCardIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { TOUCH_PRESS_CLASS } from "@/components/ui/touch-press";
import { USDC_ICON_URL } from "@/config/bridge";
import type { PrivyFiatFundingWalletKind } from "@/domain/trade/privy-fiat-funding";
import { cn } from "@/lib/cn";

interface Props {
	fiat: { walletKind: PrivyFiatFundingWalletKind; disabled: boolean };
	notice: ReactNode;
	onTransfer: () => void;
	onBuy: () => void;
}

export function DepositMethodChooser({ fiat, notice, onTransfer, onBuy }: Props) {
	return (
		<div className="flex flex-col gap-3 font-market-close text-trading-panel-fg" data-deposit-layout="methods">
			<h3 className="pb-1 text-center text-base font-bold">
				<Trans>Deposit</Trans>
			</h3>
			<MethodOption
				method="transfer"
				icon={<img src={USDC_ICON_URL} alt="" aria-hidden="true" className="size-8 rounded-full" />}
				title={<Trans context="Deposit method">Transfer USDC</Trans>}
				description={
					fiat.walletKind === "external" ? (
						<Trans>Deposit native USDC on Arbitrum from your connected wallet.</Trans>
					) : (
						<Trans>Send native USDC on Arbitrum from an exchange or wallet.</Trans>
					)
				}
				onClick={onTransfer}
			/>
			<MethodOption
				method="fiat"
				icon={
					<span className="flex size-8 items-center justify-center rounded-full bg-modal" aria-hidden="true">
						<CreditCardIcon className="size-5 text-trading-panel-muted" />
					</span>
				}
				title={<Trans>Buy USDC with a card</Trans>}
				description={
					<>
						<Trans>
							Card or bank transfer through a third-party payment provider. USDC arrives in your wallet on Arbitrum.
						</Trans>
						{fiat.walletKind === "external" ? (
							<span className="mt-1 block">
								<Trans>Depositing it needs a little ETH on Arbitrum for network fees.</Trans>
							</span>
						) : null}
					</>
				}
				disabled={fiat.disabled}
				onClick={onBuy}
			/>
			{notice ? (
				<div
					role="alert"
					className="rounded-16 border border-stroke-error-weak bg-error-soft px-3 py-2.5 text-xs text-market-close-danger"
					data-deposit-slot="methods-notice"
				>
					{notice}
				</div>
			) : null}
		</div>
	);
}

interface MethodOptionProps {
	method: "fiat" | "transfer";
	icon: ReactNode;
	title: ReactNode;
	description: ReactNode;
	disabled?: boolean;
	onClick: () => void;
}

function MethodOption({ method, icon, title, description, disabled = false, onClick }: MethodOptionProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			data-deposit-method={method}
			className={cn(
				"flex w-full items-center gap-3 rounded-20 border border-trading-panel-stroke-card bg-trading-panel-card px-3.5 py-3 text-start",
				"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
				disabled ? "cursor-not-allowed" : cn(TOUCH_PRESS_CLASS, "min-[1001px]:hover:bg-trading-panel-hover"),
			)}
		>
			<span className="shrink-0">{icon}</span>
			<span className="min-w-0 flex-1">
				<span className={cn("block text-2sm font-bold", disabled ? "text-fg-disabled" : "text-trading-panel-fg")}>
					{title}
				</span>
				<span
					className={cn("mt-0.5 block text-xs leading-5", disabled ? "text-fg-disabled" : "text-trading-panel-muted")}
				>
					{description}
				</span>
			</span>
			<CaretRightIcon
				className={cn("size-4 shrink-0 rtl:rotate-180", disabled ? "text-fg-disabled" : "text-trading-panel-muted")}
				aria-hidden="true"
			/>
		</button>
	);
}
