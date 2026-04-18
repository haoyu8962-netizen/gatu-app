import {
	Modal,
	ModalContent,
	ModalHeader,
	ModalPopup,
	ModalTitle,
	SegmentedControlItem,
	SegmentedControls,
	Select,
	Slider,
	Toggle,
} from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { MARKET_ORDER_SLIPPAGE_MAX_PERCENT, MARKET_ORDER_SLIPPAGE_MIN_PERCENT } from "@/config/constants";
import {
	dynamicActivate,
	type LocaleCode,
	localeList,
	type NumberFormatLocale,
	numberFormatLocaleList,
} from "@/lib/i18n";
import { useSettingsDialogActions, useSettingsDialogOpen } from "@/stores/use-global-modal-store";
import {
	useGlobalSettings,
	useGlobalSettingsActions,
	useMarketOrderSlippagePercent,
	useNetwork,
} from "@/stores/use-global-settings-store";

export function GlobalSettingsModal() {
	const open = useSettingsDialogOpen();
	const { close } = useSettingsDialogActions();
	const { i18n } = useLingui();
	const slippagePercent = useMarketOrderSlippagePercent();
	const { showOrderbookInQuote, numberFormatLocale } = useGlobalSettings();
	const { setShowOrderbookInQuote, setNumberFormatLocale, setMarketOrderSlippagePercent, setNetwork } =
		useGlobalSettingsActions();
	const network = useNetwork();

	const [localSlippageInput, setLocalSlippageInput] = useState<string | null>(null);
	const slippageInputValue = localSlippageInput ?? String(slippagePercent);

	function handleSlippageInputChange(event: ChangeEvent<HTMLInputElement>) {
		const nextValue = event.target.value;
		setLocalSlippageInput(nextValue);
		if (nextValue.trim() === "") return;
		const parsed = Number(nextValue);
		if (Number.isFinite(parsed)) setMarketOrderSlippagePercent(parsed);
	}

	function handleSlippageInputBlur() {
		setLocalSlippageInput(null);
	}

	function handleSlippageSliderChange(value: number | readonly number[]) {
		const nextValue = Array.isArray(value) ? value[0] : value;
		if (typeof nextValue === "number" && nextValue !== slippagePercent) {
			setMarketOrderSlippagePercent(nextValue);
		}
	}

	function handleLanguageChange(value: string | null) {
		if (value) dynamicActivate(value as LocaleCode);
	}

	function handleNumberFormatChange(value: string | null) {
		if (value) setNumberFormatLocale(value as NumberFormatLocale);
	}

	const languageOptions = localeList.map(({ code, name }) => ({ value: code, label: name }));
	const numberFormatOptions = numberFormatLocaleList.map(({ code, name }) => ({ value: code, label: name }));

	return (
		<Modal open={open} onOpenChange={close}>
			<ModalPopup size="sm">
				<ModalHeader>
					<ModalTitle>{t`Settings`}</ModalTitle>
				</ModalHeader>

				<ModalContent className="space-y-6 max-h-[70vh] overflow-y-auto">
					<SettingsGroup label={t`Trading`}>
						<div className="space-y-2.5">
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-fg">{t`Slippage tolerance`}</span>
								<div className="flex items-center gap-1 shrink-0">
									<NumberInput
										value={slippageInputValue}
										onChange={handleSlippageInputChange}
										onBlur={handleSlippageInputBlur}
										min={MARKET_ORDER_SLIPPAGE_MIN_PERCENT}
										max={MARKET_ORDER_SLIPPAGE_MAX_PERCENT}
										maxAllowedDecimals={2}
										inputSize="sm"
										className="w-16 text-right tabular-nums"
									/>
									<span className="text-xs text-fg-muted">%</span>
								</div>
							</div>
							<Slider
								value={[slippagePercent]}
								onValueChange={handleSlippageSliderChange}
								min={MARKET_ORDER_SLIPPAGE_MIN_PERCENT}
								max={MARKET_ORDER_SLIPPAGE_MAX_PERCENT}
								step={0.1}
								thumbSize="sm"
							/>
							<div className="flex items-center justify-between text-2xs tabular-nums text-fg-muted">
								<span>{MARKET_ORDER_SLIPPAGE_MIN_PERCENT}%</span>
								<span>{MARKET_ORDER_SLIPPAGE_MAX_PERCENT}%</span>
							</div>
						</div>
					</SettingsGroup>

					<SettingsGroup label={t`Display`}>
						<SettingRow label={t`Order book in quote asset`}>
							<Toggle size="xs" checked={showOrderbookInQuote} onCheckedChange={setShowOrderbookInQuote} />
						</SettingRow>
						<SettingRow label={t`Display language`}>
							<Select
								value={i18n.locale}
								onValueChange={handleLanguageChange}
								options={languageOptions}
								size="xs"
								triggerClassName="min-w-32"
							/>
						</SettingRow>
						<SettingRow label={t`Number format`}>
							<Select
								value={numberFormatLocale}
								onValueChange={handleNumberFormatChange}
								options={numberFormatOptions}
								size="xs"
								triggerClassName="min-w-32"
							/>
						</SettingRow>
					</SettingsGroup>

					<SettingsGroup label={t`Network`}>
						<SettingRow label={t`Environment`} hint={t`Page reloads when changed`}>
							<SegmentedControls
								value={network}
								onValueChange={(value) => setNetwork(value as "mainnet" | "testnet")}
								size="xxs"
							>
								<SegmentedControlItem value="mainnet">{t`Mainnet`}</SegmentedControlItem>
								<SegmentedControlItem value="testnet">{t`Testnet`}</SegmentedControlItem>
							</SegmentedControls>
						</SettingRow>
					</SettingsGroup>
				</ModalContent>
			</ModalPopup>
		</Modal>
	);
}

interface SettingsGroupProps {
	label: string;
	children: ReactNode;
}

function SettingsGroup({ label, children }: SettingsGroupProps) {
	return (
		<section className="space-y-3">
			<h3 className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">{label}</h3>
			<div className="space-y-2">{children}</div>
		</section>
	);
}

interface SettingRowProps {
	label: string;
	hint?: string;
	children: ReactNode;
}

function SettingRow({ label, hint, children }: SettingRowProps) {
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between gap-3 min-h-7">
				<span className="text-xs text-fg min-w-0">{label}</span>
				<div className="shrink-0">{children}</div>
			</div>
			{hint && <p className="text-2xs text-fg-muted text-pretty">{hint}</p>}
		</div>
	);
}
