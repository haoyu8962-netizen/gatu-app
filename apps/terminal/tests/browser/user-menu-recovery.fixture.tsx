import { i18n } from "@lingui/core";
import { UserMenu } from "@/components/trade/header/user-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages as englishMessages } from "@/locales/en/messages.po";
import { messages as chineseMessages } from "@/locales/zh/messages.po";
import { recoveryCalls, setRecoverySession, type UserMenuRecoverySession } from "./user-menu-recovery.browser";
import "./trade-slider.css";

declare global {
	interface Window {
		__gatuUserMenuRecovery: {
			setSession: (patch: Partial<UserMenuRecoverySession>) => void;
			setLocale: (locale: "en" | "zh") => void;
			calls: typeof recoveryCalls;
		};
	}
}

i18n.load({ en: englishMessages, zh: chineseMessages });
i18n.activate("en");

window.__gatuUserMenuRecovery = {
	setSession: setRecoverySession,
	setLocale: (locale) => i18n.activate(locale),
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
