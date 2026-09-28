import { i18n } from "@lingui/core";
import { preloadMobileAgentSyncModal } from "@/components/trade/header/mobile-agent-sync-modal-loader";
import { UserMenu } from "@/components/trade/header/user-menu";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { useIsMobile } from "@/hooks/use-mobile";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages as englishMessages } from "@/locales/en/messages.po";
import { messages as chineseMessages } from "@/locales/zh/messages.po";
import {
	recoveryCalls,
	setMobileSyncOpen,
	setRecoverySession,
	type UserMenuRecoverySession,
} from "./user-menu-recovery.browser";
import "./trade-slider.css";

declare global {
	interface Window {
		__gatuUserMenuRecovery: {
			setSession: (patch: Partial<UserMenuRecoverySession>) => void;
			setLocale: (locale: "en" | "zh") => void;
			openLinkMobileDevice: () => Promise<void>;
			pairingEnabled: boolean;
			calls: typeof recoveryCalls;
		};
	}
}

i18n.load({ en: englishMessages, zh: chineseMessages });
i18n.activate("en");

// Every scenario here is a returning session whose initialization stalls. The header only shows
// "Connecting..." before Privy is ready when the SDK's session token key exists (see
// src/lib/wallet/privy-session-hint.ts); a fresh browser context would otherwise show "Connect".
window.localStorage.setItem("privy:token", "fixture-session");

// The fixture renders UserMenu without TopNav. openLinkMobileDevice follows the header QR icon's click
// handler (warm the dialog chunk, then open the global modal store), so a test can reach the single
// Link mobile device dialog that UserMenu hosts. pairingEnabled exposes the flag the Vite config pins.
window.__gatuUserMenuRecovery = {
	setSession: setRecoverySession,
	setLocale: (locale) => i18n.activate(locale),
	openLinkMobileDevice: async () => {
		await preloadMobileAgentSyncModal();
		setMobileSyncOpen(true);
	},
	pairingEnabled: MOBILE_PAIRING_FEATURES.enabled,
	calls: recoveryCalls,
};

function Fixture() {
	const isMobile = useIsMobile();
	return (
		<main style={{ padding: 16, minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-fg)" }}>
			<header style={{ display: "flex", justifyContent: "flex-end", minHeight: 44 }}>
				<UserMenu variant={isMobile ? "default" : "desktop-nav"} />
			</header>
			<section style={{ paddingTop: 32 }}>
				<label htmlFor="order-draft">Order quantity draft</label>
				<input id="order-draft" aria-label="Order quantity draft" defaultValue="1.25" />
			</section>
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createI18nRoot(root).render(<Fixture />);
