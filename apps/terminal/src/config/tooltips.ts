import { t } from "@lingui/core/macro";

export interface DefinitionItem {
	key: string;
	term: string;
	definition: string;
}

export interface DefinitionTooltipContent {
	title: string;
	items: DefinitionItem[];
}

type TooltipBuilder = () => DefinitionTooltipContent;

const TOOLTIPS = {
	tif: (): DefinitionTooltipContent => ({
		title: t`Time In Force`,
		items: [
			{
				key: "Gtc",
				term: t`GTC (Good Til Cancel)`,
				definition: t`Order will rest until filled or canceled.`,
			},
			{
				key: "Ioc",
				term: t`IOC (Immediate Or Cancel)`,
				definition: t`Any portion that is not immediately filled will be canceled.`,
			},
			{
				key: "Alo",
				term: t`ALO (Add Liquidity Only)`,
				definition: t`Order will exist only as a limit order on the book. Also known as post-only.`,
			},
		],
	}),
} as const satisfies Record<string, TooltipBuilder>;

export type TooltipId = keyof typeof TOOLTIPS;

export function getTooltip(id: TooltipId, options?: { only?: readonly string[] }): DefinitionTooltipContent {
	const content = TOOLTIPS[id]();
	if (!options?.only) return content;
	const allow = new Set(options.only);
	return { ...content, items: content.items.filter((item) => allow.has(item.key)) };
}
