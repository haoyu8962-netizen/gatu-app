import { Modal, ModalPopup, ModalTitle } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CheckIcon, CopyIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { APP_NAME } from "@/config/app";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatDateTime, formatPercent, formatQuoteAmount, szDecimalsToPriceDecimals } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import {
	buildPositionPnlShareUrl,
	createPositionPnlShareQrDataUrl,
	downloadPositionPnlSharePng,
	readPositionPnlSharePalette,
	renderPositionPnlSharePng,
	sharePositionPnlPng,
} from "@/lib/trade/position-pnl-share";
import type { PositionPnlShareData } from "./position-dialog-types";

interface PositionPnlShareModalProps {
	position: PositionPnlShareData | null;
	onOpenChange: (open: boolean) => void;
}

interface PositionPnlShareDialogProps {
	position: PositionPnlShareData;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const DIALOG_EXIT_MS = 250;

interface QrState {
	shareUrl: string;
	dataUrl: string;
}

export function PositionPnlShareModal({ position, onOpenChange }: PositionPnlShareModalProps) {
	const displayedPosition = useLingeringValue(position, DIALOG_EXIT_MS);
	if (!displayedPosition) return null;
	return <PositionPnlShareDialog position={displayedPosition} open={position !== null} onOpenChange={onOpenChange} />;
}

function PositionPnlShareDialog({ position, open, onOpenChange }: PositionPnlShareDialogProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const { copied, copy } = useCopyToClipboard(1500);
	const [qrState, setQrState] = useState<QrState | null>(null);
	const [failedQrUrl, setFailedQrUrl] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const saveOperationRef = useRef({ epoch: 0, mounted: true });
	const isTestnet = position.env === "Testnet";
	const networkLabel = isTestnet ? t`Testnet` : null;
	const marketLabel = position.dex ? `${position.symbol} · ${position.dex}` : position.symbol;
	const shareUrl =
		isTestnet || typeof window === "undefined" ? null : buildPositionPnlShareUrl(window.location.href, position.coin);
	const qrDataUrl = qrState?.shareUrl === shareUrl ? qrState.dataUrl : null;
	const qrUnavailable = !shareUrl || failedQrUrl === shareUrl;
	const positionSize = toBig(position.signedPositionSize);
	const pnl = toBig(position.unrealizedPnl);
	const isLong = positionSize?.gt(0) ?? false;
	const isProfit = pnl?.gte(0) ?? true;
	const directionLabel = isLong ? t`Long` : t`Short`;
	const timestamp = formatDateTime(position.capturedAtMs, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const roeLabel = t`Return on equity (ROE)`;
	const roeValue = formatPercent(position.returnOnEquity, 1);
	const pnlValue = formatQuoteAmount(position.unrealizedPnl, position.quoteSymbol, {
		decimals: 2,
		compact: false,
		signDisplay: "exceptZero",
	});
	const entryLabel = t`Entry Price`;
	const priceDecimals = szDecimalsToPriceDecimals(position.szDecimals);
	const entryValue = formatQuoteAmount(position.entryPx, position.quoteSymbol, {
		decimals: priceDecimals,
		compact: false,
	});
	const markLabel = t`Mark Price`;
	const markValue = formatQuoteAmount(position.markPx, position.quoteSymbol, {
		decimals: priceDecimals,
		compact: false,
	});
	const pnlToneClass = isProfit ? "text-position-share-profit" : "text-position-share-loss";

	useEffect(() => {
		saveOperationRef.current.mounted = true;
		return () => {
			saveOperationRef.current = { epoch: saveOperationRef.current.epoch + 1, mounted: false };
		};
	}, []);

	useEffect(() => {
		if (open) return;
		saveOperationRef.current.epoch += 1;
		setIsSaving(false);
	}, [open]);

	useEffect(() => {
		let cancelled = false;
		if (!shareUrl) return;

		try {
			const palette = readPositionPnlSharePalette();
			void createPositionPnlShareQrDataUrl(shareUrl, palette)
				.then((dataUrl) => {
					if (!cancelled) {
						setQrState({ shareUrl, dataUrl });
						setFailedQrUrl(null);
					}
				})
				.catch(() => {
					if (!cancelled) setFailedQrUrl(shareUrl);
				});
		} catch {
			setFailedQrUrl(shareUrl);
		}

		return () => {
			cancelled = true;
		};
	}, [shareUrl]);

	async function handleSaveImage() {
		if (isSaving || (!isTestnet && !shareUrl)) return;
		const operationEpoch = saveOperationRef.current.epoch + 1;
		saveOperationRef.current.epoch = operationEpoch;
		setIsSaving(true);
		try {
			const palette = readPositionPnlSharePalette();
			const exportQrDataUrl = shareUrl
				? (qrDataUrl ?? (await createPositionPnlShareQrDataUrl(shareUrl, palette)))
				: null;
			if (!isSaveOperationCurrent(saveOperationRef.current, operationEpoch)) return;
			const fontFamily = getComputedStyle(document.body).fontFamily;
			const blob = await renderPositionPnlSharePng(
				{
					brand: APP_NAME.toLocaleUpperCase(),
					timestamp,
					symbol: marketLabel,
					directionLabel: `${directionLabel} ${position.leverage}x`,
					directionTone: isLong ? "long" : "short",
					roeLabel,
					roeValue,
					pnlValue,
					pnlTone: isProfit ? "profit" : "loss",
					entryLabel,
					entryValue,
					markLabel,
					markValue,
					networkLabel: networkLabel ?? undefined,
					fontFamily,
				},
				palette,
				exportQrDataUrl,
			);
			if (!isSaveOperationCurrent(saveOperationRef.current, operationEpoch)) return;
			const filename = `${APP_NAME}-${position.coin}-pnl-${new Date(position.capturedAtMs).toISOString()}.png`;
			const shared = isMobile ? await sharePositionPnlPng(blob, filename) : false;
			if (!isSaveOperationCurrent(saveOperationRef.current, operationEpoch)) return;
			if (!shared) downloadPositionPnlSharePng(blob, filename);
			toast.success(t`Share image saved`);
		} catch (error) {
			if (
				isSaveOperationCurrent(saveOperationRef.current, operationEpoch) &&
				!(error instanceof DOMException && error.name === "AbortError")
			) {
				toast.error(t`Failed to save share image`);
			}
		} finally {
			if (isSaveOperationCurrent(saveOperationRef.current, operationEpoch)) setIsSaving(false);
		}
	}

	function handleCopyLink() {
		if (shareUrl) void copy(shareUrl);
	}

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup
				size="sm"
				showClose={false}
				overlayClassName="!bg-scrim/60 !backdrop-blur-none"
				className="font-market-close !w-[calc(100vw-2rem)] !max-w-[360px] shrink-0 !overflow-visible !rounded-none !bg-transparent !shadow-none min-[1001px]:!w-[360px]"
				data-testid="position-pnl-share-modal"
			>
				<ModalTitle className="sr-only">{t`Share PNL`}</ModalTitle>
				<div className="flex w-full flex-col gap-2.5 min-[1001px]:gap-3">
					<article
						aria-label={t`PNL share card for ${position.symbol}`}
						className="flex w-full flex-col gap-3.5 rounded-[16px] bg-position-share-card px-5 pt-5 pb-4 text-position-share-fg min-[1001px]:gap-[18px] min-[1001px]:px-[26px] min-[1001px]:pt-[26px] min-[1001px]:pb-5"
					>
						<header className="flex items-center justify-between gap-3">
							<div className="flex min-w-0 items-center gap-2">
								<span className="truncate text-xs leading-[17px] font-bold tracking-[2px] min-[1001px]:text-sm min-[1001px]:leading-5">
									{APP_NAME.toLocaleUpperCase()}
								</span>
								{networkLabel ? (
									<span className="shrink-0 rounded-[4px] border border-position-share-outline px-1.5 py-0.5 text-[9px] leading-3 font-bold tracking-wide text-position-share-fg">
										{networkLabel}
									</span>
								) : null}
							</div>
							<time
								dateTime={new Date(position.capturedAtMs).toISOString()}
								className="whitespace-nowrap text-[10px] leading-[14px] text-position-share-muted tabular-nums min-[1001px]:text-[11px] min-[1001px]:leading-4"
							>
								{timestamp}
							</time>
						</header>

						<div className="flex min-w-0 items-center gap-2">
							<span className="min-w-0 overflow-hidden text-[15px] leading-5 font-bold text-ellipsis whitespace-nowrap min-[1001px]:text-base min-[1001px]:leading-[22px]">
								{position.symbol}
							</span>
							{position.dex ? (
								<span className="shrink-0 rounded-[4px] border border-position-share-outline px-1.5 py-0.5 text-[9px] leading-3 font-semibold text-position-share-muted">
									{position.dex}
								</span>
							) : null}
							<span
								className={cn(
									"shrink-0 rounded-[4px] px-2 py-0.5 text-[11px] leading-4 font-bold whitespace-nowrap text-position-share-fg",
									isLong ? "bg-position-share-long" : "bg-position-share-short",
								)}
							>
								{directionLabel} {position.leverage}x
							</span>
						</div>

						<div className="flex flex-col gap-0.5">
							<span className="text-[10px] leading-[14px] text-position-share-muted min-[1001px]:text-[11px] min-[1001px]:leading-4">
								{roeLabel}
							</span>
							<strong
								className={cn(
									"text-[32px] leading-[1.1] font-bold tabular-nums min-[1001px]:text-[40px]",
									pnlToneClass,
								)}
							>
								{roeValue}
							</strong>
							<span
								className={cn(
									"text-[13px] leading-[18px] font-semibold tabular-nums min-[1001px]:text-sm min-[1001px]:leading-5",
									pnlToneClass,
								)}
							>
								{pnlValue}
							</span>
						</div>

						<div className="flex min-w-0 items-start gap-[18px] border-t border-position-share-divider pt-3 min-[1001px]:gap-6 min-[1001px]:pt-3.5">
							<SharePrice label={entryLabel} value={entryValue} />
							<SharePrice label={markLabel} value={markValue} />
							<div className="ms-auto grid size-[38px] shrink-0 place-items-center overflow-hidden rounded-[6px] bg-position-share-fg min-[1001px]:size-11">
								{qrDataUrl ? (
									<img src={qrDataUrl} alt={t`QR code linking to ${position.symbol} market`} className="size-full" />
								) : isTestnet ? (
									<span
										role="img"
										aria-label={t`Testnet preview; market link disabled`}
										className="px-1 text-center text-[7px] leading-3 font-bold tracking-wide text-position-share-card min-[1001px]:text-[8px]"
									>
										{t`Testnet`}
									</span>
								) : (
									<span
										role="img"
										aria-label={qrUnavailable ? t`QR unavailable` : t`Loading QR code`}
										className="text-[7px] font-semibold tracking-wide text-position-share-muted min-[1001px]:text-[8px]"
									>
										QR
									</span>
								)}
							</div>
						</div>
					</article>

					<div className="grid grid-cols-2 gap-2 min-[1001px]:grid-cols-3">
						<button
							type="button"
							onClick={() => void handleSaveImage()}
							disabled={isSaving || (!isTestnet && !shareUrl)}
							aria-busy={isSaving}
							className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-position-share-fg px-2 text-xs font-bold whitespace-nowrap text-position-share-card transition-all duration-[120ms] min-[1001px]:min-h-10 min-[1001px]:text-[13px] min-[1001px]:hover:bg-position-share-button-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:opacity-50"
						>
							<DownloadSimpleIcon aria-hidden="true" className="size-3.5" weight="bold" />
							{isSaving ? t`Saving...` : t`Save image`}
						</button>
						<button
							type="button"
							onClick={handleCopyLink}
							disabled={!shareUrl}
							aria-label={t`Copy a link that opens the ${position.symbol} market`}
							className="hidden min-h-10 items-center justify-center gap-1.5 rounded-[10px] bg-position-share-fg px-2 text-[13px] font-bold whitespace-nowrap text-position-share-card transition-all duration-[120ms] min-[1001px]:inline-flex min-[1001px]:hover:bg-position-share-button-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:opacity-50"
						>
							{copied ? (
								<CheckIcon aria-hidden="true" className="size-3.5" weight="bold" />
							) : (
								<CopyIcon aria-hidden="true" className="size-3.5" weight="bold" />
							)}
							{copied ? t`Copied` : t`Copy link`}
						</button>
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-position-share-outline bg-transparent px-2 text-xs font-semibold whitespace-nowrap text-position-share-fg transition-all duration-[120ms] min-[1001px]:min-h-10 min-[1001px]:text-[13px] min-[1001px]:hover:bg-position-share-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
						>
							{t`Close`}
						</button>
					</div>
				</div>
			</ModalPopup>
		</Modal>
	);
}

function SharePrice({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="overflow-hidden text-[9px] leading-[13px] text-ellipsis whitespace-nowrap text-position-share-muted min-[1001px]:text-[10px] min-[1001px]:leading-[14px]">
				{label}
			</div>
			<div className="overflow-hidden text-xs leading-[17px] font-semibold text-ellipsis whitespace-nowrap text-position-share-fg tabular-nums min-[1001px]:text-[13px] min-[1001px]:leading-[18px]">
				{value}
			</div>
		</div>
	);
}

function isSaveOperationCurrent(operation: { epoch: number; mounted: boolean }, expectedEpoch: number): boolean {
	return operation.mounted && operation.epoch === expectedEpoch;
}
