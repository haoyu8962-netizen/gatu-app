import { useLingui } from "@lingui/react/macro";
import { getPositionCloseAllTargetDetails, type PositionCloseAllTarget } from "@/domain/trade/position-close-all";
import { formatToken } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";

interface Props {
	targets: readonly PositionCloseAllTarget[];
}

export function PositionCloseAllTargets({ targets }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	return (
		<ul aria-label={t`Positions to close`} className="max-h-44 space-y-2 overflow-y-auto text-xs">
			{targets.map((target) => {
				const details = getPositionCloseAllTargetDetails(target);
				return (
					<li key={target.assetId} className="flex items-start justify-between gap-3">
						<span className="min-w-0 break-all text-market-close-fg" dir="ltr">
							{target.coin}
						</span>
						<span className="shrink-0 text-market-close-muted">
							{details.side === "long" ? t`Long` : t`Short`} ·{" "}
							<span dir="ltr">{formatToken(details.size, target.szDecimals)}</span>
						</span>
					</li>
				);
			})}
		</ul>
	);
}
