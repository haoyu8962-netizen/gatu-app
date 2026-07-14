import { Dropdown } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GlobeIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { localeList } from "@/config/i18n";
import { dynamicActivate } from "@/lib/i18n";

export function LanguageSwitcher() {
	const { i18n, t } = useLingui();
	const activeLocale = i18n.locale;

	const items = localeList.map(({ code, name }) => ({
		label: name,
		active: activeLocale === code,
		onSelect: () => {
			if (activeLocale === code) return;
			dynamicActivate(code).catch(() => {
				toast.error(t`Failed to change language`);
			});
		},
	}));

	return (
		<Dropdown
			align="end"
			triggerVariant="minimal"
			triggerAriaLabel={t`Language`}
			hideCaret
			triggerClassName="size-8 shrink-0 justify-center !px-0 !py-0 !gap-0 rounded-8 text-fg hover:bg-fill-hover active:bg-fill-press"
			trigger={<GlobeIcon className="size-4" />}
			items={items}
		/>
	);
}
