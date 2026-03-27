import { useEffect, useState } from "react";
import { useTheme } from "@/stores/use-global-settings-store";

interface TokenGroup {
	label: string;
	tokens: { name: string; variable: string; pairedFg?: string }[];
}

const TOKEN_GROUPS: TokenGroup[] = [
	{
		label: "Text",
		tokens: [
			{ name: "text-950", variable: "--text-950" },
			{ name: "text-600", variable: "--text-600" },
			{ name: "text-500", variable: "--text-500" },
			{ name: "text-400", variable: "--text-400" },
			{ name: "text-10", variable: "--text-10" },
		],
	},
	{
		label: "Surface",
		tokens: [
			{ name: "surface-base", variable: "--surface-base", pairedFg: "--text-950" },
			{ name: "surface-analysis", variable: "--surface-analysis", pairedFg: "--text-950" },
			{ name: "surface-execution", variable: "--surface-execution", pairedFg: "--text-950" },
			{ name: "surface-monitoring-row-a", variable: "--surface-monitoring-row-a", pairedFg: "--text-950" },
			{ name: "surface-monitoring-row-b", variable: "--surface-monitoring-row-b", pairedFg: "--text-950" },
		],
	},
	{
		label: "Border",
		tokens: [
			{ name: "border-500", variable: "--border-500" },
			{ name: "border-300", variable: "--border-300" },
			{ name: "border-200", variable: "--border-200" },
			{ name: "border-100", variable: "--border-100" },
			{ name: "border-50", variable: "--border-50" },
		],
	},
	{
		label: "Primary",
		tokens: [
			{ name: "primary-default", variable: "--primary-default" },
			{ name: "primary-hover", variable: "--primary-hover" },
			{ name: "primary-active", variable: "--primary-active" },
			{ name: "primary-muted", variable: "--primary-muted" },
		],
	},
	{
		label: "Market",
		tokens: [
			{ name: "market-up-600", variable: "--market-up-600" },
			{ name: "market-up-500", variable: "--market-up-500" },
			{ name: "market-up-100", variable: "--market-up-100" },
			{ name: "market-up-50", variable: "--market-up-50" },
			{ name: "market-down-600", variable: "--market-down-600" },
			{ name: "market-down-500", variable: "--market-down-500" },
			{ name: "market-down-100", variable: "--market-down-100" },
			{ name: "market-down-50", variable: "--market-down-50" },
			{ name: "market-neutral", variable: "--market-neutral" },
		],
	},
	{
		label: "Signals",
		tokens: [
			{ name: "success-700", variable: "--success-700" },
			{ name: "success-100", variable: "--success-100" },
			{ name: "warning-700", variable: "--warning-700" },
			{ name: "warning-100", variable: "--warning-100" },
			{ name: "error-700", variable: "--error-700" },
			{ name: "error-100", variable: "--error-100" },
		],
	},
	{
		label: "Fill",
		tokens: [
			{ name: "fill-900", variable: "--fill-900" },
			{ name: "fill-300", variable: "--fill-300" },
			{ name: "fill-100", variable: "--fill-100" },
			{ name: "fill-50", variable: "--fill-50" },
		],
	},
	{
		label: "Scope Accents",
		tokens: [
			{ name: "scope-perp", variable: "--scope-perp" },
			{ name: "scope-spot", variable: "--scope-spot" },
			{ name: "scope-builders", variable: "--scope-builders" },
		],
	},
	{
		label: "Other",
		tokens: [
			{ name: "highlight", variable: "--highlight" },
			{ name: "sel", variable: "--sel" },
		],
	},
];

function getComputedColor(variable: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function luminance(hex: string): number {
	const rgb = hexToRgb(hex);
	if (!rgb) return 0;
	const [r, g, b] = rgb.map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] | null {
	const clean = hex.replace("#", "");
	if (clean.length !== 6 && clean.length !== 3) return null;
	const full =
		clean.length === 3
			? clean
					.split("")
					.map((c) => c + c)
					.join("")
			: clean;
	const num = parseInt(full, 16);
	return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function contrastRatio(l1: number, l2: number): number {
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

function contrastLabel(ratio: number): { label: string; className: string } {
	if (ratio >= 7) return { label: "AAA", className: "text-success-700" };
	if (ratio >= 4.5) return { label: "AA", className: "text-warning-700" };
	return { label: "Fail", className: "text-error-700" };
}

function resolveToHex(computed: string): string {
	if (computed.startsWith("#")) return computed;
	const el = document.createElement("div");
	el.style.color = computed;
	document.body.appendChild(el);
	const resolved = getComputedStyle(el).color;
	document.body.removeChild(el);
	const match = resolved.match(/(\d+)/g);
	if (!match || match.length < 3) return computed;
	return (
		"#" +
		match
			.slice(0, 3)
			.map((n) => Number(n).toString(16).padStart(2, "0"))
			.join("")
	);
}

export function TokensViewer() {
	const theme = useTheme();
	const [computedValues, setComputedValues] = useState<Record<string, string>>({});

	useEffect(() => {
		const timer = requestAnimationFrame(() => {
			const values: Record<string, string> = {};
			for (const group of TOKEN_GROUPS) {
				for (const token of group.tokens) {
					values[token.variable] = getComputedColor(token.variable);
				}
			}
			setComputedValues(values);
		});
		return () => cancelAnimationFrame(timer);
	}, [theme]);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<h2 className="text-xs font-semibold uppercase tracking-wider">Live Token Values</h2>
				<span className="rounded-full bg-primary-default/10 px-2 py-0.5 text-3xs text-primary-default">{theme}</span>
			</div>

			{TOKEN_GROUPS.map((group) => (
				<section key={group.label}>
					<h3 className="mb-2 text-2xs font-medium uppercase tracking-wider text-text-400">{group.label}</h3>
					<div className="grid gap-1">
						{group.tokens.map((token) => {
							const raw = computedValues[token.variable] || "";
							const hex = raw ? resolveToHex(raw) : "";
							const pairedRaw = token.pairedFg ? computedValues[token.pairedFg] || "" : "";
							const pairedHex = pairedRaw ? resolveToHex(pairedRaw) : "";

							let contrast: { ratio: number; label: string; className: string } | null = null;
							if (hex && pairedHex) {
								const ratio = contrastRatio(luminance(hex), luminance(pairedHex));
								const info = contrastLabel(ratio);
								contrast = { ratio, ...info };
							}

							return (
								<div
									key={token.name}
									className="flex items-center gap-3 rounded-xs border border-border-100 bg-surface-execution px-3 py-1.5"
								>
									<div
										className="size-6 shrink-0 rounded-xs border border-border-200"
										style={{ backgroundColor: raw || "transparent" }}
									/>
									<span className="w-48 font-mono text-2xs text-text-950">{token.variable}</span>
									<span className="w-28 font-mono text-3xs text-text-400">{raw || "—"}</span>
									<span className="w-20 font-mono text-3xs text-text-400">{hex || "—"}</span>
									{contrast && (
										<span className="flex items-center gap-1.5 text-3xs">
											<span className={contrast.className}>{contrast.label}</span>
											<span className="text-text-400">{contrast.ratio.toFixed(1)}:1</span>
										</span>
									)}
								</div>
							);
						})}
					</div>
				</section>
			))}
		</div>
	);
}
