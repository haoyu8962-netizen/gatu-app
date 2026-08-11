import { Dropdown } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GlobeIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { defaultLocale, localeList, numberFormatLocaleList } from "@/config/i18n";
import { dynamicActivate } from "@/lib/i18n";
import { useGlobalSettings, useGlobalSettingsActions } from "@/stores/use-global-settings-store";

export function LanguageSwitcher() {
	const { i18n, t } = useLingui();
	const activeLocale = i18n.locale;
	const { numberFormatLocale } = useGlobalSettings();
	const { setNumberFormatLocale } = useGlobalSettingsActions();

	const languageItems = localeList.map(({ code, name }) => ({
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
		label: name,
		active: numberFormatLocale === code,
		onSelect: () => setNumberFormatLocale(code),
	}));
	const settingsAreDefault = activeLocale === defaultLocale && numberFormatLocale === "auto";

	function resetLocaleSettings() {
		setNumberFormatLocale("auto");
		if (activeLocale === defaultLocale) return;
		dynamicActivate(defaultLocale).catch(() => {
			toast.error(t`Failed to change language`);
		});
	}

	return (
		<Dropdown
			align="end"
			triggerVariant="minimal"
			triggerAriaLabel={t`Language and number format`}
			hideCaret
			triggerClassName="size-8 shrink-0 justify-center !px-0 !py-0 !gap-0 rounded-8 text-fg hover:bg-fill-hover active:bg-fill-press"
			trigger={<GlobeIcon className="size-4" />}
			popupClassName="min-w-64 max-h-[calc(100dvh-3rem)]"
			groups={[
				{
					label: t`Number format`,
					items: numberFormatItems,
				},
				{
					label: t`Language`,
					items: languageItems,
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
