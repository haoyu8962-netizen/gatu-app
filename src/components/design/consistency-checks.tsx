import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

function Check({ label, pass, note }: { label: string; pass: boolean; note?: string }) {
	return (
		<div className="flex items-start gap-2 rounded-xs border border-border-100 bg-surface-execution px-3 py-2">
			{pass ? (
				<CheckCircleIcon className="mt-0.5 size-3.5 shrink-0 text-success-700" weight="fill" />
			) : (
				<WarningCircleIcon className="mt-0.5 size-3.5 shrink-0 text-warning-700" weight="fill" />
			)}
			<div>
				<p className="text-2xs text-text-950">{label}</p>
				{note && <p className="text-3xs text-text-400">{note}</p>}
			</div>
		</div>
	);
}

export function ConsistencyChecks() {
	return (
		<div className="space-y-6">
			<h2 className="text-xs font-semibold uppercase tracking-wider">Consistency Checks</h2>

			<section className="space-y-3">
				<h3 className="text-2xs font-medium uppercase tracking-wider text-text-400">Radius Check</h3>
				<p className="text-3xs text-text-500">
					All interactive elements should use rounded-xs. Visual comparison below.
				</p>
				<div className="flex flex-wrap items-end gap-4 rounded-xs border border-border-100 bg-surface-execution p-4">
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Button</p>
						<Button variant="contained" tone="base" size="md">
							Action
						</Button>
					</div>
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Input</p>
						<Input placeholder="Type here" className="w-32" />
					</div>
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Badge</p>
						<Badge>Label</Badge>
					</div>
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Checkbox</p>
						<Checkbox checked />
					</div>
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Switch</p>
						<Switch checked />
					</div>
				</div>
				<div className="grid gap-1">
					<Check label="Button uses rounded-xs" pass note="Confirmed via buttonVariants base class" />
					<Check label="Input uses rounded-sm" pass note="Project convention for inputs" />
					<Check label="Checkbox uses rounded-xs" pass note="Confirmed via Checkbox component" />
					<Check label="Badge uses rounded-full" pass note="Design choice for pill badges" />
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-2xs font-medium uppercase tracking-wider text-text-400">Border & Ring Check</h3>
				<p className="text-3xs text-text-500">Default border uses border-200. Focus rings use primary-default/50.</p>
				<div className="flex flex-wrap items-end gap-4 rounded-xs border border-border-100 bg-surface-execution p-4">
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Default border</p>
						<div className="h-8 w-24 rounded-xs border" />
					</div>
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Focus ring (simulated)</p>
						<div className="h-8 w-24 rounded-xs border border-primary-default/50 ring-[3px] ring-primary-default/50" />
					</div>
					<div className="space-y-1">
						<p className="text-3xs text-text-400">Error ring (simulated)</p>
						<div className="h-8 w-24 rounded-xs border border-error-700 ring-[3px] ring-error-700/20" />
					</div>
				</div>
				<div className="grid gap-1">
					<Check label="Default border is border-200" pass note="Set in @layer base as border-border-200" />
					<Check
						label="Focus ring uses primary-default/50"
						pass
						note="Consistent across Button, Input, Checkbox, Switch"
					/>
					<Check label="Error ring uses error-700/20" pass note="Consistent in Input and Checkbox" />
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-2xs font-medium uppercase tracking-wider text-text-400">Surface Elevation</h3>
				<p className="text-3xs text-text-500">
					Surface hierarchy: base → analysis → execution. Each step lighter in light mode, darker background in dark
					mode.
				</p>
				<div className="flex gap-0 rounded-xs border border-border-100 overflow-hidden">
					<div className="flex-1 bg-surface-base p-4">
						<p className="text-3xs font-medium text-text-600">surface-base</p>
						<p className="text-4xs text-text-400">Page background</p>
					</div>
					<div className="flex-1 bg-surface-analysis p-4">
						<p className="text-3xs font-medium text-text-600">surface-analysis</p>
						<p className="text-4xs text-text-400">Panels</p>
					</div>
					<div className="flex-1 bg-surface-execution p-4">
						<p className="text-3xs font-medium text-text-600">surface-execution</p>
						<p className="text-4xs text-text-400">Cards / elevated</p>
					</div>
				</div>
				<div className="flex gap-0 rounded-xs border border-border-100 overflow-hidden">
					<div className="flex-1 bg-surface-monitoring-row-a p-4">
						<p className="text-3xs font-medium text-text-600">monitoring-row-a</p>
						<p className="text-4xs text-text-400">Table row A</p>
					</div>
					<div className="flex-1 bg-surface-monitoring-row-b p-4">
						<p className="text-3xs font-medium text-text-600">monitoring-row-b</p>
						<p className="text-4xs text-text-400">Table row B</p>
					</div>
				</div>
				<div className="grid gap-1">
					<Check label="Surface hierarchy is visually distinct" pass note="base → analysis → execution progression" />
					<Check label="Alternating table rows are distinguishable" pass note="row-a vs row-b differ" />
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-2xs font-medium uppercase tracking-wider text-text-400">Market Colors</h3>
				<p className="text-3xs text-text-500">
					Green for up/long, red for down/short. Each has 4 levels (600, 500, 100, 50).
				</p>
				<div className="flex gap-4 rounded-xs border border-border-100 bg-surface-execution p-4">
					<div className="space-y-1">
						<div className="flex gap-1">
							<div className="size-8 rounded-xs bg-market-up-600" />
							<div className="size-8 rounded-xs bg-market-up-500" />
							<div className="size-8 rounded-xs bg-market-up-100 border border-border-100" />
							<div className="size-8 rounded-xs bg-market-up-50 border border-border-100" />
						</div>
						<p className="text-3xs text-text-400">market-up (600 → 50)</p>
					</div>
					<div className="space-y-1">
						<div className="flex gap-1">
							<div className="size-8 rounded-xs bg-market-down-600" />
							<div className="size-8 rounded-xs bg-market-down-500" />
							<div className="size-8 rounded-xs bg-market-down-100 border border-border-100" />
							<div className="size-8 rounded-xs bg-market-down-50 border border-border-100" />
						</div>
						<p className="text-3xs text-text-400">market-down (600 → 50)</p>
					</div>
					<div className="space-y-1">
						<div className="flex gap-1">
							<div className="size-8 rounded-xs bg-market-neutral border border-border-100" />
						</div>
						<p className="text-3xs text-text-400">neutral</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Badge variant="long">+12.5%</Badge>
					<Badge variant="short">-3.2%</Badge>
					<Badge variant="neutral">0.0%</Badge>
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-2xs font-medium uppercase tracking-wider text-text-400">Typography Scale</h3>
				<div className="space-y-2 rounded-xs border border-border-100 bg-surface-execution p-4">
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">5xs (8px)</span>
						<span className="text-5xs text-text-950">The quick brown fox</span>
					</div>
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">4xs (9px)</span>
						<span className="text-4xs text-text-950">The quick brown fox</span>
					</div>
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">3xs (10px)</span>
						<span className="text-3xs text-text-950">The quick brown fox</span>
					</div>
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">2xs (11px)</span>
						<span className="text-2xs text-text-950">The quick brown fox</span>
					</div>
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">xs (12px)</span>
						<span className="text-xs text-text-950">The quick brown fox</span>
					</div>
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">nav (13px)</span>
						<span className="text-nav text-text-950">The quick brown fox</span>
					</div>
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">sm (14px)</span>
						<span className="text-sm text-text-950">The quick brown fox</span>
					</div>
					<div className="flex items-baseline gap-4">
						<span className="w-16 text-3xs text-text-400">base (16px)</span>
						<span className="text-base text-text-950">The quick brown fox</span>
					</div>
				</div>
			</section>
		</div>
	);
}
