import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import { preloadTopNav, TopNav } from "@/components/trade/header/top-nav";
import { dynamicActivate, i18nReady } from "@/lib/i18n";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";
import "./trade-slider.css";

declare global {
	interface Window {
		__sairnTopNavConnected?: { ready: boolean; locale: string; theme: "dark" | "light" };
	}
}

const params = new URLSearchParams(window.location.search);
const locale = params.get("locale") ?? "en";
const requestedTheme = params.get("theme") === "light" ? "light" : "dark";

function Fixture() {
	const theme = useTheme();
	const setTheme = useSetTheme();
	const themeApplied = theme === requestedTheme;

	useLayoutEffect(() => {
		if (!themeApplied) setTheme(requestedTheme);
	}, [themeApplied, setTheme]);

	useEffect(() => {
		if (themeApplied) window.__sairnTopNavConnected = { ready: true, locale, theme: requestedTheme };
	}, [themeApplied]);

	if (!themeApplied) return null;
	return <TopNav />;
}

async function boot() {
	await i18nReady;
	await dynamicActivate(locale);
	await preloadTopNav();
	const root = document.getElementById("root");
	if (!root) throw new Error("Missing fixture root");
	const router = createRouter({
		routeTree: createRootRoute({ component: Fixture }),
		history: createMemoryHistory({ initialEntries: ["/trade/HYPE"] }),
	});
	createI18nRoot(root).render(<RouterProvider router={router} />);
}

void boot();
