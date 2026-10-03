import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalHeader, ModalTitle, Tooltip } from "@sairn/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	canOpenMarketAssetInfo,
	getMarketAssetReference,
	hasPerpAnnotation,
	type LocalAssetDescriptionId,
	type MarketAssetReference,
} from "@/domain/market/asset-info";
import {
	getSpotAssetSnapshotIdentity,
	getSpotAssetSocials,
	loadSpotAssetDescription,
} from "@/domain/market/spot-asset-info";
import { getPerpDexCoinOpenInterestCap } from "@/domain/trade/open-interest-cap";
import { useIsMobile } from "@/hooks/use-mobile";
import { shortenAddress, useNumberFormat } from "@/lib/format";
import { getExplorerTokenUrl, type UnifiedMarketInfo, useInfo } from "@/lib/hyperliquid";
import { isTestnet } from "@/lib/network";
import { AssetDisplay } from "./asset-display";
import { AssetIconSlotView } from "./asset-icon-slot-view";

const ANNOTATION_STALE_TIME_MS = 30 * 60 * 1_000;
const ANNOTATION_GC_TIME_MS = 60 * 60 * 1_000;
const CONCISE_ANNOTATIONS_STALE_TIME_MS = 5 * 60 * 1_000;
const TOKEN_DETAILS_STALE_TIME_MS = 30 * 60 * 1_000;
const PERP_DEX_LIMITS_STALE_TIME_MS = 5 * 60 * 1_000;
const DISABLED_TOKEN_ID = "0x00000000000000000000000000000000";

interface Props {
	market: UnifiedMarketInfo | undefined;
}

interface MetadataRow {
	id: string;
	label: ReactNode;
	value: ReactNode;
}

interface ExternalLink {
	href: string;
	id: string;
	label: ReactNode;
}

function createLocalDescription(descriptionId: LocalAssetDescriptionId | null): ReactNode {
	switch (descriptionId) {
		case "bitcoin":
			return <Trans>Bitcoin is a decentralized digital asset secured by a proof-of-work network.</Trans>;
		case "ethereum":
			return <Trans>Ethereum is a programmable blockchain for smart contracts and decentralized applications.</Trans>;
		case "hype":
			return <Trans>HYPE is the native token of Hyperliquid.</Trans>;
		case "solana":
			return (
				<Trans>
					Solana is a blockchain for smart contracts and decentralized applications designed for high-throughput
					execution.
				</Trans>
			);
		case "spcxd":
			return (
				// biome-ignore lint/correctness/useUniqueElementIds: This is a Lingui catalog key, not a DOM id.
				<Trans id="market.asset.spcxd.description">
					$SPCXD is a tokenized representation of SpaceX distributed through Dinari's dShares™ infrastructure and the
					first tokenized U.S. equity available for spot trading on HyperCore. $SPCXD tokens on Hyperliquid are wrapped
					dShares™ and are restricted, meaning certain rights associated with the underlying security are frozen. If the
					wallet holding the dShares™ is KYC’ed with Dinari or a partner, those rights can be automatically restored
					with no additional effort by the tokenholder.
				</Trans>
			);
		default:
			return null;
	}
}

function createFallbackDescription(reference: MarketAssetReference | null): ReactNode {
	if (reference?.kind === "spot") {
		return (
			<Trans>
				This spot market trades {reference.baseName} against {reference.quoteName} on Hyperliquid.
			</Trans>
		);
	}
	if (reference?.kind === "perp" && !reference.isBuilder) {
		return <Trans>{reference.coin} is listed as a native Hyperliquid perpetual market.</Trans>;
	}
	return null;
}

function createProviderDescription(reference: MarketAssetReference | null): ReactNode {
	if (reference?.kind === "spot" && reference.localProviderId === "unit") {
		return <Trans>This spot asset is enabled independently by Unit, a third-party provider.</Trans>;
	}
	return null;
}

export function MarketAssetInfo({ market }: Props) {
	const { formatNumber, formatUSD } = useNumberFormat();
	const { i18n, t } = useLingui();
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const reference = getMarketAssetReference(market);
	const localDescription = createLocalDescription(reference?.localDescriptionId ?? null);
	const annotationCoin = reference?.kind === "perp" && reference.localDescriptionId === null ? reference.coin : null;
	const tokenId = reference?.kind === "spot" ? reference.tokenId : null;
	const spotAssetIdentity = getSpotAssetSnapshotIdentity(market);
	const builderDex = market?.kind === "builderPerp" && market.dex ? market.dex : null;

	const conciseAnnotationsQuery = useInfo("perpConciseAnnotations", undefined, {
		enabled: annotationCoin !== null,
		staleTime: CONCISE_ANNOTATIONS_STALE_TIME_MS,
	});
	const annotationAvailable = hasPerpAnnotation(conciseAnnotationsQuery.data, annotationCoin);
	const annotationQuery = useInfo(
		"perpAnnotation",
		{ coin: annotationCoin ?? "" },
		{
			enabled: open && annotationAvailable,
			staleTime: ANNOTATION_STALE_TIME_MS,
			gcTime: ANNOTATION_GC_TIME_MS,
		},
	);
	const tokenDetailsQuery = useInfo(
		"tokenDetails",
		{ tokenId: tokenId ?? DISABLED_TOKEN_ID },
		{
			enabled: open && tokenId !== null,
			staleTime: TOKEN_DETAILS_STALE_TIME_MS,
			gcTime: ANNOTATION_GC_TIME_MS,
		},
	);
	const perpDexLimitsQuery = useInfo(
		"perpDexLimits",
		{ dex: builderDex ?? "" },
		{
			enabled: open && builderDex !== null,
			staleTime: PERP_DEX_LIMITS_STALE_TIME_MS,
			retry: 1,
		},
	);
	const spotDescriptionQuery = useQuery({
		queryKey: [
			"spot-asset-description",
			spotAssetIdentity?.pair,
			spotAssetIdentity?.base,
			spotAssetIdentity?.quote,
			spotAssetIdentity?.baseTokenId,
			spotAssetIdentity?.quoteTokenId,
			i18n.locale,
		],
		queryFn: () => loadSpotAssetDescription(spotAssetIdentity, i18n.locale),
		enabled: open && spotAssetIdentity !== null,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});

	if (!market || !reference) return null;

	const annotation = annotationQuery.data;
	const annotationDescription = annotation?.description.trim() || null;
	const fallbackDescription = createFallbackDescription(reference);
	const spotDescription = spotDescriptionQuery.data;
	const description =
		reference.kind === "spot"
			? ((spotDescription?.kind === "asset" ? spotDescription.text : null) ?? localDescription ?? fallbackDescription)
			: (localDescription ?? annotationDescription ?? fallbackDescription);
	const providerDescription =
		spotDescription?.kind === "provider" ? spotDescription.text : createProviderDescription(reference);
	const spotDescriptionLoading =
		reference.kind === "spot" &&
		spotAssetIdentity !== null &&
		spotDescriptionQuery.isPending &&
		spotDescription === undefined;
	const isBuilderPerp = reference.kind === "perp" && reference.isBuilder;
	const conciseAnnotationsError = isBuilderPerp && conciseAnnotationsQuery.isError;
	const canOpen = canOpenMarketAssetInfo(reference, annotationAvailable || conciseAnnotationsError);
	const annotationMissing =
		isBuilderPerp && annotationAvailable && !annotationQuery.isPending && annotationQuery.data === null;
	const annotationLoading =
		isBuilderPerp && annotationAvailable && annotationQuery.isPending && annotationQuery.data === undefined;
	const annotationError =
		isBuilderPerp && (annotationQuery.isError || conciseAnnotationsError) && annotationQuery.data === undefined;

	function handleAnnotationRetry() {
		if (conciseAnnotationsQuery.isError) {
			void conciseAnnotationsQuery.refetch();
			return;
		}
		void annotationQuery.refetch();
	}
	const tokenDetails = tokenDetailsQuery.data;
	const tokenMetadataLoading =
		reference.kind === "spot" && tokenId !== null && tokenDetailsQuery.isPending && tokenDetails === undefined;
	const tokenMetadataError =
		reference.kind === "spot" && tokenId !== null && tokenDetailsQuery.isError && tokenDetails === undefined;
	const metadataRows: MetadataRow[] = [
		{
			id: "underlying-asset",
			label: <Trans>Underlying asset</Trans>,
			value: reference.kind === "spot" ? reference.baseName : market.shortName || reference.coin,
		},
	];
	if (market.kind !== "spot" && typeof market.maxLeverage === "number") {
		metadataRows.push({
			id: "maximum-leverage",
			label: <Trans>Maximum leverage</Trans>,
			value: `${market.maxLeverage}x`,
		});
	}
	const openInterestCap =
		market.kind === "builderPerp" && !perpDexLimitsQuery.isError
			? getPerpDexCoinOpenInterestCap(perpDexLimitsQuery.data, market.name)
			: null;
	if (openInterestCap !== null) {
		metadataRows.push({
			id: "open-interest-cap",
			label: <Trans>Open interest cap</Trans>,
			value: formatUSD(openInterestCap, { compact: false }),
		});
	}

	const externalLinks: ExternalLink[] = [];
	const spotSocials = getSpotAssetSocials(market);
	if (reference.kind === "spot") {
		if (tokenId) {
			const explorerUrl = getExplorerTokenUrl(tokenId, isTestnet());
			metadataRows.push({
				id: "token-id",
				label: <Trans>Token ID</Trans>,
				value: shortenAddress(tokenId, 6, 6),
			});
			externalLinks.push({
				href: explorerUrl,
				id: "explorer",
				label: <Trans>Explorer</Trans>,
			});
		}
		if (tokenDetails) {
			metadataRows.push(
				{
					id: "circulating-supply",
					label: <Trans>Circulating supply</Trans>,
					value: `${formatNumber(tokenDetails.circulatingSupply, {
						compact: false,
						minimumFractionDigits: 0,
						maximumFractionDigits: 4,
					})} ${reference.baseName}`,
				},
				{
					id: "total-supply",
					label: <Trans>Total supply</Trans>,
					value: `${formatNumber(tokenDetails.totalSupply, {
						compact: false,
						minimumFractionDigits: 0,
						maximumFractionDigits: 4,
					})} ${reference.baseName}`,
				},
				{
					id: "maximum-supply",
					label: <Trans>Maximum supply</Trans>,
					value: `${formatNumber(tokenDetails.maxSupply, {
						compact: false,
						minimumFractionDigits: 0,
						maximumFractionDigits: 4,
					})} ${reference.baseName}`,
				},
			);
			if (tokenDetails.deployer) {
				metadataRows.push({
					id: "deployer",
					label: <Trans>Deployer</Trans>,
					value: shortenAddress(tokenDetails.deployer, 6, 6),
				});
			}
		}
	}
	if (spotSocials?.website) {
		externalLinks.push({ href: spotSocials.website, id: "website", label: <Trans>Website</Trans> });
	}
	if (spotSocials?.x) {
		externalLinks.push({ href: spotSocials.x, id: "x", label: "X" });
	}
	if (spotSocials?.telegram) {
		externalLinks.push({ href: spotSocials.telegram, id: "telegram", label: "Telegram" });
	}

	const marketType =
		market.kind === "spot" ? <Trans>Spot</Trans> : market.kind === "builderPerp" ? "HIP-3" : <Trans>Perp</Trans>;

	const assetIcon = <AssetDisplay coin={market.name} iconUrl={market.iconUrl} hideName iconClassName="size-5" />;

	if (!canOpen) {
		return <AssetIconSlotView icon={assetIcon} interactive={false} aria-label={market.pairName ?? market.name} />;
	}

	return (
		<>
			<Tooltip
				content={<Trans>Click to learn more about this asset.</Trans>}
				side="bottom"
				align="start"
				sideOffset={4}
				delay={300}
				arrow={false}
				className="px-2.5 py-1.5 text-2xs"
			>
				<AssetIconSlotView
					icon={assetIcon}
					interactive
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-label={t`View asset information`}
					onClick={() => setOpen(true)}
				/>
			</Tooltip>

			<AdaptiveModal
				open={open}
				onOpenChange={setOpen}
				size="lg"
				closeLabel={t`Close`}
				presentation={isMobile ? "drawer" : "modal"}
				handleClassName="top-2.5 h-1 w-9 !rounded-[2px] bg-trading-panel-stroke-input"
				overlayClassName="!bg-trading-panel-scrim backdrop-blur-[2px] duration-200"
				className="min-h-[166px] max-h-[calc(100dvh-1rem)] border-trading-panel-stroke-card font-market-close min-[1001px]:min-h-0 min-[1001px]:max-w-[30rem] min-[1001px]:[&>button]:top-[14px] min-[1001px]:[&>button]:right-[14px] min-[1001px]:[&>button]:size-[30px]"
			>
				<ModalHeader divider={false} className="items-center px-12 pt-9 pb-0 min-[1001px]:px-6 min-[1001px]:pt-8">
					<div
						data-testid="market-asset-info-header"
						className="flex min-w-0 max-w-full flex-col items-center gap-3 text-center"
					>
						<span data-testid="market-asset-info-icon" className="inline-flex size-14 items-center justify-center">
							<AssetDisplay coin={market.name} iconUrl={market.iconUrl} hideName iconClassName="size-14" />
						</span>
						<div className="flex min-w-0 max-w-full flex-col items-center gap-1.5">
							<div className="flex min-w-0 max-w-full items-center justify-center gap-2">
								<ModalTitle className="truncate text-[18px] leading-6 font-bold text-trading-panel-fg">
									{market.pairName}
								</ModalTitle>
								<span
									className={
										market.kind === "spot"
											? "shrink-0 whitespace-nowrap rounded-[4px] bg-trading-panel-success-soft px-1.5 py-0.5 text-3xs leading-3 font-semibold text-trading-panel-success"
											: "shrink-0 whitespace-nowrap rounded-[4px] bg-trading-panel-hover px-1.5 py-0.5 text-3xs leading-3 font-semibold text-trading-panel-muted"
									}
								>
									{marketType}
								</span>
								{market.kind !== "spot" && typeof market.maxLeverage === "number" ? (
									<span className="shrink-0 whitespace-nowrap rounded-[4px] bg-trading-panel-hover px-1.5 py-0.5 text-3xs leading-3 font-semibold text-trading-panel-muted tabular-nums">
										{market.maxLeverage}x
									</span>
								) : null}
							</div>
							{reference.kind === "spot" && reference.fullName ? (
								<p className="max-w-full truncate text-xs text-trading-panel-muted">{reference.fullName}</p>
							) : null}
						</div>
					</div>
					<ModalDescription className="sr-only">
						<Trans>Market and token information from local references and Hyperliquid metadata.</Trans>
					</ModalDescription>
				</ModalHeader>

				<ModalContent className="space-y-4 px-6 pt-4 pb-6">
					{!spotDescriptionLoading && (description || providerDescription) ? (
						<div className="space-y-3 text-2sm leading-[1.65] text-trading-panel-muted text-pretty">
							{description ? <p className="whitespace-pre-wrap">{description}</p> : null}
							{providerDescription ? <p>{providerDescription}</p> : null}
						</div>
					) : null}

					{spotDescriptionLoading || annotationLoading ? (
						<p className="text-xs leading-5 text-trading-panel-muted" aria-live="polite">
							<Trans>Loading asset information...</Trans>
						</p>
					) : null}

					{annotationMissing ? (
						<p className="text-xs leading-5 text-trading-panel-muted">
							<Trans>No description has been provided for this market.</Trans>
						</p>
					) : null}

					{annotationError ? (
						<div className="space-y-3" role="alert">
							<p className="text-xs leading-5 text-error">
								<Trans>Asset information could not be loaded.</Trans>
							</p>
							<Button type="button" size="xs" variant="outline" intent="neutral" onClick={handleAnnotationRetry}>
								<Trans>Retry</Trans>
							</Button>
						</div>
					) : null}

					{annotationDescription && market.kind === "builderPerp" ? (
						<p className="border-t border-trading-panel-stroke-row pt-3 text-2xs leading-4 text-trading-panel-muted">
							<Trans>
								This description was supplied by the third-party market deployer. Treat it as unverified information.
							</Trans>
						</p>
					) : null}

					{metadataRows.length > 0 ? (
						<dl data-testid="market-asset-info-card" className="flex flex-col gap-2 py-3">
							{metadataRows.map((row) => (
								<div key={row.id} className="flex items-start justify-between gap-4 text-xs">
									<dt className="shrink-0 whitespace-nowrap text-trading-panel-muted">{row.label}</dt>
									<dd
										title={
											typeof row.value === "string" || typeof row.value === "number" ? String(row.value) : undefined
										}
										className="min-w-0 max-w-[65%] whitespace-normal text-right font-semibold text-trading-panel-fg tabular-nums [overflow-wrap:anywhere]"
									>
										<bdi dir="ltr">{row.value}</bdi>
									</dd>
								</div>
							))}
						</dl>
					) : null}

					{tokenMetadataLoading ? (
						<p className="text-xs leading-5 text-trading-panel-muted" aria-live="polite">
							<Trans>Loading token metadata...</Trans>
						</p>
					) : null}

					{tokenMetadataError ? (
						<div className="space-y-3" role="alert">
							<p className="text-xs leading-5 text-error">
								<Trans>Token metadata could not be loaded.</Trans>
							</p>
							<Button
								type="button"
								size="xs"
								variant="outline"
								intent="neutral"
								onClick={() => void tokenDetailsQuery.refetch()}
							>
								<Trans>Retry</Trans>
							</Button>
						</div>
					) : null}

					{externalLinks.length > 0 ? (
						<div data-testid="market-asset-info-links" className="flex flex-wrap justify-center gap-x-3 gap-y-2">
							{externalLinks.map((link) => (
								<a
									key={link.id}
									href={link.href}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 whitespace-nowrap border-b border-dashed border-trading-panel-stroke-control text-xs font-semibold text-trading-panel-fg transition-colors duration-[120ms] hover:text-trading-panel-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trading-panel-focus motion-reduce:transition-none min-[1001px]:min-h-0 min-[1001px]:min-w-0"
								>
									{link.label}
									<ArrowSquareOutIcon className="size-3 shrink-0" aria-hidden />
								</a>
							))}
						</div>
					) : null}
				</ModalContent>
			</AdaptiveModal>
		</>
	);
}
