import { Dropdown } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GlobeIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { defaultLocale, localeList, numberFormatLocaleList } from "@/config/i18n";
import { cn } from "@/lib/cn";
import { dynamicActivate } from "@/lib/i18n";
import { useGlobalSettings, useGlobalSettingsActions } from "@/stores/use-global-settings-store";

interface Props {
	showLabel?: boolean;
	className?: string;
	labelClassName?: string;
}

export function LanguageSwitcher({ showLabel = false, className, labelClassName }: Props) {
	const { i18n, t } = useLingui();
	const activeLocale = i18n.locale;
	const activeLanguageName = localeList.find(({ code }) => code === activeLocale)?.name ?? activeLocale;
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
			triggerClassName={cn(
				"h-8 min-h-8 shrink-0 justify-center !py-0 rounded-8 text-fg hover:bg-fill-hover active:bg-fill-press",
				showLabel ? "gap-1.5 px-2" : "w-8 !px-0 !gap-0",
				className,
			)}
			trigger={
				<>
					<GlobeIcon className="size-4 shrink-0" />
					{showLabel && (
						<span className={cn("text-xs font-semibold whitespace-nowrap", labelClassName)}>{activeLanguageName}</span>
					)}
				</>
			}
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
