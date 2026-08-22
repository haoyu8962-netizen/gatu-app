import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

export function createI18nRoot(container: Element | DocumentFragment): Root {
	const root = createRoot(container);
	return {
		render(children: ReactNode) {
			root.render(<I18nProvider i18n={i18n}>{children}</I18nProvider>);
		},
		unmount() {
			root.unmount();
		},
	};
}
