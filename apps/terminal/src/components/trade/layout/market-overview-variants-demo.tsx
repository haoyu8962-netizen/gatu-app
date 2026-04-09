import { t } from "@lingui/core/macro";
import { FireIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StatBlock } from "../chart/stat-block";

const DEMO = {
	price: "$310.02",
	change: "-4.16%",
	oracle: "$310.10",
	vol: "$24.49M",
	oi: "$53.44M",
	funding: "+0.0013%",
};

function SectionShell({ children }: { children: ReactNode }) {
	return (
		<div className="border-t border-stroke-weak/35 bg-bg-base px-2 py-1.5 min-w-0 overflow-x-auto scrollbar-none">
			{children}
		</div>
	);
}

function VariantLabel({ title, description }: { title: string; description: string }) {
	return (
		<div className="space-y-1 px-2 pt-1">
			<h2 className="text-xs font-semibold uppercase tracking-wider text-text-strong">{title}</h2>
			<p className="text-2xs text-text-weak max-w-3xl leading-relaxed">{description}</p>
		</div>
	);
}

function VariantAInlineRail() {
	return (
		<div className="flex min-h-0 w-max min-w-0 flex-nowrap items-center gap-0 text-xs">
			<div className="flex shrink-0 items-center gap-2 border-r border-stroke-weak/35 pr-2.5">
				<span className="font-sans text-sm font-semibold tabular-nums tracking-tight text-text-strong">
					{DEMO.price}
				</span>
				<span className="font-sans text-xs font-medium tabular-nums leading-none text-market-down">{DEMO.change}</span>
			</div>
			<div className="h-3 w-px shrink-0 self-center bg-stroke-weak/30" aria-hidden />
			<StatBlock layout="inline" label={t`ORACLE`} value={DEMO.oracle} />
			<div className="h-3 w-px shrink-0 self-center bg-stroke-weak/30" aria-hidden />
			<StatBlock layout="inline" label={t`24H VOL`} value={DEMO.vol} />
			<div className="h-3 w-px shrink-0 self-center bg-stroke-weak/30" aria-hidden />
			<StatBlock layout="inline" label={t`OPEN INT`} value={DEMO.oi} />
			<div className="h-3 w-px shrink-0 self-center bg-stroke-weak/30" aria-hidden />
			<StatBlock
				layout="inline"
				label={t`FUNDING`}
				value={DEMO.funding}
				valueClass="text-market-up"
				icon={<FireIcon className="size-2.5 shrink-0 text-market-up" />}
			/>
		</div>
	);
}

function VariantBPills() {
	const items = [
		{ k: t`ORACLE`, v: DEMO.oracle },
		{ k: t`24H VOL`, v: DEMO.vol },
		{ k: t`OPEN INT`, v: DEMO.oi },
		{ k: t`FUNDING`, v: DEMO.funding, vClass: "text-market-up" },
	];
	return (
		<div className="flex flex-wrap items-center gap-2 text-xs">
			<div className="flex shrink-0 items-center gap-2 border-r border-stroke-weak/35 pr-2.5 mr-0.5">
				<span className="font-sans text-sm font-semibold tabular-nums text-text-strong">{DEMO.price}</span>
				<span className="font-medium tabular-nums text-market-down">{DEMO.change}</span>
			</div>
			{items.map((item) => (
				<span
					key={item.k}
					className="inline-flex items-center gap-1.5 rounded-full border border-stroke-weak/40 bg-fill-weak/80 px-2 py-0.5 tabular-nums"
				>
					<span className="text-2xs font-medium uppercase tracking-wide text-text-weak">{item.k}</span>
					<span className={cn("font-medium text-text-strong", item.vClass)}>{item.v}</span>
				</span>
			))}
		</div>
	);
}

function VariantCGrid() {
	return (
		<div className="grid w-full max-w-4xl grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-3">
			<div className="col-span-2 flex items-baseline gap-2 border-b border-stroke-weak/25 pb-2 lg:col-span-2 lg:border-b-0 lg:pb-0 lg:pr-3 lg:border-r">
				<span className="text-xl font-semibold tabular-nums text-text-strong">{DEMO.price}</span>
				<span className="text-sm font-medium tabular-nums text-market-down">{DEMO.change}</span>
			</div>
			{[
				{ label: t`ORACLE`, value: DEMO.oracle },
				{ label: t`24H VOL`, value: DEMO.vol },
				{ label: t`OPEN INT`, value: DEMO.oi },
				{ label: t`FUNDING`, value: DEMO.funding, valueClass: "text-market-up" },
			].map((row) => (
				<StatBlock key={row.label} layout="stacked" label={row.label} value={row.value} valueClass={row.valueClass} />
			))}
		</div>
	);
}

function VariantDSentence() {
	return (
		<p className="text-xs leading-relaxed text-text-weak">
			<span className="font-semibold tabular-nums text-text-strong">{DEMO.price}</span>
			<span className="mx-1 text-stroke-weak">·</span>
			<span className="tabular-nums font-medium text-market-down">{DEMO.change}</span>
			<span className="mx-1.5 text-stroke-weak">·</span>
			<span className="text-text-weak/90">{t`Oracle`}</span>{" "}
			<span className="font-medium tabular-nums text-text-strong">{DEMO.oracle}</span>
			<span className="mx-1.5 text-stroke-weak">·</span>
			<span className="text-text-weak/90">{t`24h vol`}</span>{" "}
			<span className="font-medium tabular-nums text-text-strong">{DEMO.vol}</span>
			<span className="mx-1.5 text-stroke-weak">·</span>
			<span className="text-text-weak/90">{t`OI`}</span>{" "}
			<span className="font-medium tabular-nums text-text-strong">{DEMO.oi}</span>
			<span className="mx-1.5 text-stroke-weak">·</span>
			<span className="text-text-weak/90">{t`Funding`}</span>{" "}
			<span className="font-medium tabular-nums text-market-up">{DEMO.funding}</span>
		</p>
	);
}

function VariantEMicroCards() {
	const cards = [
		{ label: t`ORACLE`, value: DEMO.oracle },
		{ label: t`24H VOL`, value: DEMO.vol },
		{ label: t`OPEN INT`, value: DEMO.oi },
		{ label: t`FUNDING`, value: DEMO.funding, valueClass: "text-market-up" },
	];
	return (
		<div className="flex flex-wrap items-stretch gap-2">
			<div className="flex min-w-[7rem] flex-1 flex-col justify-center rounded-8 border border-stroke-weak/40 bg-fill-weaker px-2 py-1">
				<span className="text-2xs uppercase tracking-wide text-text-weak">{t`Mark`}</span>
				<div className="flex items-baseline gap-2">
					<span className="text-sm font-semibold tabular-nums text-text-strong">{DEMO.price}</span>
					<span className="text-xs font-medium tabular-nums text-market-down">{DEMO.change}</span>
				</div>
			</div>
			{cards.map((c) => (
				<div
					key={c.label}
					className="flex min-w-[5.5rem] flex-1 flex-col justify-center rounded-8 border border-stroke-weak/35 bg-bg-raised/60 px-2 py-1"
				>
					<span className="text-2xs uppercase tracking-wide text-text-weak">{c.label}</span>
					<span className={cn("text-xs font-medium tabular-nums text-text-strong", c.valueClass)}>{c.value}</span>
				</div>
			))}
		</div>
	);
}

export function MarketOverviewVariantsDemo() {
	return (
		<div className="min-h-screen bg-bg-base text-text-strong">
			<div className="mx-auto max-w-5xl px-4 py-8 space-y-10">
				<header className="space-y-2 border-b border-stroke-weak pb-6">
					<h1 className="text-lg font-semibold tracking-tight">{t`Market stats row — layout options`}</h1>
					<p className="text-sm text-text-weak max-w-2xl leading-relaxed">
						{t`This row answers: “What is the selected market doing right now?” — mark price, 24h move, oracle, volume, open interest, and funding. Pick a layout that balances scan speed, density, and calm.`}
					</p>
				</header>

				<div className="space-y-3">
					<VariantLabel
						title="A · Inline rail (current direction)"
						description="Price + change grouped, then label/value pairs with vertical dividers. Best for scanning left-to-right in one line."
					/>
					<SectionShell>
						<VariantAInlineRail />
					</SectionShell>
				</div>

				<div className="space-y-3">
					<VariantLabel
						title="B · Soft pills"
						description="Secondary metrics become chips so labels and values read as one object. Slightly taller but clearer grouping."
					/>
					<SectionShell>
						<VariantBPills />
					</SectionShell>
				</div>

				<div className="space-y-3">
					<VariantLabel
						title="C · Stacked grid"
						description="Larger hero price, then stacked label/value cells. Strong hierarchy; works well on wide terminals."
					/>
					<SectionShell>
						<VariantCGrid />
					</SectionShell>
				</div>

				<div className="space-y-3">
					<VariantLabel
						title="D · Sentence / prose"
						description="Single flowing line with middle dots — low chrome, editorial feel; best when you want the row to disappear."
					/>
					<SectionShell>
						<VariantDSentence />
					</SectionShell>
				</div>

				<div className="space-y-3">
					<VariantLabel
						title="E · Micro-cards"
						description="Each metric is its own tile; mark/change share the first card. Easy touch targets; uses more horizontal space."
					/>
					<SectionShell>
						<VariantEMicroCards />
					</SectionShell>
				</div>
			</div>
		</div>
	);
}
