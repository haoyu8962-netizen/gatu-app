import { Trans } from "@lingui/react/macro";

interface Props {
	network: string;
}

export function FundsRouteDetails({ network }: Props) {
	return (
		<dl className="grid min-w-0 grid-cols-2 gap-2" data-slot="funds-route-details">
			<div className="min-w-0 rounded-8 border border-market-close-stroke-input bg-modal px-3 py-2">
				<dt className="text-[11px] leading-4 text-market-close-muted">
					<Trans>Asset</Trans>
				</dt>
				<dd className="text-[13px] leading-5 font-medium text-market-close-fg">USDC</dd>
			</div>
			<div className="min-w-0 rounded-8 border border-market-close-stroke-input bg-modal px-3 py-2">
				<dt className="text-[11px] leading-4 text-market-close-muted">
					<Trans>Network</Trans>
				</dt>
				<dd className="break-words text-[13px] leading-5 font-medium text-market-close-fg">{network}</dd>
			</div>
		</dl>
	);
}
