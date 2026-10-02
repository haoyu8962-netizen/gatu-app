import { Trans } from "@lingui/react/macro";
import { CreditCardIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { useId } from "react";
import type { PrivyFiatFundingWalletKind } from "@/domain/trade/privy-fiat-funding";

interface Props {
	walletKind: PrivyFiatFundingWalletKind;
	disabled: boolean;
	onStart: () => void;
}

export function PrivyFiatFundingCard({ walletKind, disabled, onStart }: Props) {
	const titleId = useId();

	return (
		<section
			className="flex flex-col gap-3 rounded-20 border border-market-close-stroke-card bg-market-close-card p-3.5"
			aria-labelledby={titleId}
			data-deposit-slot="fiat-funding"
			data-wallet-kind={walletKind}
		>
			<div className="flex items-start gap-3">
				<CreditCardIcon className="mt-0.5 size-5 shrink-0 text-market-close-muted" aria-hidden="true" />
				<div className="min-w-0 space-y-1">
					<h4 id={titleId} className="text-2sm font-bold text-market-close-fg">
						<Trans>Buy USDC with a card</Trans>
					</h4>
					<p className="text-xs leading-5 text-market-close-muted">
						<Trans>
							Pay by card or bank transfer through a third-party payment provider. USDC arrives in your wallet on
							Arbitrum, and you deposit it from here.
						</Trans>
					</p>
					{walletKind === "external" ? (
						<p className="text-xs leading-5 text-market-close-muted">
							<Trans>Depositing it needs a little ETH on Arbitrum for network fees.</Trans>
						</p>
					) : null}
				</div>
			</div>
			<Button
				type="button"
				variant="outline"
				intent="neutral"
				onClick={onStart}
				disabled={disabled}
				className="min-h-11 w-full rounded-24 border-market-close-stroke-input bg-modal text-2sm font-bold text-market-close-fg shadow-none"
			>
				<Trans>Buy USDC</Trans>
			</Button>
		</section>
	);
}
