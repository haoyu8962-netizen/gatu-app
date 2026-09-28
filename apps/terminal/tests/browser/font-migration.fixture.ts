import { cn } from "@/lib/cn";
import { FONT_MIGRATION_PAIRS } from "./font-migration-pairs";
import "./mobile-orderbook-cls.css";

interface Difference {
	file: string;
	context: string;
	merged: boolean;
	old: string;
	next: string;
	properties: string[];
}

const CONTEXTS: ReadonlyArray<readonly [string, string, string]> = [
	["odd-inherited", "", "font-size:23px;line-height:31px"],
	["text-base leading-none parent", "text-base leading-none", ""],
	["text-xs parent", "text-xs", ""],
	["font-market-close text-sm parent", "font-market-close text-sm", ""],
];
const SAMPLE = "Ag 1,234.56 永续 BTC-USDC";

function snapshot(element: Element): Record<string, string> {
	const style = getComputedStyle(element);
	const values: Record<string, string> = {};
	for (const property of Array.from(style)) values[property] = style.getPropertyValue(property);
	const rect = element.getBoundingClientRect();
	values["@rect"] = `${rect.width.toFixed(3)}x${rect.height.toFixed(3)}`;
	return values;
}

function mount(parent: HTMLElement, className: string): HTMLElement {
	const element = document.createElement("div");
	element.className = className;
	element.textContent = SAMPLE;
	parent.append(element);
	return element;
}

const NEGATIVE_CONTROLS: ReadonlyArray<readonly [string, string, string]> = [
	["text-[13px] leading-5 font-semibold", "text-xs leading-5 font-semibold", "control: wrong size"],
	["text-[13px] font-semibold", "text-2sm font-semibold", "control: no explicit leading"],
	["text-[13px] leading-5 font-semibold", "text-2sm leading-5 font-semibold", "control: equivalent"],
];

function run(pairs: ReadonlyArray<readonly [string, string, string]> = FONT_MIGRATION_PAIRS) {
	const root = document.getElementById("root");
	if (!root) throw new Error("missing root");
	root.replaceChildren();
	const differences: Difference[] = [];
	let comparisons = 0;
	let sizeRuleMissing = 0;

	for (const [contextName, parentClass, parentStyle] of CONTEXTS) {
		for (const merged of [false, true]) {
			for (const [oldLiteral, nextLiteral, file] of pairs) {
				const parent = document.createElement("div");
				parent.className = parentClass;
				parent.style.cssText = `${parentStyle};width:320px`;
				root.append(parent);
				const before = mount(parent, merged ? cn(oldLiteral) : oldLiteral);
				const after = mount(parent, merged ? cn(nextLiteral) : nextLiteral);
				const a = snapshot(before);
				const b = snapshot(after);
				comparisons++;
				if (contextName === "odd-inherited" && /(^|\s)!?text-\[\d+px\]/.test(oldLiteral)) {
					if (a["font-size"] === "23px" || b["font-size"] === "23px") sizeRuleMissing++;
				}
				const properties = Object.keys(a).filter((property) => a[property] !== b[property]);
				if (properties.length > 0) {
					differences.push({ file, context: contextName, merged, old: oldLiteral, next: nextLiteral, properties });
				}
				parent.remove();
			}
		}
	}

	return {
		viewport: window.innerWidth,
		theme: document.documentElement.className,
		pairs: pairs.length,
		comparisons,
		computedPropertiesPerElement: Array.from(getComputedStyle(document.body)).length,
		sizeRuleMissing,
		differences,
	};
}

Object.assign(window, { runFontMigrationCheck: run, runFontMigrationControls: () => run(NEGATIVE_CONTROLS) });
