import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme-color";

const clientRootLoaderSource = readFileSync(resolve(process.cwd(), "src/providers/client-root-loader.ts"), "utf8");
const rootProviderSource = readFileSync(resolve(process.cwd(), "src/providers/root.tsx"), "utf8");
const clientRootProviderSource = readFileSync(resolve(process.cwd(), "src/providers/client-root.tsx"), "utf8");
const rootRouteSource = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "src/router.tsx"), "utf8");

describe("root provider startup split", () => {
	it("keeps wallet runtimes out of the statically imported root provider", () => {
		expect(clientRootLoaderSource).toContain('import("@/providers/client-root")');
		expect(clientRootLoaderSource).toContain("publish({ Provider: null, error: error ?? new Error(");
		expect(rootProviderSource).toContain("clientRootLoader.load().catch(() => {});");
		expect(rootProviderSource).not.toContain("isDocumentRoutePath");
		expect(rootProviderSource).toContain("useSyncExternalStore(");
		expect(rootProviderSource).not.toContain("lazy(() =>");
		expect(rootProviderSource).not.toContain("<Suspense");
		expect(rootProviderSource).not.toContain('from "@privy-io/react-auth"');
		expect(rootProviderSource).not.toContain('from "@privy-io/wagmi"');
		expect(rootProviderSource).not.toContain('from "@sairn/hl-react"');
	});

	it("keeps the document shell provider structurally stable across hydration", () => {
		expect(rootProviderSource).toContain("<ClientRuntimeProvider ready={false}>");
		expect(rootProviderSource).not.toContain("<Suspense fallback={<ServerProviders");
		const rootProviderBody = rootProviderSource.slice(
			rootProviderSource.indexOf("export function RootProvider"),
			rootProviderSource.indexOf("export function ClientRuntimeGate"),
		);
		expect(rootProviderBody).not.toContain("useHydrated");
		expect(rootProviderBody).not.toContain("Suspense");
	});

	it("activates the wallet runtime inside <body> through the client runtime gate", () => {
		expect(rootProviderSource).toContain("export function ClientRuntimeGate");
		expect(rootProviderSource).toContain("useHydrated()");
		expect(rootProviderSource).toContain(
			"<ClientRootProvider queryClient={queryClient}>{children}</ClientRootProvider>",
		);
		expect(rootProviderSource).not.toContain("fallback={children}");
		expect(rootProviderSource).toContain("if (isServer || !hydrated) return <>{fallback}</>;");
		expect(rootProviderSource).toContain("if (error) throw error;");
		expect(rootProviderSource).toContain("clientRootLoader.getServerState,");
		expect(rootRouteSource).toContain("<ClientRuntimeGate fallback={fallback}>");
		expect(rootRouteSource).not.toContain("<ClientOnly");
	});

	it("selects the same empty application fallback before mounting any route content", () => {
		expect(rootRouteSource).not.toContain("routeSurface");
		expect(rootRouteSource).not.toContain("DocumentOverlays");
		expect(rootRouteSource).toMatch(/<Outlet \/>\n\s*<AppRuntimeOverlays \/>\n/);
		expect(rootRouteSource).toContain("const fallback = <StartupFallback />");
		expect(rootRouteSource).not.toContain("getHydrationRouteSurface");

		const appRuntimeSource = rootRouteSource.slice(
			rootRouteSource.indexOf("function AppRuntime"),
			rootRouteSource.indexOf("// Gates first render"),
		);

		expect(appRuntimeSource).toContain("const clientRuntimeReady = useClientRuntimeReady()");
		expect(appRuntimeSource).toContain("if (!clientRuntimeReady) return <>{fallback}</>");
		expect(appRuntimeSource).toContain("<StartupReadyGate fallback={fallback}>");
		expect(appRuntimeSource).toContain("<Outlet />");
		expect(rootRouteSource).toContain("i18n.locale === getPersistedLocale()");
		expect(rootRouteSource).toContain("i18nReady.finally(() =>");
		expect(rootRouteSource).toContain("return <>{ready ? children : fallback}</>");
	});

	it("mounts the route-aware provider inside router context and the fatal boundary inside body", () => {
		expect(routerSource).not.toContain("ApplicationErrorBoundary");
		expect(routerSource).toContain("InnerWrap:");
		expect(routerSource).toContain("<RootProvider {...rqContext}>{props.children}</RootProvider>");
		expect(routerSource).toContain("defaultPendingMinMs: 0");
		expect(rootRouteSource).toContain("<ApplicationErrorBoundary>");
	});

	it("applies the persisted theme before the terminal stylesheet is parsed", () => {
		const themeScript = rootRouteSource.indexOf("<script suppressHydrationWarning>{THEME_BOOTSTRAP_SCRIPT}</script>");
		const stylesheet = rootRouteSource.indexOf('<link rel="stylesheet"');

		expect(rootRouteSource).toContain("const documentLocale = i18n.locale");
		expect(rootRouteSource).toContain('const documentDirection = isRtlLocale(documentLocale) ? "rtl" : "ltr"');
		expect(rootRouteSource).toContain(
			'<html lang={documentLocale} dir={documentDirection} className="dark" suppressHydrationWarning>',
		);
		expect(THEME_BOOTSTRAP_SCRIPT).toContain('localStorage.getItem("global-settings-v2")');
		expect(rootRouteSource).toContain(
			'import { getDocumentThemeColor, THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme-color";',
		);
		expect(rootRouteSource).toContain("<script suppressHydrationWarning>{THEME_BOOTSTRAP_SCRIPT}</script>");
		expect(themeScript).toBeGreaterThanOrEqual(0);
		expect(stylesheet).toBeGreaterThan(themeScript);
	});

	it("builds the root head theme color from the theme the bootstrap applied", () => {
		const headContent = rootRouteSource.indexOf("<HeadContent />");
		const themeScript = rootRouteSource.indexOf("<script suppressHydrationWarning>{THEME_BOOTSTRAP_SCRIPT}</script>");

		expect(rootRouteSource).toContain("head: () => buildRootHead(FONT_PRELOAD_URLS, getDocumentThemeColor()),");
		expect(headContent).toBeGreaterThanOrEqual(0);
		expect(themeScript).toBeGreaterThan(headContent);
	});

	it("registers the terminal stylesheet as a hoistable resource that survives shell re-renders", () => {
		expect(rootRouteSource).toContain('<link rel="stylesheet" href={appCss} precedence="default" />');
	});

	it("preserves the managed wallet and signing provider hierarchy", () => {
		const providerOrder = [
			"<PrivyProvider",
			"<SmartWalletsProvider>",
			"<PersistQueryClientProvider",
			"<WagmiProvider",
			"<HyperliquidBridge>",
			"<ClientRuntimeProvider>",
		];
		const indexes = providerOrder.map((provider) => clientRootProviderSource.indexOf(provider));

		expect(indexes.every((index) => index >= 0)).toBe(true);
		expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
		expect(clientRootProviderSource).toContain("setActiveWalletForWagmi={selectPrivyWagmiWallet}");
		expect(clientRootProviderSource).toContain("allowAgentOnlySession={ready && !authenticated}");
		const hyperliquidBridgeBody = clientRootProviderSource.slice(
			clientRootProviderSource.indexOf("function HyperliquidBridge"),
			clientRootProviderSource.indexOf("function HyperliquidAgentApprovalBridge"),
		);
		const hyperliquidProviderIndex = hyperliquidBridgeBody.indexOf("<HyperliquidProvider");
		const ownerSignerBridgeIndex = hyperliquidBridgeBody.indexOf("<HyperliquidOwnerSignerBridge>");
		const agentApprovalBridgeIndex = hyperliquidBridgeBody.indexOf("<HyperliquidAgentApprovalBridge>");
		expect(hyperliquidProviderIndex).toBeGreaterThanOrEqual(0);
		expect(ownerSignerBridgeIndex).toBeGreaterThan(hyperliquidProviderIndex);
		expect(agentApprovalBridgeIndex).toBeGreaterThan(ownerSignerBridgeIndex);
		expect(clientRootProviderSource).toContain("<HyperliquidAgentApprovalProvider mutateAsync={approval.mutateAsync}>");
		expect(clientRootProviderSource).toContain("<EmbeddedDepositAutoBridge />");
		expect(clientRootProviderSource).toContain("<OrderReconciliation />");
		expect(clientRootProviderSource).toContain("<TwapReconciliation />");
		expect(clientRootProviderSource).toContain("onSuccess={persistenceCallbacks.onSuccess}");
		expect(clientRootProviderSource).toContain("onError={persistenceCallbacks.onError}");
	});
});
