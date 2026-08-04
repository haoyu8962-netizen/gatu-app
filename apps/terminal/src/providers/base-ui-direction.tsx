import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";
import { isRtlLocale } from "@/config/i18n";

/** Keeps Base UI keyboard, pointer, and placement behavior aligned with the active locale. */
export function BaseUiDirectionProvider({ children }: { children: ReactNode }) {
	const { i18n } = useLingui();
	return <DirectionProvider direction={isRtlLocale(i18n.locale) ? "rtl" : "ltr"}>{children}</DirectionProvider>;
}
