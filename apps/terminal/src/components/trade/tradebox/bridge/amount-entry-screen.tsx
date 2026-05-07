import { Button } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import Big from "big.js";
import { useState } from "react";
import { PERCENT_OPTIONS } from "@/config/bridge";
import { isValidUsdInput, usdToTokenAmount } from "@/lib/bridge/format";
import { cn } from "@/lib/cn";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { HyperCoreUsdcIcon, TokenIcon } from "./shared-ui";

const BRIDGE_USD_INPUT_WIDTH = "w-36";

interface Props {
	token: BridgeToken;
	initialUsd: string;
	onBack: () => void;
	onContinue: (tokenAmount: string, usdInput: string) => void;
}

export function AmountEntryScreen({ token, initialUsd, onBack, onContinue }: Props) {
	const [usdInput, setUsdInput] = useState(initialUsd);

	function handleUsdChange(e: React.ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value;
		if (raw === "") {
			setUsdInput("");
			return;
		}
		if (!/^\d*\.?\d{0,2}$/.test(raw)) return;
		setUsdInput(raw);
	}

	function handlePercent(percent: number) {
		const usd = Big(token.amountUSD).times(percent).div(100).toFixed(2);
		setUsdInput(usd);
	}

	function handleMax() {
		setUsdInput(Big(token.amountUSD).toFixed(2));
	}

	const canContinue = isValidUsdInput(usdInput) && Big(usdInput).lte(token.amountUSD);

	function handleSubmit() {
		if (!canContinue) return;
		const tokenAmount = usdToTokenAmount(usdInput, token.priceUSD, token.decimals);
		if (tokenAmount) onContinue(tokenAmount, usdInput);
	}

	return (
		<div className="flex flex-1 flex-col gap-6">
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1 text-xs text-brand hover:opacity-80 self-start"
			>
				<ArrowLeftIcon className="size-3" />
				<Trans>Back</Trans>
			</button>

			<div className="flex flex-col items-center gap-4 py-4">
				<div className="flex items-baseline justify-center">
					<span className="text-4xl font-semibold text-fg tabular-nums">$</span>
					<input
						type="text"
						inputMode="decimal"
						value={usdInput}
						onChange={handleUsdChange}
						placeholder="0.00"
						className={cn(
							BRIDGE_USD_INPUT_WIDTH,
							"text-4xl font-semibold text-fg tabular-nums bg-transparent border-none outline-none text-center placeholder:text-fg-disabled",
						)}
					/>
				</div>

				<div className="flex items-center gap-2">
					{PERCENT_OPTIONS.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => handlePercent(p)}
							className="px-3 py-1.5 text-xs font-medium text-fg bg-surface hover:bg-brand/20 rounded-8 transition-colors"
						>
							<Trans>{p}%</Trans>
						</button>
					))}
					<button
						type="button"
						onClick={handleMax}
						className="px-3 py-1.5 text-xs font-medium text-fg bg-surface hover:bg-brand/20 rounded-8 transition-colors"
					>
						<Trans>Max</Trans>
					</button>
				</div>
			</div>

			<div className="flex items-center justify-center gap-3 rounded-8 border border-stroke-weak p-3">
				<div className="flex items-center gap-2">
					<TokenIcon token={token} />
					<div className="text-left">
						<p className="text-xs text-fg-muted">
							<Trans>You send</Trans>
						</p>
						<p className="text-xs font-medium text-fg">{token.symbol}</p>
					</div>
				</div>
				<ArrowRightIcon className="size-4 text-fg-muted shrink-0" />
				<div className="flex items-center gap-2">
					<HyperCoreUsdcIcon />
					<div className="text-left">
						<p className="text-xs text-fg-muted">
							<Trans>You receive</Trans>
						</p>
						<p className="text-xs font-medium text-fg">USDC</p>
					</div>
				</div>
			</div>

			<Button
				variant="filled"
				intent="brand"
				size="lg"
				className="w-full mt-auto"
				disabled={!canContinue}
				onClick={handleSubmit}
			>
				<Trans>Continue</Trans>
			</Button>
		</div>
	);
}
