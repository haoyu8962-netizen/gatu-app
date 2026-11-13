import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface SpinnerSites {
	// `animate-spin` (or an arbitrary `animate-[spin…]`) in the file's text.
	spin?: number;
	// References to a Phosphor spinner glyph (`SpinnerGapIcon`, `CircleNotchIcon`, …), JSX or value.
	glyph?: number;
	// References to a shared spinner component listed in SPINNER_WRAPPERS.
	wrapper?: number;
}

interface SpinnerReview extends SpinnerSites {
	reason: string;
}

// Spinning indicators that stay, with the reason and the number of spinner sites of each kind in the
// file. The status of a requested action uses the Sairn motion components instead (docs/brand-assets.md,
// status motion; ADR 0029 decision 6); a new spinner, whether a class, a glyph or a shared spinner
// component, needs a reason here.
const ALLOWED_SPINNERS: Record<string, SpinnerReview> = {
	"components/api-wallet/api-wallet-action-modal.tsx": {
		spin: 1,
		glyph: 1,
		reason: "passive fresh-data preflight before signing",
	},
	"components/api-wallet/api-wallet-list.tsx": { spin: 1, glyph: 1, reason: "passive list refresh" },
	"components/funding-history/funding-history-page.tsx": { spin: 1, reason: "refresh button while refetching" },
	"components/historical-orders/historical-orders-page.tsx": { spin: 1, reason: "refresh button while refetching" },
	"components/leaderboard/leaderboard-view.tsx": { spin: 1, reason: "refresh button while refetching" },
	"components/trade-history/trade-history-page.tsx": { spin: 1, reason: "refresh button while refetching" },
	"components/trade/chart/tradingview-chart.tsx": {
		spin: 2,
		glyph: 2,
		reason: "chart rebuild and rate-limit recovery (first load uses BrandPageLoader)",
	},
	"components/trade/components/deposit-modal-loading-fallback.tsx": {
		spin: 1,
		glyph: 1,
		reason: "lazy dialog chunk fallback",
	},
	"components/trade/components/global-modals.tsx": { spin: 1, glyph: 1, reason: "lazy dialog chunk fallback" },
	"components/trade/footer/footer-bar.tsx": { spin: 1, glyph: 1, reason: "passive connection status" },
	"components/trade/header/user-menu-modal-boundary.tsx": { spin: 1, glyph: 1, reason: "lazy dialog chunk fallback" },
	"components/trade/header/user-menu.tsx": {
		spin: 1,
		glyph: 1,
		reason: "authentication initialising; a 16px indicator would widen the measured header (runtime guardrails §11)",
	},
	"components/trade/mobile/mobile-book-view.tsx": { spin: 1, reason: "passive order book reconnect" },
	"components/trade/mobile/mobile-nav-drawer.tsx": { spin: 2, glyph: 2, reason: "lazy route chunk fallbacks" },
	"components/trade/mobile/mobile-positions-view.tsx": {
		wrapper: 1,
		reason: "passive position count loading in an account tab",
	},
	"components/trade/positions/position-limit-close-modal.tsx": {
		spin: 1,
		glyph: 1,
		reason: "passive position snapshot loading",
	},
	"components/trade/positions/position-market-close-modal.tsx": {
		spin: 1,
		glyph: 1,
		reason: "passive position snapshot loading",
	},
	"components/trade/positions/positions-panel.tsx": { wrapper: 1, reason: "lazy account tab chunk fallback" },
	"components/trade/tradebox/bridge/asset-selection-screen.tsx": {
		spin: 1,
		glyph: 1,
		reason: "passive route list loading",
	},
	"components/trade/tradebox/bridge/confirmation-screen.tsx": { spin: 1, glyph: 1, reason: "passive quote refresh" },
	"components/trade/tradebox/trade-control-button-view.tsx": {
		glyph: 1,
		reason:
			"draws the glyph while `loading`; the caller supplies the spin through `spinnerClassName` (trade-header.tsx)",
	},
	"components/trade/tradebox/trade-header.tsx": {
		spin: 1,
		reason: "account mode control while its value loads or updates",
	},
	"components/ui/lazy-dialog-boundary.tsx": { spin: 1, glyph: 1, reason: "lazy dialog chunk fallback" },
	"components/ui/spinner.tsx": {
		spin: 1,
		glyph: 1,
		reason: "the shared passive spinner; every file that uses it is registered with its own reason",
	},
	"components/vaults/vaults-list.tsx": { spin: 1, reason: "refresh button while refetching" },
};

// Shared spinner components and the exports that render a spinner. Every reference to one of these
// exports counts as a spinner site of the importing file.
const SPINNER_WRAPPERS: Record<string, string[]> = {
	"components/ui/spinner.tsx": ["Spinner"],
};

const SPINNER_GLYPH = /^(?:Spinner\w*|CircleNotch\w*)$/;
const SPIN_CLASS = /animate-(?:spin\b|\[spin)/g;

// Passive refresh spinners that were removed, with the reason: their files must stay without one. The
// equality check above already rejects a new spinner; this list keeps why these may not come back.
const RETIRED_PASSIVE_SPINNERS: Record<string, string> = {
	"components/referrals/referral-dashboard.tsx":
		'"Refreshing referral data…" was a passive data notice (docs/mobile-data-presentation.md, 2026-11-01)',
	"components/staking/staking-view.tsx":
		'"Refreshing staking data…" was a passive data notice (docs/mobile-data-presentation.md, 2026-11-01)',
};

// Surfaces that report a requested action's status and must keep using the motion components.
const MOTION_SURFACES: Record<string, string> = {
	"components/trade/tradebox/order-toast.tsx": "<StatusGlyph",
	"components/ui/sonner.tsx": "<StatusGlyph",
	"components/funds-action/funds-action-recovery-host.tsx": "<StatusGlyph",
	"components/trade/tradebox/deposit/shared-ui.tsx": "<BrandMotion",
	"components/vaults/vault-action-modal.tsx": "<BrandMotion",
	"components/api-wallet/api-wallet-action-modal.tsx": "<BrandMotion",
	"components/trade/tradebox/bridge/executing-screen.tsx": "<BrandMotion",
	"components/trade/components/trading-action-button.tsx": "<ButtonLoading",
	"components/trade/tradebox/trade-panel.tsx": "<ButtonLoading",
	"components/trade/mobile/mobile-trade-view.tsx": "<ButtonLoading",
	"components/trade/components/establish-connection-modal.tsx": "<ButtonLoading",
	"components/trade/components/wallet-modal.tsx": "<ButtonLoading",
	"components/trade/components/mobile-agent-sync-modal.tsx": "<ButtonLoading",
	"components/trade/components/mobile-agent-qr-scanner.tsx": "<ButtonLoading",
	"routes/mobile-agent-sync.tsx": "<ButtonLoading",
	"components/referrals/referral-code-card.tsx": "BRAND_MOTION_COPY_FEEDBACK",
	"components/trade/tradebox/deposit/funding-address-card.tsx": "BRAND_MOTION_COPY_FEEDBACK",
};

function listSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" || entry.name === "__tests__" ? [] : listSources(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

function resolveModule(fromFile: string, specifier: string): string | null {
	let base: string;
	if (specifier.startsWith("@/")) base = resolve(SOURCE_ROOT, specifier.slice(2));
	else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
	else return null;
	for (const candidate of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return relative(SOURCE_ROOT, candidate);
	}
	return null;
}

function isPhosphorModule(specifier: string): boolean {
	return specifier === "@phosphor-icons/react" || specifier.startsWith("@phosphor-icons/react/");
}

function isBindingDeclaration(node: ts.Identifier): boolean {
	const parent = node.parent;
	return (
		ts.isImportSpecifier(parent) ||
		ts.isImportClause(parent) ||
		ts.isNamespaceImport(parent) ||
		(ts.isJsxClosingElement(parent) && parent.tagName === node)
	);
}

function countSpinnerSites(fileName: string, source: string): SpinnerSites {
	const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const glyphNames = new Set<string>();
	const wrapperNames = new Set<string>();
	const wrapperNamespaces = new Map<string, Set<string>>();
	const glyphNamespaces = new Set<string>();

	function classify(specifier: string): { wrapperExports: string[] | null; phosphor: boolean } {
		const target = resolveModule(resolve(SOURCE_ROOT, fileName), specifier);
		return {
			wrapperExports: target ? (SPINNER_WRAPPERS[target] ?? null) : null,
			phosphor: isPhosphorModule(specifier),
		};
	}

	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			const { wrapperExports, phosphor } = classify(statement.moduleSpecifier.text);
			const clause = statement.importClause;
			if (!clause || clause.isTypeOnly || (!wrapperExports && !phosphor)) continue;
			if (clause.name) throw new Error(`${fileName}: default import of a spinner module is not reviewed`);
			const bindings = clause.namedBindings;
			if (bindings && ts.isNamespaceImport(bindings)) {
				if (wrapperExports) wrapperNamespaces.set(bindings.name.text, new Set(wrapperExports));
				else glyphNamespaces.add(bindings.name.text);
				continue;
			}
			for (const element of bindings?.elements ?? []) {
				if (element.isTypeOnly) continue;
				const imported = (element.propertyName ?? element.name).text;
				if (wrapperExports?.includes(imported)) wrapperNames.add(element.name.text);
				if (phosphor && SPINNER_GLYPH.test(imported)) glyphNames.add(element.name.text);
			}
			continue;
		}
		if (
			ts.isExportDeclaration(statement) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			!statement.isTypeOnly
		) {
			const { wrapperExports, phosphor } = classify(statement.moduleSpecifier.text);
			if (wrapperExports || phosphor) {
				throw new Error(`${fileName}: re-exporting a spinner module hides its users from this contract`);
			}
		}
	}

	const sites: Required<SpinnerSites> = { spin: source.match(SPIN_CLASS)?.length ?? 0, glyph: 0, wrapper: 0 };

	function visit(node: ts.Node) {
		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === "require"))
		) {
			const [argument] = node.arguments;
			if (argument && ts.isStringLiteralLike(argument)) {
				const { wrapperExports, phosphor } = classify(argument.text);
				if (wrapperExports || phosphor) {
					throw new Error(`${fileName}: a run-time load of a spinner module is not reviewed`);
				}
			}
		}
		if (ts.isIdentifier(node) && !isBindingDeclaration(node)) {
			const parent = node.parent;
			const isMemberName = ts.isPropertyAccessExpression(parent) && parent.name === node;
			if (!isMemberName && glyphNames.has(node.text)) sites.glyph += 1;
			if (!isMemberName && wrapperNames.has(node.text)) sites.wrapper += 1;
			if (isMemberName && ts.isIdentifier(parent.expression)) {
				const namespace = parent.expression.text;
				if (wrapperNamespaces.get(namespace)?.has(node.text)) sites.wrapper += 1;
				if (glyphNamespaces.has(namespace) && SPINNER_GLYPH.test(node.text)) sites.glyph += 1;
			}
			if (
				(wrapperNamespaces.has(node.text) || glyphNamespaces.has(node.text)) &&
				!(ts.isPropertyAccessExpression(parent) && parent.expression === node)
			) {
				throw new Error(`${fileName}: a spinner module namespace is read without a member name`);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);

	return Object.fromEntries(Object.entries(sites).filter(([, count]) => count > 0));
}

function collectSpinnerSites(): Record<string, SpinnerSites> {
	const actual: Record<string, SpinnerSites> = {};
	for (const file of listSources(SOURCE_ROOT)) {
		const name = relative(SOURCE_ROOT, file);
		const sites = countSpinnerSites(name, readFileSync(file, "utf8"));
		if (Object.keys(sites).length > 0) actual[name] = sites;
	}
	return actual;
}

describe("status motion surfaces", () => {
	it("keeps every remaining spinner on the reviewed list with its count", () => {
		const expected = Object.fromEntries(
			Object.entries(ALLOWED_SPINNERS).map(([file, { reason: _, ...sites }]) => [file, sites]),
		);
		expect(collectSpinnerSites()).toEqual(expected);
	});

	it("keeps retired passive refresh spinners out of their pages", () => {
		for (const [file, reason] of Object.entries(RETIRED_PASSIVE_SPINNERS)) {
			const source = readFileSync(resolve(SOURCE_ROOT, file), "utf8");
			expect(countSpinnerSites(file, source), `${file}: ${reason}`).toEqual({});
		}
	});

	it("reports requested actions with the Sairn motion components", () => {
		for (const [file, marker] of Object.entries(MOTION_SURFACES)) {
			const source = readFileSync(resolve(SOURCE_ROOT, file), "utf8");
			expect(source, file).toContain(marker);
			expect(source, file).not.toContain("animate-ping");
		}
	});
});

describe("spinner site counter", () => {
	const FILE = "components/example/example.tsx";

	it.each([
		["a spin class", '<i className="size-4 animate-spin" />', { spin: 1 }],
		["an arbitrary spin animation", '<i className="animate-[spin_2s_linear_infinite]" />', { spin: 1 }],
		[
			"the shared spinner",
			'import { Spinner } from "@/components/ui/spinner";\nexport const A = () => <Spinner />;',
			{ wrapper: 1 },
		],
		[
			"the shared spinner under an alias",
			'import { Spinner as Busy } from "@/components/ui/spinner";\nexport const A = () => <Busy></Busy>;',
			{ wrapper: 1 },
		],
		[
			"the shared spinner through a relative path",
			'import { Spinner } from "../ui/spinner";\nexport const A = () => <Spinner />;',
			{ wrapper: 1 },
		],
		[
			"the shared spinner passed as a value",
			'import { Spinner } from "@/components/ui/spinner";\nexport const icon = Spinner;',
			{ wrapper: 1 },
		],
		[
			"the shared spinner through a namespace",
			'import * as S from "@/components/ui/spinner";\nexport const A = () => <S.Spinner />;',
			{ wrapper: 1 },
		],
		[
			"a Phosphor spinner glyph with a computed class",
			'import { SpinnerGapIcon } from "@phosphor-icons/react";\nexport const A = ({ c }) => <SpinnerGapIcon className={c} />;',
			{ glyph: 1 },
		],
		[
			"another Phosphor spinner glyph",
			'import { CircleNotchIcon as Wait } from "@phosphor-icons/react";\nexport const A = () => <Wait />;',
			{ glyph: 1 },
		],
	])("counts %s", (_label, source, expected) => {
		expect(countSpinnerSites(FILE, source)).toEqual(expected);
	});

	it("ignores a type-only import and unrelated icons", () => {
		expect(
			countSpinnerSites(
				FILE,
				'import type { Spinner } from "@/components/ui/spinner";\nimport { CheckIcon } from "@phosphor-icons/react";\nexport const A = () => <CheckIcon />;',
			),
		).toEqual({});
	});

	it.each([
		["a re-export", 'export { Spinner } from "@/components/ui/spinner";'],
		["a run-time load", 'export const load = () => import("@/components/ui/spinner");'],
		["a default import", 'import Spinner from "@/components/ui/spinner";'],
		["a namespace read without a member", 'import * as S from "@/components/ui/spinner";\nexport const all = S;'],
	])("rejects %s", (_label, source) => {
		expect(() => countSpinnerSites(FILE, source)).toThrow();
	});
});
