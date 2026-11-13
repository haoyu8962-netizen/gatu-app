import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import {
	collectChunkGraphStaticClosure,
	collectRuntimeStartupFiles,
	findPublicClientChunkGraphArtifacts,
	findUniqueJavaScriptChunk,
	readClientChunkGraphFile,
	resolveClientChunkGraphCacheFile,
	validateClientChunkGraphAgainstAssets,
} from "./client-chunk-graph.mjs";

export const TRADE_DESKTOP_RUNTIME_MODULE_IDS = [
	"apps/terminal/src/components/trade/chart/chart-panel.tsx",
	"apps/terminal/src/components/trade/orderbook/orderbook-panel.tsx",
	"apps/terminal/src/components/trade/tradebox/trade-panel.tsx",
	"apps/terminal/src/components/trade/tradebox/account-panel.tsx",
	"apps/terminal/src/components/trade/positions/positions-panel.tsx",
	"apps/terminal/src/components/trade/chart/tradingview-chart.tsx",
	"apps/terminal/src/components/trade/footer/footer-bar.tsx",
	"apps/terminal/src/components/trade/positions/positions-tab.tsx",
	"apps/terminal/src/components/trade/positions/funding-tab.tsx",
	"apps/terminal/src/components/trade/positions/history-tab.tsx",
	"apps/terminal/src/components/trade/positions/orders-history-tab.tsx",
];

const budgets = {
	largestChunkRawBytes: 4_050_000,
	largestChunkGzipBytes: 1_200_000,
	// Re-baselined 2026-09-29 for ADR 0024 (translated action errors): +17,895 gzip bytes over the CI build of
	// dev on 2026-09-28 (3,157,661), 12.0 kB of it in the five non-English catalogs, of which a viewer loads
	// one (Node 22.15.0, NODE_ENV=production, pairing off, as in CI).
	// Raised 2026-10-01 by +3,821 for the Sairn logo kit (docs/brand-assets.md): filled-path lockup and mark
	// geometry replace the rectangle GATU logo in the shared header chunk (+2.7 kB in the trade startup closure),
	// plus the page-loading chart loader and the brand.json domain groups. Measured as the local Node 22.15.0
	// build (3,185,839) minus the dev CI build at 99ddc6b4 (3,182,018); the +6,462 dev had already used stays counted.
	// Raised 2026-10-01 by +6,544 for the Sairn status motion (ADR 0029): generated glyph, button-indicator and
	// illustration data (about 2.3 kB), their keyframes in the stylesheet (0.8 kB) and the three components, split
	// so the illustrations load only with their dialogs (desktop runtime startup +769, mobile +151). Measured as the
	// local Node 22.15.0 build (3,193,087) minus the local build of f440fa1b before the change (3,186,543).
	// Raised 2026-10-02 by +83,687 for the Privy React Auth 3.46.0 upgrade (docs/terminal-performance-baseline.md):
	// fixed-metadata Node 22.15.0 builds, pairing off, 3,275,424 after minus 3,191,737 for 682430ba before (both
	// sides read a developer .env.local; CI-equivalent builds read 3,274,893 minus 3,190,861 = +84,032).
	// Raised 2026-10-02 by +11,563 for card funding (ADR 0034): the deposit dialog chunk with the method chooser,
	// the purchase launch and the identity-checked notice card (+4,800), the six catalogs (+2,409), the lazy host
	// (1,705), the funding exports kept in Privy's main chunk (+1,522), the store chunk (750 against the 491-byte
	// chunk it replaces), the router and icon vendor chunks (+870) and renamed imports. CI-equivalent builds of
	// the commits (no .env.local): 3,286,456 for e257426d minus 3,274,893 for the upgrade commit c0e550c7. This
	// replaces the +15,152 measured for 566713d3, when the host imported only useFiatOnramp and Rollup split
	// Privy's funding module into a chunk of its own that 104 other chunks then had to import
	// (docs/terminal-performance-baseline.md).
	// Raised 2026-10-03 by +4,671 for the locale and number-format refresh (footer clock, vault labels, ADR 0036):
	// components take their formatters from useNumberFormat() and read the locale before formatting, which adds
	// React Compiler cache-guard dependencies (trade startup +2,410, desktop runtime startup +829, mobile +142).
	// Measured as the local Node 22.15.0 build of 2d6f4676 (3,195,752) minus the local build of dev 682430ba
	// (3,191,081), both with the fixed metadata of docs/terminal-performance-baseline.md; the +5,160 dev had already
	// used stays counted. With CI metadata the same head measured 3,196,075, 154 bytes over the previous allowance.
	// Raised 2026-10-03 by +417 for the date and list locale contract (docs/i18n-presentation.md): 38 date calls in
	// 18 components and one hook (histories, funding, TWAP, transfers, orders, the PnL card and Earn) pass the active
	// locale, which adds it to their React Compiler cache guards (trade startup +203, desktop runtime startup +114,
	// mobile +11). Measured as the local Node 22.15.0 build of c110dc80 (3,196,169) minus that of 2d6f4676
	// (3,195,752), both with the fixed metadata of docs/terminal-performance-baseline.md; the date branch's own build
	// against 04469b52 had measured +475.
	// Raised 2026-10-03 by +1,392 for ADR 0037 (exact decimal strings through formatDecimalString): the helper in
	// lib/format.ts and the number-format hook in about thirty components (staking +201, vaults +309, trade startup
	// +440, desktop runtime startup +91). Measured as the local Node 22.15.0 build of 1cb73bcf (3,197,561) minus that
	// of c110dc80 (3,196,169), both with the fixed metadata of docs/terminal-performance-baseline.md; the ADR 0037
	// branch's own build against 04469b52 had measured +1,216.
	// Merged with dev a0c05740 on 2026-10-03: the three raises above were measured before dev's Privy upgrade and card
	// funding and are added to its 3,281,171. The fixed-metadata build of the merge 0944584d measured 3,293,592 (+5,941).
	// Re-baselined 2026-10-08 before release p26 to the fixed-metadata Node 22.15.0 build of dev 54235298 (3,296,759,
	// no .env.local, pairing off; docs/terminal-performance-baseline.md). It folds in the +6,684 the shipped p24b main
	// 6da4c15a already used (3,294,335) and the +2,570 of PR #77 (chart price precision, silent email wallet; dev
	// 345a2143 measured 3,296,905); PR #81 (the TradingView loader patch and its tests) changed no client asset
	// (3,296,759, -146 of build noise). The pairing-on build that only pull requests into main run measures about
	// 2,200 more (CI read 3,298,948 for the same head) and had exceeded the previous allowance by 1,297.
	// Raised 2026-10-05 by +340 for the funds dialog rework (docs/terminal-performance-baseline.md): the shell the
	// Deposit / Withdraw / Bridge dialog shares with its chunk fallback (+1,365 as a chunk of its own), the CCTP
	// minimum and its typed error (+195 in the shared deposit chunk, +508 beside the deposit tracker), the notice in
	// the six catalogs (+328) and the sticky form headings, against the removed six-block skeleton fallback (-1,187)
	// and the skeleton chunk merged into the account panel chunk (-329 net). Measured as the fixed-metadata Node 22.15.0
	// build of f9bae822 (3,297,328) minus that of dev 345a2143 (3,296,988); the +9,337 dev had already used stays
	// counted. Merged with dev 508ff73d on 2026-10-08: the +340 is added to its re-baselined 3,296,759.
	// Re-baselined 2026-10-11 before release p30 to the fixed-metadata Node 22.15.0 build of dev ee4aab99 with the
	// extra-agent snapshot guard moved out of api-wallet-state (3,304,479, no .env.local, pairing off;
	// docs/terminal-performance-baseline.md). It folds in the +7,380 that dev had used since p26 across PR #91 (unnamed
	// default Agent), #92 (single-shell deposit dialog, official scrims), #94 (Link mobile device fixes, ADR 0039) and
	// #97 (automatic email deposits, ADR 0040; unknown-submission diagnostics). The pairing-on build that only pull
	// requests into main run had read 3,307,744 in CI (+10,645) and also split api-wallet-state into a second
	// api-wallet-*.js chunk shared with the pairing dialog; both are fixed by this baseline and by that move.
	// Re-baselined 2026-10-13 before release p32 to the fixed-identity Node 22.15.0 build of dev f50e21a8 with
	// VITE_MOBILE_PAIRING_ENABLED=false (3,311,757, no .env.local; docs/terminal-performance-baseline.md). It folds in
	// the +7,278 that dev had used since p30 across PR #101 (version entry), #102 (slider basis), #107 (ADR 0041
	// automatic unified account), #108 and #109 (production audit fixes), each merged under the pairing-off allowance;
	// the pairing-on promotion build of #112 had read 3,314,639 (+10,160) and sits +2,502 over this baseline locally.
	// Raised 2026-10-28 by +38,736 for the Japanese interface language: the lazy ja catalog chunk is 38,653 of it and
	// a viewer loads only the catalog of the active language (trade startup +190 for the language table and the
	// bootstrap error copy, mobile and desktop runtime startup +4 each). Measured as the fixed-identity Node 22.15.0
	// build with VITE_MOBILE_PAIRING_ENABLED=false of the Japanese branch (3,350,633) minus that of dev f7423d70
	// (3,311,897), both without .env.local; the +140 dev had already used stays counted.
	// Raised 2026-10-31 by +15,708 for the P1 and P2 fixes of the 2026-10-30 feature audit, merged into dev as one
	// integration pull request with PR #123-#128: their new and changed messages in the six lazy catalogs (+4,246, a
	// viewer loads one) and in the English catalog, the order expiry clock (ADR 0045), partial-cancel and status
	// feedback, history labels and exports, and the funds and order checks (trade startup +6,577, desktop runtime
	// startup +91, mobile +68). Measured as the fixed-identity Node 22.15.0 build with VITE_MOBILE_PAIRING_ENABLED=false
	// of the integration a5aa0d7f (3,366,564) minus that of dev d99c2bc9 (3,350,856), both without .env.local; the +363
	// dev had already used stays counted (docs/terminal-performance-baseline.md).
	// Re-baselined 2026-11-02 before release p37 to the fixed-identity Node 22.15.0 build of dev ce18a5a5 with
	// VITE_MOBILE_PAIRING_ENABLED=false (3,372,998, no .env.local; docs/terminal-performance-baseline.md). It folds in
	// the +6,797 that dev had used since the raise above, almost all of it the second batch of confirmed audit fixes
	// (PR #132), merged under the pairing-off allowance. The client code is that of release p36: release builds of it
	// (pairing on, production .env.local), with settings that differ only in their build identity, read 3,375,833 to
	// 3,376,302, and the p37 build exceeded the previous allowance by 101.
	// Raised 2026-11-12 by +4,745 for the first wave of fixes from the global defect review, merged as one integration
	// branch: the action start deadline and its click deadlines (ADR 0053), cancel outcomes and per-record tab
	// ownership (ADR 0019 addendum), heartbeat-only liveness and the fast-price decoder (ADR 0050 addendum). Measured
	// as the fixed-identity Node 22.15.0 build with VITE_MOBILE_PAIRING_ENABLED=false of the integration (3,381,009)
	// minus that of dev 810a45db (3,376,264), both without .env.local; the +3,266 dev had already used stays counted.
	// Without the raise the pairing-off build keeps 1,989 bytes and a release build, which reads about 3,000 more,
	// would exceed the allowance (docs/terminal-performance-baseline.md).
	// Raised 2026-11-12 by +3,527 for the second wave of fixes from the same review: the signer check after an owner
	// signature, the entry watchdog and bounded catalog wait, cross-window settings, the transport status and the
	// nonce and Agent record handling. Fixed-identity pairing-off builds: 3,384,536 minus the first wave's 3,381,009
	// (docs/terminal-performance-baseline.md).
	totalGzipBaselineBytes: 3_381_270,
	totalGzipAllowedIncreaseBytes: 10_000,
	tradeStartup: {
		requiredRouteIds: ["__root__", "/trade/$symbol"],
		optionalRouteIds: ["/trade"],
		staticClosureChunkPrefixes: ["client-root", "trade-terminal-page", "early-prefetch", "preload-trade-terminal-surface"],
		// Re-baselined 2026-09-16 after ADR 0009 moved the startup placeholders onto shared views (+10,995 gzip bytes over surfaces 1-6).
		// Raised 2026-10-02 by +62,713 for the Privy React Auth 3.46.0 upgrade: its core SDK now imports libphonenumber-js
		// statically and its bundled viem grew (1,624,427 after minus 1,561,714 before; docs/terminal-performance-baseline.md).
		// Raised 2026-11-05 by +196 for the mobile order summary (PR #151), after the p40 release precheck left it 195 bytes
		// under its allowance: the fixed-identity Node 22.15.0 build with VITE_MOBILE_PAIRING_ENABLED=false of dev 8ca35543
		// (1,652,171) minus that of 2230c64e (1,651,975), both without .env.local; pairing on measures +200
		// (docs/terminal-performance-baseline.md).
		// Raised 2026-11-12 by +355 for the WebSocket recovery when the page or the network returns (ADR 0050): the
		// fixed-identity Node 22.15.0 build with VITE_MOBILE_PAIRING_ENABLED=false of that change (1,652,526) minus that
		// of dev 19db63d1 (1,652,171), both without .env.local; pairing on was not measured. The growth is the transport
		// monitor, store and order-book pool code in the shared chunk, and without the raise the release configuration
		// would be left with about 36 bytes (docs/terminal-performance-baseline.md).
		// Raised 2026-11-12 by +3,987 for the first wave of fixes from the global defect review (see the total above):
		// the same pair of builds reads 1,656,513 for the integration and 1,652,526 for dev 810a45db. The growth is code
		// that every session runs: the request scheduler's deadline, the wallet guard and the fast-price decoder in the
		// shared chunk (+2,059), the reconciliation hosts mounted at the root (+1,066), the pending order and TWAP stores
		// (+850) and the English catalog (+471). Before the raise the integration build exceeded the allowance by 2,033
		// (docs/terminal-performance-baseline.md).
		// Raised 2026-11-12 by +2,905 for the second wave (see the total above): 1,659,418 minus 1,656,513. Before
		// the raise the build exceeded the allowance by 951.
		baselineGzipBytes: 1_651_372,
		allowedIncreaseBytes: 10_000,
	},
	tradeRuntimeStartup: {
		entryRouteId: "__root__",
		commonModuleIds: [
			"apps/terminal/src/lib/hyperliquid/markets/market-catalog-info-client.ts",
			"apps/terminal/src/components/funds-action/funds-action-recovery-host.tsx",
			"apps/terminal/src/components/ui/sonner.tsx",
			"apps/terminal/src/components/trade/components/global-modals.tsx",
			"apps/terminal/src/components/trade/chart/token-selector-popup.tsx",
		],
		profiles: [
			{ name: "mobile", moduleIds: [], baselineGzipBytes: 110_580, allowedIncreaseBytes: 10_000 },
			{
				name: "desktop",
				moduleIds: TRADE_DESKTOP_RUNTIME_MODULE_IDS,
				// Raised 2026-10-03 by +205: the date and list locale contract passes the locale in the positions panels
				// and their history tabs (+114), and ADR 0037 adds formatDecimalString and the number-format hook to the
				// order form, order book and funds recovery host (+91). Measured with the fixed metadata of
				// docs/terminal-performance-baseline.md as the local Node 22.15.0 builds of 2d6f4676 (201,842), c110dc80
				// (201,956) and 1cb73bcf (202,047). After merging dev a0c05740, the fixed-metadata build of 0944584d measured
				// 202,173, 20 bytes under this allowance, and the CI-metadata build 202,193, exactly at it.
				// Re-baselined 2026-10-03 to dev's 191,988 plus PR #71's measured desktop increment (+1,141, so +936 over
				// the +205 above): CI read 202,249 for fc5e10cd, 56 bytes over the previous allowance. Fixed-metadata Node
				// 22.15.0 builds in clean worktrees read 201,032 for dev a0c05740 and 202,173 for fc5e10cd
				// (docs/terminal-performance-baseline.md, locale and number-format re-baseline).
				// Re-baselined 2026-10-13 before release p32 to the same fixed-identity pairing-off build of dev f50e21a8
				// (202,683): +9,554 accumulated since 2026-10-03 across the card-funding host, ADR 0038-0041 and the
				// production audit fixes, each under the allowance; CI had read 202,646 (pairing off) and 202,589 (on).
				baselineGzipBytes: 202_683,
				allowedIncreaseBytes: 10_000,
			},
		],
	},
	surfaces: [
		// Raised 2026-11-05 by +96 for the mobile order summary (PR #151), after the p40 release precheck left it 123 bytes
		// under its allowance. Measured as the fixed-identity Node 22.15.0 build with VITE_MOBILE_PAIRING_ENABLED=false
		// of dev 8ca35543 (127,808) minus that of 2230c64e (127,712), both without .env.local; pairing on measures +92
		// (docs/terminal-performance-baseline.md). The raises before it were +66 on 2026-11-03 for the price-decimals fix
		// (PR #143) and +762 on 2026-11-01 for the second batch of audit fixes.
		{ name: "trade-terminal-page", baselineGzipBytes: 124_166, allowedIncreaseBytes: 4_000 },
		{ name: "token-selector-popup", baselineGzipBytes: 14_355, allowedIncreaseBytes: 1_500 },
		{ name: "api-wallet", baselineGzipBytes: 17_967, allowedIncreaseBytes: 2_000 },
		{ name: "fundingHistory._address", baselineGzipBytes: 6_820, allowedIncreaseBytes: 1_500 },
		{ name: "tradeHistory._address", baselineGzipBytes: 8_373, allowedIncreaseBytes: 1_500 },
		{ name: "historicalOrders._address", baselineGzipBytes: 8_163, allowedIncreaseBytes: 1_500 },
		{ name: "leaderboard", baselineGzipBytes: 12_083, allowedIncreaseBytes: 1_500 },
		{ name: "staking", baselineGzipBytes: 23_131, allowedIncreaseBytes: 2_500 },
		// Raised 2026-11-01 by +701 for the silent passive-data states of the Vault pages and the Vault dialog's data Retry
		// (second batch of audit fixes), measured with the same pair of builds: 30,550 minus 29,849
		// (docs/terminal-performance-baseline.md).
		// Raised 2026-11-12 by +104 for the vault dialog's click deadlines (ADR 0053 decision 10), measured with the pair
		// of builds named at the total: 30,638 minus 30,534. Without it the chunk would keep 138 bytes, under the 200 the
		// release precheck asks for.
		{ name: "vaults-page", baselineGzipBytes: 27_880, allowedIncreaseBytes: 3_000 },
		// Added 2026-09-27 with the Funding Comparison route (Node 22.15.0 build of the SDK feature batch).
		{ name: "fundingComparison", baselineGzipBytes: 11_133, allowedIncreaseBytes: 1_500 },
		{ name: "funding-history-panel", baselineGzipBytes: 8_661, allowedIncreaseBytes: 1_500 },
	],
};

export function collectTradeStartupFiles({
	graph,
	assetFiles,
	routePreloadFiles,
	runtimeEntryFiles,
	semanticEntryFiles,
}) {
	return collectChunkGraphStaticClosure({
		graph,
		assetFiles,
		entryFiles: [...routePreloadFiles, ...runtimeEntryFiles, ...semanticEntryFiles],
	});
}

const LOCAL_ENV_FILE_PATTERN = /^\.env(?:\.[^.]+)?\.local$/;

/**
 * Developer-only Vite env files next to the built application. Vite inlines their `VITE_*` values, so a build that
 * read one measures a few hundred bytes more than CI, which has none (docs/terminal-performance-baseline.md).
 */
export function findLocalEnvFiles(appDirectory) {
	try {
		return readdirSync(appDirectory)
			.filter((file) => LOCAL_ENV_FILE_PATTERN.test(file))
			.sort();
	} catch {
		return [];
	}
}

/** The note printed after the budget lines when a local env file sits next to the measured build. */
export function describeLocalEnvFiles(assetsDirectory) {
	const files = findLocalEnvFiles(resolve(assetsDirectory, "../../.."));
	if (files.length === 0) return null;
	return `Note: ${files.join(", ")} sits next to this build. CI has no local env file, so a build that read it measures a few hundred bytes above CI; take re-baseline measurements in a checkout without it.`;
}

export function getBudgetIncreaseViolation({ label, actualBytes, baselineBytes, allowedIncreaseBytes }) {
	const increase = actualBytes - baselineBytes;
	if (increase <= allowedIncreaseBytes) return undefined;
	return `${label} increased by ${increase} bytes from baseline ${baselineBytes}; allowed increase is ${allowedIncreaseBytes} bytes`;
}

function normalizeManifestAsset(assetPath) {
	const pathname = assetPath.replace(/[?#].*$/, "");
	if (!pathname.startsWith("/assets/")) throw new Error(`expected client asset path under /assets/: ${assetPath}`);
	return pathname.replace(/^\/assets\//, "");
}

function resolveRouteAssets({ startManifest, routeIds, optionalRouteIds, field, violations }) {
	const optionalRoutes = new Set(optionalRouteIds);
	return new Set(
		routeIds.flatMap((routeId) => {
			const route = startManifest.routes?.[routeId];
			if (!route && optionalRoutes.has(routeId)) return [];
			if (!route || !Array.isArray(route[field])) {
				violations.push(`expected TanStack route ${routeId} with ${field} metadata was not found`);
				return [];
			}
			return route[field].map(normalizeManifestAsset);
		}),
	);
}

/** Reads the built client, the chunk graph and the TanStack manifest; no logging, no budget verdict. */
export async function analyzeClientBundle(assetsDirectoryArgument) {
	const assetsDirectory = resolve(assetsDirectoryArgument ?? "apps/terminal/.output/public/assets");
	const publicGraphArtifacts = findPublicClientChunkGraphArtifacts(resolve(assetsDirectory, ".."));
	if (publicGraphArtifacts.length > 0) {
		throw new Error(
			`client chunk graph diagnostics must not be published under public output: ${publicGraphArtifacts.join(", ")}`,
		);
	}

	const assetFiles = readdirSync(assetsDirectory)
		.filter((file) => file.endsWith(".js") || file.endsWith(".css"))
		.sort();
	const terminalDirectory = resolve(assetsDirectory, "../../..");
	const clientChunkGraph = readClientChunkGraphFile(resolveClientChunkGraphCacheFile(terminalDirectory));
	validateClientChunkGraphAgainstAssets(clientChunkGraph, assetFiles);

	const sizes = assetFiles.map((file) => {
		const content = readFileSync(resolve(assetsDirectory, file));
		return { file, raw: content.length, gzip: gzipSync(content).length };
	});
	const sizesByFile = new Map(sizes.map((asset) => [asset.file, asset]));
	const largestChunk = sizes.filter(({ file }) => file.endsWith(".js")).sort((left, right) => right.raw - left.raw)[0];
	if (!largestChunk) throw new Error("No client JavaScript chunks were found.");

	const totalGzip = sizes.reduce((total, asset) => total + asset.gzip, 0);
	const violations = [];
	const serverDirectory = resolve(assetsDirectory, "../../server");
	const startManifestFile = readdirSync(serverDirectory).find(
		(file) => file.startsWith("_tanstack-start-manifest_") && file.endsWith(".mjs"),
	);
	if (!startManifestFile) throw new Error("TanStack Start manifest was not found.");
	const startManifestModule = await import(pathToFileURL(resolve(serverDirectory, startManifestFile)).href);
	if (typeof startManifestModule.tsrStartManifest !== "function") {
		throw new Error("TanStack Start manifest does not export tsrStartManifest().");
	}
	const startManifest = startManifestModule.tsrStartManifest();

	const tradeRoutePreloadFiles = resolveRouteAssets({
		startManifest,
		routeIds: [...budgets.tradeStartup.requiredRouteIds, ...budgets.tradeStartup.optionalRouteIds],
		optionalRouteIds: budgets.tradeStartup.optionalRouteIds,
		field: "preloads",
		violations,
	});
	const runtimeEntryRoute = startManifest.routes?.[budgets.tradeRuntimeStartup.entryRouteId];
	if (!runtimeEntryRoute || !Array.isArray(runtimeEntryRoute.scripts) || runtimeEntryRoute.scripts.length === 0) {
		throw new Error(
			`expected TanStack route ${budgets.tradeRuntimeStartup.entryRouteId} with script metadata was not found`,
		);
	}
	const runtimeEntryFiles = runtimeEntryRoute.scripts.map((script) => {
		const source = script?.attrs?.src;
		if (typeof source !== "string") throw new Error("expected TanStack runtime entry script with a src attribute");
		return normalizeManifestAsset(source);
	});
	const tradeStaticEntryFiles = budgets.tradeStartup.staticClosureChunkPrefixes.map((prefix) =>
		findUniqueJavaScriptChunk(assetFiles, prefix),
	);
	const tradeStartupFiles = collectTradeStartupFiles({
		graph: clientChunkGraph,
		assetFiles,
		routePreloadFiles: tradeRoutePreloadFiles,
		runtimeEntryFiles,
		semanticEntryFiles: tradeStaticEntryFiles,
	});
	const tradeStartupAssets = [...tradeStartupFiles].map((file) => {
		const asset = sizesByFile.get(file);
		if (!asset) violations.push(`expected trade startup asset ${file} was not found`);
		return asset;
	});
	const tradeStartupGzip = tradeStartupAssets.reduce((total, asset) => total + (asset?.gzip ?? 0), 0);

	const runtimeProfileSizes = budgets.tradeRuntimeStartup.profiles.map((profile) => {
		const files = collectRuntimeStartupFiles({
			graph: clientChunkGraph,
			assetFiles,
			startupFiles: tradeStartupFiles,
			entryFiles: runtimeEntryFiles,
			moduleIds: [...budgets.tradeRuntimeStartup.commonModuleIds, ...profile.moduleIds],
		});
		const assets = [...files].map((file) => {
			const asset = sizesByFile.get(file);
			if (!asset) throw new Error(`expected trade runtime startup asset ${file} was not found`);
			return asset;
		});
		return { ...profile, files, gzip: assets.reduce((total, asset) => total + asset.gzip, 0) };
	});

	const surfaceSizes = budgets.surfaces.map((surface) => {
		const assets = sizes.filter(({ file }) => file.startsWith(`${surface.name}-`) && file.endsWith(".js"));
		return { ...surface, assets };
	});

	return {
		assetsDirectory,
		assetFiles,
		sizes,
		sizesByFile,
		largestChunk,
		totalGzip,
		violations,
		tradeRoutePreloadFiles,
		runtimeEntryFiles,
		tradeStaticEntryFiles,
		tradeStartupFiles,
		tradeStartupGzip,
		runtimeProfileSizes,
		surfaceSizes,
	};
}

export async function checkClientBundleBudget(assetsDirectoryArgument) {
	const {
		assetsDirectory,
		largestChunk,
		totalGzip,
		violations,
		tradeRoutePreloadFiles,
		runtimeEntryFiles,
		tradeStaticEntryFiles,
		tradeStartupFiles,
		tradeStartupGzip,
		runtimeProfileSizes,
		surfaceSizes,
	} = await analyzeClientBundle(assetsDirectoryArgument);

	if (largestChunk.raw > budgets.largestChunkRawBytes) {
		violations.push(`${largestChunk.file} raw ${largestChunk.raw} > ${budgets.largestChunkRawBytes} bytes`);
	}
	if (largestChunk.gzip > budgets.largestChunkGzipBytes) {
		violations.push(`${largestChunk.file} gzip ${largestChunk.gzip} > ${budgets.largestChunkGzipBytes} bytes`);
	}
	const totalGzipIncrease = totalGzip - budgets.totalGzipBaselineBytes;
	if (totalGzipIncrease > budgets.totalGzipAllowedIncreaseBytes) {
		violations.push(
			`total client gzip increased by ${totalGzipIncrease} bytes from baseline ${budgets.totalGzipBaselineBytes}; allowed increase is ${budgets.totalGzipAllowedIncreaseBytes} bytes`,
		);
	}
	const tradeStartupGzipIncrease = tradeStartupGzip - budgets.tradeStartup.baselineGzipBytes;
	if (tradeStartupGzipIncrease > budgets.tradeStartup.allowedIncreaseBytes) {
		violations.push(
			`trade startup gzip increased by ${tradeStartupGzipIncrease} bytes from baseline ${budgets.tradeStartup.baselineGzipBytes}; allowed increase is ${budgets.tradeStartup.allowedIncreaseBytes} bytes`,
		);
	}
	for (const profile of runtimeProfileSizes) {
		const violation = getBudgetIncreaseViolation({
			label: `trade ${profile.name} runtime startup gzip`,
			actualBytes: profile.gzip,
			baselineBytes: profile.baselineGzipBytes,
			allowedIncreaseBytes: profile.allowedIncreaseBytes,
		});
		if (violation) violations.push(violation);
	}

	for (const surface of surfaceSizes) {
		if (surface.assets.length === 0) {
			violations.push(`expected client chunk ${surface.name}-*.js was not found`);
			continue;
		}
		if (surface.assets.length > 1) {
			violations.push(`expected one client chunk ${surface.name}-*.js but found ${surface.assets.length}`);
			continue;
		}
		const asset = surface.assets[0];
		if (!asset) continue;
		const increase = asset.gzip - surface.baselineGzipBytes;
		if (increase > surface.allowedIncreaseBytes) {
			violations.push(
				`${asset.file} gzip increased by ${increase} bytes from baseline ${surface.baselineGzipBytes}; allowed increase is ${surface.allowedIncreaseBytes} bytes`,
			);
		}
	}

	console.log(
		`Client bundle budget: ${largestChunk.file} ${largestChunk.raw} raw / ${largestChunk.gzip} gzip; total ${totalGzip} gzip bytes (${totalGzipIncrease >= 0 ? "+" : ""}${totalGzipIncrease} from baseline).`,
	);
	console.log(
		`- trade startup: ${tradeStartupFiles.size} static-closure assets from ${tradeRoutePreloadFiles.size} route preloads, ${runtimeEntryFiles.length} runtime scripts, and ${tradeStaticEntryFiles.length} semantic entries / ${tradeStartupGzip} gzip bytes (${tradeStartupGzipIncrease >= 0 ? "+" : ""}${tradeStartupGzipIncrease} from baseline)`,
	);
	for (const profile of runtimeProfileSizes) {
		const increase = profile.gzip - profile.baselineGzipBytes;
		console.log(
			`- trade ${profile.name} runtime startup: ${profile.files.size} incremental assets / ${profile.gzip} gzip bytes (${increase >= 0 ? "+" : ""}${increase} from baseline); ${tradeStartupFiles.size + profile.files.size} startup assets / ${tradeStartupGzip + profile.gzip} gzip including static startup`,
		);
	}
	for (const surface of surfaceSizes) {
		const asset = surface.assets.length === 1 ? surface.assets[0] : undefined;
		if (asset) console.log(`- ${asset.file}: ${asset.gzip} gzip bytes`);
	}
	const localEnvNote = describeLocalEnvFiles(assetsDirectory);
	if (localEnvNote) console.log(localEnvNote);

	if (violations.length > 0) {
		console.error("Client bundle budget exceeded:");
		for (const violation of violations) console.error(`- ${violation}`);
		process.exitCode = 1;
	}

	return {
		totalGzip,
		tradeStartupGzip,
		tradeStartupFiles,
		runtimeProfileSizes,
		violations,
	};
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) await checkClientBundleBudget(process.argv[2]);
