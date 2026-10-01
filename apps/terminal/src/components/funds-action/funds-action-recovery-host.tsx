import { Trans, useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { AdaptiveModal, Button, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@sairn/ui";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { zeroAddress } from "viem";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { useIsMobile } from "@/hooks/use-mobile";
import { STATUS_GLYPH_UNKNOWN } from "@/lib/brand/status-glyph.gen";
import { formatDateTime } from "@/lib/format";
import { useActiveAgentOwner, useHyperliquid, useInfo } from "@/lib/hyperliquid";
import {
	clearCorruptFundsActionMarkerStorageSafely,
	type FundsActionReference,
	removeFundsActionMarkerSafely,
	resolveFundsActionRecoveryOwner,
	useFundsActionMarkerStorageStatus,
	useFundsActionMarkers,
} from "./funds-action-marker";
import {
	getFundsActionHistoryStartTime,
	reconcileStakingFundsAction,
	reconcileVaultFundsAction,
} from "./funds-action-reconciliation";
import { FundsRecoveryNotification } from "./funds-recovery-notification";

export function FundsActionRecoveryHost() {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const { clientKey, env, sessionMode } = useHyperliquid();
	const activeAgentOwner = useActiveAgentOwner();
	const markers = useFundsActionMarkers();
	const storageStatus = useFundsActionMarkerStorageStatus();
	const [detailsIdentity, setDetailsIdentity] = useState<string | null>(null);
	const [confirmClearMarkerId, setConfirmClearMarkerId] = useState<string | null>(null);
	const walletOwner = clientKey === "disconnected" ? undefined : clientKey;
	const owner = resolveFundsActionRecoveryOwner({ sessionMode, env, activeAgentOwner, fallbackOwner: walletOwner });
	const marker = owner
		? markers.find((candidate) => candidate.env === env && candidate.owner.toLowerCase() === owner.toLowerCase())
		: undefined;
	const queryOwner = marker?.owner ?? zeroAddress;
	const vaultHistory = useInfo(
		"userNonFundingLedgerUpdates",
		{ user: queryOwner, startTime: getFundsActionHistoryStartTime(marker?.startedAt ?? 0) },
		{ enabled: marker?.method === "vaultTransfer", retry: false, refetchInterval: 5_000 },
	);
	const stakingHistory = useInfo(
		"delegatorHistory",
		{ user: queryOwner },
		{ enabled: Boolean(marker && marker.method !== "vaultTransfer"), retry: false, refetchInterval: 5_000 },
	);
	const matchedHistory = useMemo(() => {
		if (!marker) return null;
		return marker.method === "vaultTransfer"
			? reconcileVaultFundsAction(marker, vaultHistory.data)
			: reconcileStakingFundsAction(marker, stakingHistory.data);
	}, [marker, stakingHistory.data, vaultHistory.data]);

	if (storageStatus === "corrupt") return <CorruptMarkerRecovery />;
	if (!marker) return null;
	const activeMarker = marker;
	const confirmClear = confirmClearMarkerId === activeMarker.id;
	const markerIdentity = `${activeMarker.env}:${activeMarker.owner.toLowerCase()}`;
	const detailsOpen = detailsIdentity === markerIdentity;
	const setDetailsOpen = (open: boolean) => setDetailsIdentity(open ? markerIdentity : null);

	async function clearMarker() {
		if (confirmClearMarkerId !== activeMarker.id) {
			setConfirmClearMarkerId(activeMarker.id);
			return;
		}
		if (await removeFundsActionMarkerSafely(activeMarker.id)) {
			setConfirmClearMarkerId(null);
			setDetailsOpen(false);
		}
	}

	return (
		<>
			<FundsRecoveryNotification notificationId={`funds-recovery:${activeMarker.id}`}>
				{/* biome-ignore lint/a11y/useSemanticElements: output cannot contain the block content and review action in this status toast. */}
				<div
					role="status"
					className="flex w-full items-center gap-3 rounded-12 border border-stroke-warning-strong bg-overlay p-3 shadow-overlay"
				>
					<StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} size={20} />
					<div className="min-w-0">
						<p className="text-xs font-bold text-fg">
							<Trans>Pending funds operation</Trans>
						</p>
						<p className="truncate text-2xs text-fg-muted">
							<FundsActionLabel marker={activeMarker} /> · {activeMarker.displayAmount} {activeMarker.asset}
						</p>
					</div>
					<Button size="xs" variant="outline" intent="neutral" onClick={() => setDetailsOpen(true)}>
						<Trans>Review</Trans>
					</Button>
				</div>
			</FundsRecoveryNotification>
			<AdaptiveModal
				open={detailsOpen}
				onOpenChange={(open) => {
					setDetailsOpen(open);
					if (!open) setConfirmClearMarkerId(null);
				}}
				size="sm"
				presentation={isMobile ? "drawer" : "modal"}
				layer="blocking"
				closeLabel={t`Close pending operation details`}
			>
				<ModalHeader>
					<ModalTitle>
						<Trans>Pending operation needs verification</Trans>
					</ModalTitle>
				</ModalHeader>
				<ModalContent className="space-y-4">
					<p className="text-xs leading-5 text-fg-muted">
						<Trans>
							The prior request may have reached Hyperliquid. Do not submit it again. Open the related page to continue
							read-only reconciliation.
						</Trans>
					</p>
					{!activeMarker.historyBaseline || !activeMarker.stateBaseline ? (
						<p role="alert" className="rounded-16 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
							<Trans>
								This record predates baseline verification. It cannot be completed automatically. Verify account history
								and state independently before clearing it.
							</Trans>
						</p>
					) : matchedHistory ? (
						<output className="block rounded-16 bg-success-soft px-3 py-2 text-xs leading-5 text-success">
							<Trans>
								A new exact history event matches this request. Open the related page to verify fresh account state; the
								record remains locked until both checks pass.
							</Trans>
						</output>
					) : null}
					<dl className="divide-y divide-stroke-weak rounded-12 border border-stroke-weak px-3 text-xs">
						<RecoveryRow label={t`Network`} value={<NetworkLabel env={activeMarker.env} />} />
						<RecoveryRow label={t`Owner`} value={activeMarker.owner} />
						<RecoveryRow label={t`SDK method`} value={activeMarker.method} />
						<RecoveryRow label={t`Direction`} value={<FundsDirectionLabel direction={activeMarker.direction} />} />
						<RecoveryRow label={t`Target`} value={activeMarker.target} />
						<RecoveryRow label={t`Amount`} value={`${activeMarker.displayAmount} ${activeMarker.asset}`} />
						<RecoveryRow label={t`Atomic amount`} value={activeMarker.atomicAmount} />
						<RecoveryRow label={t`Atomic decimals`} value={String(activeMarker.atomicDecimals)} />
						<RecoveryRow label={t`Started`} value={formatDateTime(activeMarker.startedAt)} />
						<RecoveryRow label={t`Identity epoch`} value={activeMarker.identityEpoch} />
					</dl>
					{confirmClear ? (
						<p role="alert" className="rounded-16 bg-error-soft px-3 py-2 text-xs leading-5 text-error">
							<Trans>
								Clearing this record does not cancel the on-chain operation. Verify account history independently before
								submitting the same action again.
							</Trans>
						</p>
					) : null}
				</ModalContent>
				<ModalFooter className="flex-wrap">
					<Button type="button" variant="outline" intent="error" onClick={() => void clearMarker()}>
						{confirmClear ? <Trans>Confirm clear record</Trans> : <Trans>Clear record</Trans>}
					</Button>
					{activeMarker.method === "vaultTransfer" ? (
						<Button
							render={<Link to="/vaults/$vaultAddress" params={{ vaultAddress: activeMarker.target }} />}
							onClick={() => setDetailsOpen(false)}
						>
							<Trans>Open related page</Trans>
						</Button>
					) : (
						<Button render={<Link to="/staking" />} onClick={() => setDetailsOpen(false)}>
							<Trans>Open related page</Trans>
						</Button>
					)}
				</ModalFooter>
			</AdaptiveModal>
		</>
	);
}

function CorruptMarkerRecovery() {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [confirmClear, setConfirmClear] = useState(false);

	async function clearStorage() {
		if (!confirmClear) {
			setConfirmClear(true);
			return;
		}
		if (await clearCorruptFundsActionMarkerStorageSafely()) {
			setConfirmClear(false);
			setDetailsOpen(false);
		}
	}

	return (
		<>
			<FundsRecoveryNotification notificationId="funds-recovery:corrupt">
				<div
					role="alert"
					className="flex w-full items-center gap-3 rounded-12 border border-stroke-error-strong bg-overlay p-3 shadow-overlay"
				>
					<WarningCircleIcon className="size-5 shrink-0 text-error" weight="fill" />
					<div className="min-w-0">
						<p className="text-xs font-bold text-fg">
							<Trans>Funds operation record unreadable</Trans>
						</p>
						<p className="truncate text-2xs text-fg-muted">
							<Trans>New funds actions are locked until this record is resolved.</Trans>
						</p>
					</div>
					<Button size="xs" variant="outline" intent="neutral" onClick={() => setDetailsOpen(true)}>
						<Trans>Review</Trans>
					</Button>
				</div>
			</FundsRecoveryNotification>
			<AdaptiveModal
				open={detailsOpen}
				onOpenChange={(open) => {
					setDetailsOpen(open);
					if (!open) setConfirmClear(false);
				}}
				size="sm"
				presentation={isMobile ? "drawer" : "modal"}
				layer="blocking"
				closeLabel={t`Close unreadable operation details`}
			>
				<ModalHeader>
					<ModalTitle>
						<Trans>Funds operation record cannot be read</Trans>
					</ModalTitle>
				</ModalHeader>
				<ModalContent className="space-y-4">
					<p className="text-xs leading-5 text-fg-muted">
						<Trans>
							The saved record is malformed or browser storage is unavailable. It may represent a request that reached
							Hyperliquid, so the application will not overwrite it or enable another funds action.
						</Trans>
					</p>
					{confirmClear ? (
						<p role="alert" className="rounded-16 bg-error-soft px-3 py-2 text-xs leading-5 text-error">
							<Trans>
								Clearing unreadable storage does not cancel any on-chain operation. Independently verify every account
								history before confirming.
							</Trans>
						</p>
					) : null}
				</ModalContent>
				<ModalFooter>
					<Button type="button" variant="outline" intent="error" onClick={() => void clearStorage()}>
						{confirmClear ? <Trans>Confirm clear unreadable record</Trans> : <Trans>Clear unreadable record</Trans>}
					</Button>
				</ModalFooter>
			</AdaptiveModal>
		</>
	);
}

function RecoveryRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2">
			<dt className="text-fg-muted">{label}</dt>
			<dd className="max-w-[var(--funds-action-value-max)] break-all text-right font-mono font-semibold text-fg">
				{value}
			</dd>
		</div>
	);
}

function FundsActionLabel({ marker }: { marker: FundsActionReference }) {
	if (marker.method === "vaultTransfer") {
		return marker.direction === "deposit" ? <Trans>Vault deposit</Trans> : <Trans>Vault withdrawal</Trans>;
	}
	return marker.direction === "deposit" ? (
		<Trans>Staking deposit</Trans>
	) : marker.direction === "withdraw" ? (
		<Trans>Staking withdrawal</Trans>
	) : marker.direction === "delegate" ? (
		<Trans>Delegation</Trans>
	) : (
		<Trans>Undelegation</Trans>
	);
}

function FundsDirectionLabel({ direction }: { direction: FundsActionReference["direction"] }) {
	if (direction === "deposit") return <Trans>Deposit</Trans>;
	if (direction === "withdraw") return <Trans>Withdraw</Trans>;
	if (direction === "delegate") return <Trans>Delegate</Trans>;
	return <Trans>Undelegate</Trans>;
}

function NetworkLabel({ env }: { env: FundsActionReference["env"] }) {
	return env === "Mainnet" ? <Trans>Mainnet</Trans> : <Trans>Testnet</Trans>;
}
