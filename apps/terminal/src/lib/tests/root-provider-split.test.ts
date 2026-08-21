import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isDocumentRoutePath } from "@/providers/client-runtime";

const rootProviderSource = readFileSync(resolve(process.cwd(), "src/providers/root.tsx"), "utf8");
const clientRootProviderSource = readFileSync(resolve(process.cwd(), "src/providers/client-root.tsx"), "utf8");
const rootRouteSource = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "src/router.tsx"), "utf8");

describe("root provider startup split", () => {
	it("classifies document routes without activating the wallet runtime", () => {
		expect(isDocumentRoutePath("/docs")).toBe(true);
		expect(isDocumentRoutePath("/terms/")).toBe(true);
		expect(isDocumentRoutePath("/trade/HYPE")).toBe(false);
	});

	it("keeps wallet runtimes out of the statically imported root provider", () => {
		expect(rootProviderSource).toContain('import("@/providers/client-root")');
		expect(rootProviderSource).toContain("let clientRootProviderModule");
		expect(rootProviderSource).toContain("void loadClientRootProvider()");
		expect(rootProviderSource).toContain("!isDocumentRoutePath(window.location.pathname)");
		expect(rootProviderSource).toContain("lazy(() =>");
		expect(rootProviderSource).not.toContain('from "@privy-io/react-auth"');
		expect(rootProviderSource).not.toContain('from "@privy-io/wagmi"');
		expect(rootProviderSource).not.toContain('from "@gatu/hl-react"');
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
		expect(rootProviderSource).toContain("isDocumentRoutePath(pathname)");
		expect(rootProviderSource).toContain("<Suspense fallback={children}>");
		expect(rootRouteSource).toContain("<ClientRuntimeGate>");
		expect(rootRouteSource).toContain("if (!clientRuntimeReady) return <AppShellSkeleton />");
		expect(rootRouteSource).not.toContain("<ClientOnly");
	});

	it("retains the client-runtime and persisted-locale gates before mounting route content", () => {
		const appRuntimeSource = rootRouteSource.slice(
			rootRouteSource.indexOf("function AppRuntime"),
			rootRouteSource.indexOf("// Gates first render"),
		);

		expect(appRuntimeSource).toContain("const clientRuntimeReady = useClientRuntimeReady()");
		expect(appRuntimeSource).toContain("if (!clientRuntimeReady) return <AppShellSkeleton />");
		expect(appRuntimeSource).toContain("<I18nReadyGate fallback={<AppShellSkeleton />}");
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

		expect(rootRouteSource).toContain('<html lang="en" dir="ltr" className="dark"');
		expect(rootRouteSource).toContain('localStorage.getItem("global-settings-v2")');
		expect(rootRouteSource).toContain("<script suppressHydrationWarning>{THEME_BOOTSTRAP_SCRIPT}</script>");
		expect(themeScript).toBeGreaterThanOrEqual(0);
		expect(stylesheet).toBeGreaterThan(themeScript);
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
		const agentApprovalBridgeIndex = hyperliquidBridgeBody.indexOf("<HyperliquidAgentApprovalBridge>");
		expect(hyperliquidProviderIndex).toBeGreaterThanOrEqual(0);
		expect(agentApprovalBridgeIndex).toBeGreaterThan(hyperliquidProviderIndex);
		expect(clientRootProviderSource).toContain("<HyperliquidAgentApprovalProvider mutateAsync={approval.mutateAsync}>");
		expect(clientRootProviderSource).toContain("<EmbeddedDepositAutoBridge />");
		expect(clientRootProviderSource).toContain("<OrderReconciliation />");
		expect(clientRootProviderSource).toContain("<TwapReconciliation />");
		expect(clientRootProviderSource).toContain("onSuccess={persistenceCallbacks.onSuccess}");
		expect(clientRootProviderSource).toContain("onError={persistenceCallbacks.onError}");
	});
});
