import {
	Button,
	Modal,
	ModalContent,
	ModalHeader,
	ModalPopup,
	ModalTitle,
	SegmentedControlItem,
	SegmentedControls,
	Slider,
	Toggle,
} from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import type { ChangeEvent, ReactNode } from "react";
import { useReducer, useState } from "react";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";
import { resetDesktopGridLayouts } from "@/config/desktop-grid-layout";
import { MARKET_ORDER_SLIPPAGE_MAX_PERCENT, MARKET_ORDER_SLIPPAGE_MIN_PERCENT } from "@/config/trade";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	readPositionMarketCloseConfirmationPreference,
	resetPositionMarketCloseConfirmation,
} from "@/lib/trade/position-market-close-confirmation-preference";
import { useSettingsDialogActions, useSettingsDialogOpen } from "@/stores/use-global-modal-store";
import {
	useGlobalSettings,
	useGlobalSettingsActions,
	useMarketOrderSlippagePercent,
	useNetwork,
	useSkipOrderConfirmation,
} from "@/stores/use-global-settings-store";

export function GlobalSettingsModal() {
	const open = useSettingsDialogOpen();
	const { close } = useSettingsDialogActions();
	const { t } = useLingui();
	const slippagePercent = useMarketOrderSlippagePercent();
	const { showOrderbookInQuote } = useGlobalSettings();
	const skipOrderConfirmation = useSkipOrderConfirmation();
	const { setShowOrderbookInQuote, setMarketOrderSlippagePercent, setNetwork, setSkipOrderConfirmation } =
		useGlobalSettingsActions();
	const network = useNetwork();
	const { clientKey, env } = useHyperliquid();
	const [, refreshConfirmationPreference] = useReducer((revision: number) => revision + 1, 0);
	const confirmationIdentity = { owner: clientKey, env };
	const confirmationPreference = readPositionMarketCloseConfirmationPreference(confirmationIdentity);

	const [localSlippageInput, setLocalSlippageInput] = useState<string | null>(null);
	const [localSlippageSlider, setLocalSlippageSlider] = useState<number | null>(null);
	const slippageSliderValue = localSlippageSlider ?? slippagePercent;
	const slippageInputValue = localSlippageInput ?? String(slippageSliderValue);

	function handleSlippageInputChange(event: ChangeEvent<HTMLInputElement>) {
		const nextValue = event.target.value;
		setLocalSlippageInput(nextValue);
		if (nextValue.trim() === "") return;
		const parsed = Number(nextValue);
		if (!Number.isFinite(parsed) || parsed < MARKET_ORDER_SLIPPAGE_MIN_PERCENT) return;
		const committed = setMarketOrderSlippagePercent(parsed);
		if (committed !== parsed) setLocalSlippageInput(String(committed));
	}

	function handleSlippageInputBlur() {
		if (localSlippageInput !== null && localSlippageInput.trim() !== "") {
			const parsed = Number(localSlippageInput);
			if (Number.isFinite(parsed)) setMarketOrderSlippagePercent(parsed);
		}
		setLocalSlippageInput(null);
	}

	function handleSlippageSliderChange(value: number | readonly number[]) {
		if (typeof value !== "number") return;
		setLocalSlippageSlider(value);
	}

	function handleSlippageSliderCommit(value: number | readonly number[]) {
		if (typeof value !== "number") return;
		setLocalSlippageSlider(null);
		if (value !== slippagePercent) setMarketOrderSlippagePercent(value);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen) return;
		setLocalSlippageInput(null);
		setLocalSlippageSlider(null);
		close();
	}

	function handleOrderConfirmationToggle(nextEnabled: boolean) {
		setSkipOrderConfirmation(!nextEnabled);
	}

	function handleDesktopLayoutReset() {
		resetDesktopGridLayouts();
		window.location.reload();
	}

	function handleMarketCloseConfirmationReset() {
		const result = resetPositionMarketCloseConfirmation(confirmationIdentity);
		refreshConfirmationPreference();
		if (result === "required") toast.success(t`Market close confirmation restored.`);
		else toast.error(t`Market close confirmation could not be restored in this browser.`);
	}

	return (
		<Modal open={open} onOpenChange={handleOpenChange}>
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
										mobileSafe
										aria-label={t`Slippage tolerance`}
										className="w-16 text-right tabular-nums max-[1000px]:h-8"
									/>
									<span className="text-xs text-fg-muted">%</span>
								</div>
							</div>
							<Slider
								label={t`Slippage tolerance`}
								labelHidden
								getAriaValueText={(_formattedValue, value) => `${value}%`}
								value={slippageSliderValue}
								onValueChange={handleSlippageSliderChange}
								onValueCommitted={handleSlippageSliderCommit}
								onPointerCancel={() => setLocalSlippageSlider(null)}
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
						<SettingRow label={t`Order confirmation`} hint={t`Review side, size and price before each order is sent.`}>
							<Toggle
								size="xs"
								aria-label={t`Order confirmation`}
								checked={!skipOrderConfirmation}
								onCheckedChange={handleOrderConfirmationToggle}
							/>
						</SettingRow>
						<SettingRow
							label={t`Market close confirmation`}
							hint={
								confirmationPreference === "dismissed"
									? t`Market clicks currently close the full position immediately for this account and network.`
									: confirmationPreference === "required"
										? t`A confirmation is shown before each market close.`
										: t`Connect an account with browser storage available to manage this preference.`
							}
						>
							<Button
								variant="outline"
								intent="neutral"
								size="xs"
								disabled={confirmationPreference !== "dismissed"}
								onClick={handleMarketCloseConfirmationReset}
							>
								{t`Restore`}
							</Button>
						</SettingRow>
					</SettingsGroup>

					<SettingsGroup label={t`Display`}>
						<SettingRow label={t`Order book in quote asset`}>
							<Toggle
								size="xs"
								aria-label={t`Order book in quote asset`}
								checked={showOrderbookInQuote}
								onCheckedChange={setShowOrderbookInQuote}
							/>
						</SettingRow>
						<SettingRow label={t`Desktop layout`} hint={t`Page reloads when changed`}>
							<Button variant="outline" intent="neutral" size="xs" onClick={handleDesktopLayoutReset}>
								{t`Reset`}
							</Button>
						</SettingRow>
					</SettingsGroup>

					<SettingsGroup label={t`Network`}>
						<SettingRow label={t`Environment`} hint={t`Page reloads when changed`}>
							<SegmentedControls
								value={network}
								onValueChange={(value: string) => setNetwork(value as "mainnet" | "testnet")}
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
