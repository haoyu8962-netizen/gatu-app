import type { ReactNode } from "react";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";

interface Props {
	deposit: ReactNode;
	withdraw: ReactNode;
	description?: ReactNode;
	title: string;
	titleId?: string;
	rows: readonly { key: string; label: ReactNode; value: ReactNode }[];
}

export function AccountOverviewView({ deposit, withdraw, description, title, titleId, rows }: Props) {
	return (
		<div data-slot="disconnected-account-overview" data-grid-content-part className="shrink-0 px-2 pt-3 pb-3">
			<div className="grid grid-cols-2 gap-2">
				{deposit}
				{withdraw}
			</div>
			{description}
			<section aria-labelledby={titleId} className="mt-3 border-t border-trading-panel-stroke-row pt-3">
				<h3 id={titleId} className="mb-1 text-2sm font-bold text-trading-panel-fg">
					{title}
				</h3>
				<InfoRowGroup className="divide-y-0 tracking-normal">
					{rows.map((row) => (
						<InfoRow
							key={row.key}
							label={row.label}
							value={row.value}
							className="gap-2"
							labelClassName="min-w-0 text-trading-panel-muted"
							valueClassName="shrink-0 whitespace-nowrap font-semibold text-trading-panel-fg tabular-nums"
						/>
					))}
				</InfoRowGroup>
			</section>
		</div>
	);
}
