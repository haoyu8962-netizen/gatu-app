import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
	Button,
	Modal,
	ModalContent,
	ModalHeader,
	ModalPopup,
	ModalTitle,
	SegmentedControlItem,
	SegmentedControls,
	Toggle,
} from "@sairn/ui";
import type { ChangeEvent, ReactNode } from "react";
import { useId, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";
import { APP_BUILD_COMMIT, APP_RELEASE_ID, APP_RELEASE_LABEL, APP_VERSION } from "@/config/app";
import { resetDesktopGridLayouts } from "@/config/desktop-grid-layout";
import { MARKET_ORDER_SLIPPAGE_MAX_PERCENT, MARKET_ORDER_SLIPPAGE_MIN_PERCENT } from "@/config/trade";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEmailWalletExport } from "@/hooks/wallet/use-email-wallet-export";
import { useNumberFormat } from "@/lib/format";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	type PositionMarketCloseConfirmationPreferenceStatus,
	readPositionMarketCloseConfirmationPreference,
	resetPositionMarketCloseConfirmation,
} from "@/lib/trade/position-market-close-confirmation-preference";
import { useSettingsDialogActions, useSettingsDialogOpen } from "@/stores/use-global-modal-store";
import {
	useAnimateOrderbook,
	useGlobalSettingsActions,
	useMarketOrderSlippagePercent,
	useNetwork,
	useSkipOrderConfirmation,
	useTransactionDelayProtection,
} from "@/stores/use-global-settings-store";

const MARKET_CLOSE_CONFIRMATION_HINTS: Record<PositionMarketCloseConfirmationPreferenceStatus, MessageDescriptor> = {
	dismissed: msg`Market clicks currently close the full position immediately for this account and network.`,
	required: msg`A confirmation is shown before each market close.`,
	unavailable: msg`Connect an account with browser storage available to manage this preference.`,
};

export function GlobalSettingsModal() {
	const open = useSettingsDialogOpen();
	const { close } = useSettingsDialogActions();
	const { t } = useLingui();
	const { formatNumber } = useNumberFormat();
	const walletExport = useEmailWalletExport();
	const { copy: copyVersion } = useCopyToClipboard();
	const slippagePercent = useMarketOrderSlippagePercent();
	const animateOrderbook = useAnimateOrderbook();
	const skipOrderConfirmation = useSkipOrderConfirmation();
	const transactionDelayProtection = useTransactionDelayProtection();
	const {
		setAnimateOrderbook,
		setMarketOrderSlippagePercent,
		setNetwork,
		setSkipOrderConfirmation,
		setTransactionDelayProtection,
	} = useGlobalSettingsActions();
	const network = useNetwork();
	const isMobile = useIsMobile();
	const popupRef = useRef<HTMLDivElement>(null);
	const { clientKey, env } = useHyperliquid();
	const [, refreshConfirmationPreference] = useReducer((revision: number) => revision + 1, 0);
	const confirmationIdentity = { owner: clientKey, env };
	const confirmationPreference = readPositionMarketCloseConfirmationPreference(confirmationIdentity);

	const slippageRangeId = useId();
	const [localSlippageInput, setLocalSlippageInput] = useState<string | null>(null);
	const slippageInputValue = localSlippageInput ?? String(slippagePercent);
	const parsedSlippage = Number(slippageInputValue);
	const isSlippageValid =
		Number.isFinite(parsedSlippage) &&
		parsedSlippage >= MARKET_ORDER_SLIPPAGE_MIN_PERCENT &&
		parsedSlippage <= MARKET_ORDER_SLIPPAGE_MAX_PERCENT;
	const hasSlippageChange = localSlippageInput !== null && parsedSlippage !== slippagePercent;

	function handleSlippageInputChange(event: ChangeEvent<HTMLInputElement>) {
		setLocalSlippageInput(event.target.value);
	}

	function handleSlippageConfirm() {
		if (!open || !isSlippageValid || !hasSlippageChange) return;
		setMarketOrderSlippagePercent(parsedSlippage);
		setLocalSlippageInput(null);
	}

	function handleSlippageCancel() {
		setLocalSlippageInput(null);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen) return;
		setLocalSlippageInput(null);
		close();
	}

	function handleOrderConfirmationToggle(nextEnabled: boolean) {
		setSkipOrderConfirmation(!nextEnabled);
	}

	function handleTransactionDelayProtectionToggle(nextEnabled: boolean) {
		setTransactionDelayProtection(nextEnabled);
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
			<ModalPopup ref={popupRef} initialFocus={isMobile ? popupRef : undefined} size="sm" closeLabel={t`Close`}>
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
										min={MARKET_ORDER_SLIPPAGE_MIN_PERCENT}
										max={MARKET_ORDER_SLIPPAGE_MAX_PERCENT}
										maxAllowedDecimals={2}
										inputSize="sm"
										mobileSafe
										aria-label={t`Slippage tolerance`}
										aria-describedby={slippageRangeId}
										aria-invalid={!isSlippageValid || undefined}
										className="w-16 text-right tabular-nums max-[1000px]:h-8"
									/>
									<span className="text-xs text-fg-muted">%</span>
								</div>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span id={slippageRangeId} className="text-2xs tabular-nums text-fg-muted">
									{formatNumber(MARKET_ORDER_SLIPPAGE_MIN_PERCENT)}% – {formatNumber(MARKET_ORDER_SLIPPAGE_MAX_PERCENT)}
									%
								</span>
								<div className="flex gap-2">
									<Button
										variant="outline"
										intent="neutral"
										size="xs"
										disabled={localSlippageInput === null}
										onClick={handleSlippageCancel}
									>
										{t`Cancel`}
									</Button>
									<Button size="xs" disabled={!isSlippageValid || !hasSlippageChange} onClick={handleSlippageConfirm}>
										{t`Confirm`}
									</Button>
								</div>
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
							label={t`Transaction delay protection`}
							hint={t`Orders, cancels and other trading actions expire if the exchange has not accepted them within 15 seconds.`}
						>
							<Toggle
								size="xs"
								aria-label={t`Transaction delay protection`}
								checked={transactionDelayProtection}
								onCheckedChange={handleTransactionDelayProtectionToggle}
							/>
						</SettingRow>
						<SettingRow
							label={t`Market close confirmation`}
							hint={t(MARKET_CLOSE_CONFIRMATION_HINTS[confirmationPreference])}
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
						<SettingRow label={t`Order book animations`}>
							<Toggle
								size="xs"
								aria-label={t`Order book animations`}
								checked={animateOrderbook}
								onCheckedChange={setAnimateOrderbook}
							/>
						</SettingRow>
						{!isMobile && (
							<SettingRow label={t`Desktop layout`} hint={t`Page reloads when changed`}>
								<Button variant="outline" intent="neutral" size="xs" onClick={handleDesktopLayoutReset}>
									{t`Reset`}
								</Button>
							</SettingRow>
						)}
					</SettingsGroup>

					{walletExport.visible && (
						<SettingsGroup label={t`Wallet`}>
							<p className="text-xs text-fg-muted">{t`Export your email wallet to use it in another wallet app. Never share your private key.`}</p>
							<Button
								variant="outline"
								intent="neutral"
								size="xs"
								disabled={!walletExport.canExport}
								onClick={() => void walletExport.exportEmailWallet(close)}
							>
								{t`Export email wallet`}
							</Button>
						</SettingsGroup>
					)}
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
					<SettingsGroup label={t`About`}>
						<SettingRow label={t`Version`}>
							<button
								type="button"
								onClick={() => void copyVersion(`${APP_VERSION} ${APP_RELEASE_ID} ${APP_BUILD_COMMIT}`)}
								aria-label={t`Copy version`}
								className="rounded-6 font-mono text-xs text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
							>
								{APP_RELEASE_LABEL}
							</button>
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
