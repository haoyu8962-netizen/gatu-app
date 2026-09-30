import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	KeyIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format";
import { ApiWalletCopyButton } from "./api-wallet-copy-button";
import type { ApiWalletAgentStatus, ApiWalletAgentView, ApiWalletPageState } from "./api-wallet-view";

const SKELETON_ROWS = ["first", "second", "third"] as const;

interface Props {
	pageState: ApiWalletPageState;
	agents: ApiWalletAgentView[];
	isRefreshing: boolean;
	onRemove: (agent: ApiWalletAgentView) => void;
	onRetry: () => void;
}

function getStatusTone(status: ApiWalletAgentStatus): "success" | "warning" | "neutral" {
	if (status === "active") return "success";
	if (status === "expiring" || status === "today") return "warning";
	return "neutral";
}

function AgentStatus({ agent }: { agent: ApiWalletAgentView }) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Badge tone={getStatusTone(agent.status)} size="xs">
				{agent.status === "active" ? (
					<Trans>Active</Trans>
				) : agent.status === "expiring" ? (
					<Trans>Expiring</Trans>
				) : agent.status === "today" ? (
					<Trans>Expires today</Trans>
				) : agent.status === "expired" ? (
					<Trans>Expired</Trans>
				) : agent.status === "noExpiry" ? (
					<Trans>No expiry reported</Trans>
				) : (
					<Trans>Not reported</Trans>
				)}
			</Badge>
			{agent.statusDetail ? (
				<span
					className={cn(
						"text-2xs",
						agent.status === "expiring" || agent.status === "today"
							? "text-api-wallet-warning"
							: "text-api-wallet-subtle",
					)}
				>
					{agent.statusDetail}
				</span>
			) : null}
		</div>
	);
}

function ListMessage({ pageState, onRetry, isMobile }: Pick<Props, "pageState" | "onRetry"> & { isMobile: boolean }) {
	const stateIconClass = isMobile
		? "size-[var(--api-wallet-mobile-state-icon-size)]"
		: "size-[var(--api-wallet-state-icon-size)]";

	if (pageState === "loading") {
		return (
			<div aria-live="polite" className={cn("flex flex-col gap-2.5", isMobile ? "px-4 pb-4" : "px-5 pb-5")}>
				{SKELETON_ROWS.map((key) => (
					<div
						key={key}
						className={cn(
							"animate-pulse border-api-wallet-stroke-card",
							isMobile
								? "space-y-2 rounded-16 border p-3"
								: "grid h-[var(--api-wallet-row-min-height)] grid-cols-5 items-center gap-4 border-b",
						)}
					>
						<span className="block h-[var(--api-wallet-skeleton-line-height)] w-3/5 rounded-full bg-fill-weak" />
						<span className="block h-[var(--api-wallet-skeleton-line-height)] w-4/5 rounded-full bg-fill-weak" />
						<span className="block h-[var(--api-wallet-skeleton-line-height)] w-2/5 rounded-full bg-fill-weak" />
						{isMobile ? null : (
							<>
								<span className="block h-[var(--api-wallet-skeleton-line-height)] w-3/5 rounded-full bg-fill-weak" />
								<span className="block h-[var(--api-wallet-skeleton-line-height)] w-2/5 rounded-full bg-fill-weak" />
							</>
						)}
					</div>
				))}
				<span className="sr-only">
					<Trans>Loading authorized API wallets</Trans>
				</span>
			</div>
		);
	}

	if (pageState === "error") {
		return (
			<div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
				<div className={cn("grid place-items-center rounded-full bg-error-soft text-error", stateIconClass)}>
					<WarningCircleIcon className="size-5" weight="fill" />
				</div>
				<p className="text-sm font-bold text-api-wallet-fg">
					<Trans>API wallet list is temporarily unavailable</Trans>
				</p>
				<p className="max-w-[var(--api-wallet-description-max)] px-4 text-xs leading-5 text-api-wallet-subtle">
					<Trans>
						The extraAgents request failed. Existing API wallets continue to operate, but management stays disabled
						until fresh data can be verified.
					</Trans>
				</p>
				<Button
					type="button"
					size="sm"
					className="mt-1 rounded-20 bg-api-wallet-control text-api-wallet-on-control active:scale-100"
					onClick={onRetry}
				>
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	}

	const disconnected = pageState === "disconnected";
	return (
		<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
			<div
				className={cn(
					"grid place-items-center rounded-full bg-api-wallet-hover text-api-wallet-subtle",
					stateIconClass,
				)}
			>
				{disconnected ? <WalletIcon className="size-5" /> : <KeyIcon className="size-5" />}
			</div>
			<p className="text-sm font-bold text-api-wallet-fg">
				{disconnected ? (
					<Trans>Connect to view authorized API wallets</Trans>
				) : (
					<Trans>No API wallets authorized</Trans>
				)}
			</p>
			<p className="max-w-[var(--api-wallet-description-max)] text-xs leading-5 text-api-wallet-subtle">
				{disconnected ? (
					<Trans>Approval and removal require the matching master wallet.</Trans>
				) : (
					<Trans>Generate a local key pair, then authorize its public address to get started.</Trans>
				)}
			</p>
		</div>
	);
}

function DesktopAgentTable({
	agents,
	pageState,
	sortDirection,
	onSort,
	onRemove,
	onRetry,
}: Props & { sortDirection: "ascending" | "descending"; onSort: () => void }) {
	const { t } = useLingui();
	const showMessage = pageState === "empty" || pageState === "disconnected" || agents.length === 0;

	return (
		<Table className="table-fixed" containerClassName="overflow-visible">
			<colgroup>
				<col className="api-wallet-col-name" />
				<col className="api-wallet-col-address" />
				<col className="api-wallet-col-status" />
				<col className="api-wallet-col-expiry" />
				<col className="api-wallet-col-action" />
			</colgroup>
			<TableHeader>
				<TableRow>
					<TableHead size="dense" className="h-[var(--api-wallet-table-head-height)] ps-5" aria-sort={sortDirection}>
						<Button
							type="button"
							variant="ghost"
							intent="neutral"
							size="xxs"
							className="p-0 text-api-wallet-subtle active:scale-100"
							aria-label={t`Sort API wallets by name`}
							onClick={onSort}
							iconRight={
								sortDirection === "ascending" ? (
									<ArrowUpIcon className="size-3" />
								) : (
									<ArrowDownIcon className="size-3" />
								)
							}
						>
							<Trans>Name</Trans>
						</Button>
					</TableHead>
					<TableHead size="dense">
						<Trans>API wallet address</Trans>
					</TableHead>
					<TableHead size="dense">
						<Trans>Status</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Valid until</Trans>
					</TableHead>
					<TableHead size="dense" className="pe-5 text-right">
						<Trans>Action</Trans>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{showMessage ? (
					<TableRow>
						<TableCell colSpan={5} className="p-0">
							<ListMessage
								pageState={pageState === "normal" ? "empty" : pageState}
								onRetry={onRetry}
								isMobile={false}
							/>
						</TableCell>
					</TableRow>
				) : (
					agents.map((agent) => (
						<TableRow key={agent.id} className="h-[var(--api-wallet-row-min-height)] hover:bg-api-wallet-hover">
							<TableCell size="dense" className="truncate ps-5 text-2sm font-bold text-api-wallet-fg">
								{agent.name}
							</TableCell>
							<TableCell size="dense">
								<div className="flex min-w-0 items-center gap-2">
									<span
										className="min-w-0 truncate font-mono text-xs tabular-nums text-api-wallet-muted"
										title={agent.address}
									>
										<bdi dir="ltr">{agent.address}</bdi>
									</span>
									<ApiWalletCopyButton value={agent.address} stopPropagation />
								</div>
							</TableCell>
							<TableCell size="dense">
								<AgentStatus agent={agent} />
							</TableCell>
							<TableCell
								size="dense"
								className={cn(
									"text-right text-xs font-semibold tabular-nums text-api-wallet-fg",
									agent.status === "expired" && "text-api-wallet-subtle line-through",
								)}
							>
								{agent.expiresAt ? <time dateTime={agent.expiresAt}>{agent.expiryLabel}</time> : agent.expiryLabel}
							</TableCell>
							<TableCell size="dense" className="pe-5 text-right">
								<Button
									type="button"
									variant="link"
									intent="error"
									size="xs"
									className="p-0 active:scale-100"
									disabled={pageState !== "normal"}
									onClick={() => onRemove(agent)}
								>
									<Trans>Remove</Trans>
								</Button>
							</TableCell>
						</TableRow>
					))
				)}
			</TableBody>
		</Table>
	);
}

function MobileAgentCards({ agents, pageState, onRemove, onRetry }: Props) {
	if (pageState === "empty" || pageState === "disconnected" || agents.length === 0) {
		return <ListMessage pageState={pageState === "normal" ? "empty" : pageState} onRetry={onRetry} isMobile />;
	}

	return (
		<div className="flex flex-col gap-2.5 px-4 pb-4">
			{agents.map((agent) => (
				<article key={agent.id} className="flex flex-col gap-2.5 rounded-16 border border-api-wallet-stroke-card p-3">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<h3 className="min-w-0 truncate text-sm font-bold text-api-wallet-fg">{agent.name}</h3>
						<AgentStatus agent={agent} />
					</div>
					<div className="flex min-w-0 items-center gap-2">
						<span
							className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums text-api-wallet-muted"
							title={agent.address}
						>
							<bdi dir="ltr">{shortenAddress(agent.address, 6, 4)}</bdi>
						</span>
						<ApiWalletCopyButton value={agent.address} />
					</div>
					<div className="flex items-end justify-between gap-3">
						<div className="min-w-0">
							<p className="text-3xs text-api-wallet-subtle">
								<Trans>Valid until</Trans>
							</p>
							<p
								className={cn(
									"truncate text-2sm font-semibold tabular-nums text-api-wallet-fg",
									agent.status === "expired" && "text-api-wallet-subtle line-through",
								)}
							>
								{agent.expiresAt ? <time dateTime={agent.expiresAt}>{agent.expiryLabel}</time> : agent.expiryLabel}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							intent="error"
							size="md"
							className="min-h-[var(--api-wallet-mobile-control-height)] shrink-0 rounded-20 active:scale-100"
							disabled={pageState !== "normal"}
							onClick={() => onRemove(agent)}
						>
							<Trans>Remove</Trans>
						</Button>
					</div>
				</article>
			))}
		</div>
	);
}

export function ApiWalletList({ pageState, agents, isRefreshing, onRemove, onRetry }: Props) {
	const isMobile = useIsMobile();
	const headingId = useId();
	const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");
	const sortedAgents = [...agents].sort((left, right) => {
		const comparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
		return sortDirection === "ascending" ? comparison : -comparison;
	});
	const isLoading = pageState === "loading";
	const isError = pageState === "error";

	return (
		<section aria-labelledby={headingId}>
			<div
				className={cn(
					"flex items-baseline justify-between gap-3 border-api-wallet-stroke-card py-2",
					isMobile ? "border-t px-4" : "px-5",
				)}
			>
				<h2 id={headingId} className="text-sm font-bold text-api-wallet-fg">
					<Trans>Authorized API wallets</Trans>
				</h2>
				<p className="text-2xs text-api-wallet-subtle">
					{isRefreshing ? (
						<span className="inline-flex items-center gap-1">
							<SpinnerGapIcon className="size-3 animate-spin motion-reduce:animate-none" />
							<Trans>Refreshing…</Trans>
						</span>
					) : isLoading ? (
						<Trans>Loading…</Trans>
					) : isError ? (
						<Trans>Unavailable</Trans>
					) : (
						<Trans>{agents.length} authorized</Trans>
					)}
				</p>
			</div>

			{isLoading || isError ? (
				<ListMessage pageState={pageState} onRetry={onRetry} isMobile={isMobile} />
			) : isMobile ? (
				<MobileAgentCards
					pageState={pageState}
					agents={sortedAgents}
					isRefreshing={isRefreshing}
					onRemove={onRemove}
					onRetry={onRetry}
				/>
			) : (
				<DesktopAgentTable
					pageState={pageState}
					agents={sortedAgents}
					isRefreshing={isRefreshing}
					onRemove={onRemove}
					onRetry={onRetry}
					sortDirection={sortDirection}
					onSort={() => setSortDirection((current) => (current === "ascending" ? "descending" : "ascending"))}
				/>
			)}
		</section>
	);
}
