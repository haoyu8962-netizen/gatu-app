import { Dropdown } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GlobeIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { defaultLocale, defaultNumberFormatLocale, localeList, numberFormatLocaleList } from "@/config/i18n";
import { cn } from "@/lib/cn";
import { dynamicActivate } from "@/lib/i18n";
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
				"w-[232px] min-w-[232px] max-h-[calc(100dvh-4rem)] overflow-y-auto !rounded-[12px] !border-market-close-stroke-card !p-[6px] font-market-close !shadow-language-settings focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-stroke-focus !transition-opacity !duration-[120ms] data-starting-style:!scale-100 data-ending-style:!scale-100 min-[1001px]:w-[224px] min-[1001px]:min-w-[224px]",
				"[&>[role=separator]]:mx-1 [&>[role=separator]]:my-[6px] [&>[role=separator]]:bg-language-settings-divider",
				"[&_[role=presentation]]:!px-[10px] [&_[role=presentation]]:!pt-[2px] [&_[role=presentation]]:!pb-[6px] [&_[role=presentation]]:text-[11px] [&_[role=presentation]]:leading-normal [&_[role=presentation]]:font-bold [&_[role=presentation]]:tracking-[0.4px] [&_[role=presentation]]:text-market-close-subtle",
				"[&>[role=group]:first-child>[role=presentation]]:!pt-[8px]",
				"[&_[role^=menuitem]]:!gap-[10px] [&_[role^=menuitem]]:!rounded-[8px] [&_[role^=menuitem]]:!px-[10px] [&_[role^=menuitem]]:!py-[8px] [&_[role^=menuitem]]:text-[13px] [&_[role^=menuitem]]:leading-[18px] [&_[role^=menuitem]]:font-medium [&_[role^=menuitem]]:text-market-close-muted [&_[role^=menuitem]]:transition-colors [&_[role^=menuitem]]:duration-[120ms]",
				"[&_[role=menuitem][aria-current=true]]:bg-market-close-card [&_[role=menuitem][aria-current=true]]:font-bold [&_[role=menuitem][aria-current=true]]:text-market-close-fg [&_[role=menuitemradio][data-checked]]:bg-market-close-card [&_[role=menuitemradio][data-checked]]:font-bold [&_[role=menuitemradio][data-checked]]:text-market-close-fg [&_[role^=menuitem][data-highlighted]]:bg-market-close-hover [&_[role^=menuitem][data-disabled]]:text-language-settings-disabled",
				"[&_[role^=menuitem]>svg]:!ms-2 [&_[role^=menuitem]>svg]:!size-[18px] [&_[role^=menuitem]>svg]:text-market-close-fg",
				"[&>[role=group]:first-child_[role^=menuitem]]:tabular-nums [&>[role=group]:first-child_[role^=menuitem]>span]:[direction:ltr] [&>[role=group]:first-child_[role^=menuitem]>span]:[unicode-bidi:isolate]",
				"[&>[role=group]:last-child_[role^=menuitem]]:font-semibold",
				"max-[1000px]:[&_[role^=menuitem]]:min-h-11 max-[1000px]:[&_[role^=menuitem]]:!py-[13px] max-[1000px]:[&_[role^=menuitem]]:text-[14px]",
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
