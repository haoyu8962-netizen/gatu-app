import { Trans } from "@lingui/react/macro";
import type { SyntheticEvent } from "react";
import { ARBITRUM_ICON_URL, USDC_ICON_URL } from "@/config/bridge";

interface Props {
	network: string;
}

const ROUTE_DETAIL_CLASS =
	"relative min-w-0 rounded-8 border border-market-close-stroke-input bg-modal px-3 py-2 text-2sm leading-5 font-medium text-market-close-fg";
const ROUTE_VALUE_CLASS = "flex min-w-0 items-center gap-2";
const ROUTE_ICON_CLASS = "size-4.5 shrink-0 rounded-full";

function hideBrokenIcon(event: SyntheticEvent<HTMLImageElement>) {
	event.currentTarget.hidden = true;
}

export function FundsRouteDetails({ network }: Props) {
	return (
		<dl className="grid min-w-0 grid-cols-2 gap-2" data-slot="funds-route-details">
			<div className={ROUTE_DETAIL_CLASS}>
				<dt className="sr-only">
					<Trans>Asset</Trans>
				</dt>
				<dd className={ROUTE_VALUE_CLASS}>
					<img src={USDC_ICON_URL} alt="" aria-hidden="true" className={ROUTE_ICON_CLASS} />
					<span className="min-w-0 truncate">USDC</span>
				</dd>
			</div>
			<div className={ROUTE_DETAIL_CLASS}>
				<dt className="sr-only">
					<Trans>Network</Trans>
				</dt>
				<dd className={ROUTE_VALUE_CLASS}>
					<img
						src={ARBITRUM_ICON_URL}
						alt=""
						aria-hidden="true"
						className={ROUTE_ICON_CLASS}
						onError={hideBrokenIcon}
					/>
					<span className="min-w-0 break-words">{network}</span>
				</dd>
			</div>
		</dl>
	);
}
