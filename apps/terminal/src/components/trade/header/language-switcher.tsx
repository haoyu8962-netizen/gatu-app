import { Dropdown } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { GlobeIcon } from "@phosphor-icons/react";
import { localeList } from "@/config/i18n";
import { dynamicActivate } from "@/lib/i18n";

export function LanguageSwitcher() {
	const { i18n } = useLingui();

	const items = localeList.map(({ code, name }) => ({
		label: name,
		active: i18n.locale === code,
		onSelect: () => {
			dynamicActivate(code);
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
