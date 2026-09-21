import { Dropdown } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GlobeIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { defaultLocale, defaultNumberFormatLocale, localeList, numberFormatLocaleList } from "@/config/i18n";
import { cn } from "@/lib/cn";
import { dynamicActivate } from "@/lib/i18n";
import { menuPopupSelectionSkinClass } from "@/lib/ui/menu-popup-skin";
import { useGlobalSettings, useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import { NavMenuTriggerView } from "./nav-menu-trigger-view";

interface Props {
	showLabel?: boolean;
	compactLabel?: boolean;
	className?: string;
	labelClassName?: string;
	sideOffset?: number;
	alignOffset?: number;
}

export function LanguageSwitcher({
	showLabel = false,
	compactLabel = false,
	className,
	labelClassName,
	sideOffset,
	alignOffset,
}: Props) {
	const { i18n, t } = useLingui();
	const activeLocale = i18n.locale;
	const activeLanguageName = localeList.find(({ code }) => code === activeLocale)?.name ?? activeLocale;
	const { numberFormatLocale } = useGlobalSettings();
	const { setNumberFormatLocale } = useGlobalSettingsActions();

	const languageItems = localeList.map(({ code, name }) => ({
		value: code,
		label: name,
		active: activeLocale === code,
		onSelect: () => {
			if (activeLocale === code) return;
			dynamicActivate(code).catch(() => {
				toast.error(t`Failed to change language`);
			});
		},
	}));
	const numberFormatItems = numberFormatLocaleList.map(({ code, name }) => ({
		value: code,
		label: name,
		active: numberFormatLocale === code,
		onSelect: () => setNumberFormatLocale(code),
	}));
	const settingsAreDefault = activeLocale === defaultLocale && numberFormatLocale === defaultNumberFormatLocale;

	function resetLocaleSettings() {
		dynamicActivate(defaultLocale)
			.then((activated) => {
				if (activated) setNumberFormatLocale(defaultNumberFormatLocale);
			})
			.catch(() => {
				toast.error(t`Failed to change language`);
			});
	}

	return (
		<Dropdown
			align="end"
			sideOffset={sideOffset}
			alignOffset={alignOffset}
			triggerVariant="minimal"
			triggerAriaLabel={t(DESKTOP_NAV_LABELS.language)}
			hideCaret
			renderTrigger={
				<NavMenuTriggerView
					variant="language"
					label={showLabel ? activeLanguageName : undefined}
					compactLabel={compactLabel}
					labelClassName={labelClassName}
					icon={<GlobeIcon className="size-[18px] shrink-0" />}
					className={className}
				/>
			}
			popupClassName={cn(
				menuPopupSelectionSkinClass,
				"max-h-[calc(100dvh-4rem)] w-[232px] min-w-[232px] min-[1001px]:w-[224px] min-[1001px]:min-w-[224px]",
				"[&_[role^=menuitem]>svg]:size-[18px] [&_[role^=menuitem]>svg]:text-trading-panel-fg",
				"[&>[role=group]:first-child_[role^=menuitem]]:tabular-nums [&>[role=group]:first-child_[role^=menuitem]>span]:[direction:ltr] [&>[role=group]:first-child_[role^=menuitem]>span]:[unicode-bidi:isolate]",
				"[&>[role=group]:last-child_[role^=menuitem]]:font-semibold",
			)}
			groups={[
				{
					label: t`Number format`,
					items: numberFormatItems,
					selectionMode: "single",
				},
				{
					label: t`Language`,
					items: languageItems,
					selectionMode: "single",
				},
				{
					items: [
						{
							label: t`Reset`,
							disabled: settingsAreDefault,
							onSelect: resetLocaleSettings,
						},
					],
				},
			]}
		/>
	);
}
