import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalHeader, ModalTitle, Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	canOpenMarketAssetInfo,
	getMarketAssetReference,
	hasPerpAnnotation,
	type LocalAssetDescriptionId,
	type MarketAssetReference,
} from "@/domain/market/asset-info";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatNumber, shortenAddress } from "@/lib/format";
import { getExplorerTokenUrl, type UnifiedMarketInfo, useInfo } from "@/lib/hyperliquid";
import { isTestnet } from "@/lib/network";
import { AssetDisplay } from "./asset-display";

const ANNOTATION_STALE_TIME_MS = 30 * 60 * 1_000;
const ANNOTATION_GC_TIME_MS = 60 * 60 * 1_000;
const CONCISE_ANNOTATIONS_STALE_TIME_MS = 5 * 60 * 1_000;
const TOKEN_DETAILS_STALE_TIME_MS = 30 * 60 * 1_000;
const DISABLED_TOKEN_ID = "0x00000000000000000000000000000000";

interface Props {
	market: UnifiedMarketInfo | undefined;
}

interface MetadataRow {
	id: string;
	label: ReactNode;
	value: ReactNode;
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
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const reference = getMarketAssetReference(market);
	const localDescription = createLocalDescription(reference?.localDescriptionId ?? null);
	const annotationCoin = reference?.kind === "perp" && reference.localDescriptionId === null ? reference.coin : null;
	const tokenId = reference?.kind === "spot" ? reference.tokenId : null;

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

	if (!market || !reference) return null;

	const annotation = annotationQuery.data;
	const annotationDescription = annotation?.description.trim() || null;
	const fallbackDescription = createFallbackDescription(reference);
	const description = localDescription ?? annotationDescription ?? fallbackDescription;
	const providerDescription = createProviderDescription(reference);
	const canOpen = canOpenMarketAssetInfo(reference, annotationAvailable);
	const annotationUnavailable =
		reference.kind === "perp" &&
		reference.isBuilder &&
		annotationAvailable &&
		!annotationQuery.isPending &&
		annotationQuery.data === null;
	const annotationLoading =
		reference.kind === "perp" &&
		reference.isBuilder &&
		annotationAvailable &&
		annotationQuery.isPending &&
		annotationQuery.data === undefined;
	const annotationError =
		reference.kind === "perp" && reference.isBuilder && annotationQuery.isError && annotationQuery.data === undefined;
	const tokenDetails = tokenDetailsQuery.data;
	const tokenMetadataLoading =
		reference.kind === "spot" && tokenId !== null && tokenDetailsQuery.isPending && tokenDetails === undefined;
	const tokenMetadataError =
		reference.kind === "spot" && tokenId !== null && tokenDetailsQuery.isError && tokenDetails === undefined;
	const metadataRows: MetadataRow[] = [];
	if (reference.kind === "spot") {
		if (tokenId) {
			metadataRows.push({
				id: "token-id",
				label: <Trans>Token ID</Trans>,
				value: (
					<a
						href={getExplorerTokenUrl(tokenId, isTestnet())}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-brand transition-colors hover:text-brand/80"
					>
						{shortenAddress(tokenId, 6, 6)}
						<ArrowSquareOutIcon className="size-3 shrink-0" aria-hidden />
					</a>
				),
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

	const assetIcon = <AssetDisplay coin={market.name} iconUrl={market.iconUrl} hideName iconClassName="size-5" />;

	if (!canOpen) {
		return <span className="inline-flex size-8 shrink-0 items-center justify-center">{assetIcon}</span>;
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
				<button
					type="button"
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-label={t`View asset information`}
					onClick={() => setOpen(true)}
					className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 text-fg transition-colors duration-150 hover:bg-fill-hover active:bg-fill-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none"
				>
					{assetIcon}
				</button>
			</Tooltip>

			<AdaptiveModal
				open={open}
				onOpenChange={setOpen}
				size="lg"
				presentation={isMobile ? "drawer" : "modal"}
				overlayClassName="backdrop-blur-[2px] duration-100"
				className="max-h-[calc(100dvh-1rem)] rounded-t-16 !shadow-none min-[1001px]:max-w-[32.5rem] min-[1001px]:rounded-16"
			>
				<ModalHeader divider={false} className="px-6 pt-5 pb-3">
					<div className="flex min-w-0 items-center gap-3 pr-8">
						<AssetDisplay coin={market.name} iconUrl={market.iconUrl} hideName iconClassName="size-10" />
						<div className="min-w-0">
							<ModalTitle className="truncate text-lg font-normal">{market.pairName}</ModalTitle>
							{reference.kind === "spot" && reference.fullName ? (
								<p className="mt-1 truncate text-xs text-fg-muted">{reference.fullName}</p>
							) : null}
						</div>
					</div>
					<ModalDescription className="sr-only">
						<Trans>Market and token information from local references and Hyperliquid metadata.</Trans>
					</ModalDescription>
				</ModalHeader>

				<ModalContent className="space-y-4 px-6 pt-0 pb-6">
					{description || providerDescription ? (
						<div className="space-y-3 text-xs leading-5 text-fg-muted">
							{description ? <p className="whitespace-pre-wrap">{description}</p> : null}
							{providerDescription ? <p>{providerDescription}</p> : null}
						</div>
					) : null}

					{annotationLoading ? (
						<p className="text-xs leading-5 text-fg-muted" aria-live="polite">
							<Trans>Loading asset information...</Trans>
						</p>
					) : null}

					{annotationError || annotationUnavailable ? (
						<div className="space-y-3" role="alert">
							<p className="text-xs leading-5 text-error">
								{annotationUnavailable ? (
									<Trans>Asset information is temporarily unavailable.</Trans>
								) : (
									<Trans>Asset information could not be loaded.</Trans>
								)}
							</p>
							<Button
								type="button"
								size="xs"
								variant="outline"
								intent="neutral"
								onClick={() => void annotationQuery.refetch()}
							>
								<Trans>Retry</Trans>
							</Button>
						</div>
					) : null}

					{annotationDescription && market.kind === "builderPerp" ? (
						<p className="border-t border-stroke-weak pt-3 text-2xs leading-4 text-fg-muted">
							<Trans>
								This description was supplied by the third-party market deployer. Treat it as unverified information.
							</Trans>
						</p>
					) : null}

					{metadataRows.length > 0 ? (
						<dl className="divide-y divide-stroke-weak rounded-xs border border-stroke-weak">
							{metadataRows.map((row) => (
								<div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 px-3 py-2.5">
									<dt className="text-xs text-fg-muted">{row.label}</dt>
									<dd className="min-w-0 break-words text-right text-xs tabular-nums text-fg">{row.value}</dd>
								</div>
							))}
						</dl>
					) : null}

					{tokenMetadataLoading ? (
						<p className="text-xs leading-5 text-fg-muted" aria-live="polite">
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
				</ModalContent>
			</AdaptiveModal>
		</>
	);
}
