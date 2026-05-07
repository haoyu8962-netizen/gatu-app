import { Button, Drawer, DrawerContent, Modal, ModalContent, ModalPopup, TextInput } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	FlaskIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type ChangeEvent, useState } from "react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { type Connector, useConnect, useConnectors } from "wagmi";
import { mock } from "wagmi/connectors";
import { MOCK_WALLETS } from "@/config/wagmi";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { addRecentWallet, getRecentWallets, getWalletInfo, isMockConnector } from "@/lib/wallet-utils";

const WALLET_LIST_MAX_HEIGHT = "max-h-[min(55vh,22rem)]";
const DRAWER_HANDLE_SIZE_CLASS = "w-8 h-1";

function ConnectorRow({
	connector,
	isPending,
	connectingId,
	isRecent,
	onConnect,
}: {
	connector: Connector;
	isPending: boolean;
	connectingId: string | null;
	isRecent: boolean;
	onConnect: (connector: Connector) => void;
}) {
	const walletInfo = getWalletInfo(connector);
	const Icon = walletInfo.icon;
	const isConnecting = connectingId === connector.uid;

	return (
		<button
			type="button"
			onClick={() => onConnect(connector)}
			disabled={isPending}
			className={cn(
				"w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer text-left",
				"hover:bg-fill-hover active:bg-fill-press",
				"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus",
				"disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
				"group",
			)}
		>
			<div className="size-8 rounded-xs overflow-hidden flex-shrink-0" aria-hidden="true">
				<Icon className="size-full" />
			</div>
			<span className="flex-1 text-sm font-medium group-hover:text-brand transition-colors min-w-0 truncate">
				{connector.name}
			</span>
			{isRecent && (
				<span className="text-2xs uppercase tracking-wider font-medium text-fg-muted bg-fill-weak px-1.5 py-0.5 rounded-xs flex-shrink-0">
					<Trans>Recent</Trans>
				</span>
			)}
			{isConnecting ? (
				<SpinnerGapIcon
					className="size-3.5 animate-spin motion-reduce:animate-none text-brand flex-shrink-0"
					aria-hidden="true"
				/>
			) : (
				<CaretDownIcon
					className="size-3 -rotate-90 text-icon flex-shrink-0 opacity-30 group-hover:opacity-60 transition-opacity"
					aria-hidden="true"
				/>
			)}
		</button>
	);
}

function WalletContent({ onClose, isMobile }: { onClose: () => void; isMobile: boolean }) {
	const connectors = useConnectors();
	const { mutateAsync: connectAsync, isPending, error } = useConnect();
	const [connectingId, setConnectingId] = useState<string | null>(null);
	const [showAll, setShowAll] = useState(false);
	const [showMock, setShowMock] = useState(false);
	const [recentWallets] = useState(() => getRecentWallets());
	const [customAddress, setCustomAddress] = useState("");
	const [customAddressError, setCustomAddressError] = useState<string | null>(null);

	const mockConnectors: Connector[] = [];
	const regularConnectors: Connector[] = [];
	for (const connector of connectors) {
		if (isMockConnector(connector)) {
			mockConnectors.push(connector);
		} else {
			regularConnectors.push(connector);
		}
	}

	function recentRank(connectorId: string) {
		const index = recentWallets.indexOf(connectorId);
		return index === -1 ? Number.POSITIVE_INFINITY : index;
	}

	function sortByPriority(a: Connector, b: Connector) {
		const rankDelta = recentRank(a.id) - recentRank(b.id);
		if (rankDelta !== 0) return rankDelta;
		const priorityA = getWalletInfo(a).priority ?? 50;
		const priorityB = getWalletInfo(b).priority ?? 50;
		return priorityA - priorityB;
	}

	const popular = regularConnectors.filter((c) => getWalletInfo(c).popular).sort(sortByPriority);
	const other = regularConnectors.filter((c) => !getWalletInfo(c).popular).sort(sortByPriority);

	async function handleConnect(connector: Connector) {
		setConnectingId(connector.uid);
		try {
			await connectAsync({ connector });
			if (!isMockConnector(connector)) {
				addRecentWallet(connector.id);
			}
			onClose();
		} finally {
			setConnectingId(null);
		}
	}

	async function handleCustomAddressConnect() {
		const trimmed = customAddress.trim();
		if (!trimmed) {
			setCustomAddressError(t`Please enter an address`);
			return;
		}
		if (!isAddress(trimmed)) {
			setCustomAddressError(t`Invalid Ethereum address`);
			return;
		}
		setCustomAddressError(null);

		const mockWalletIndex = MOCK_WALLETS.findIndex((w) => w.address.toLowerCase() === trimmed.toLowerCase());

		if (mockWalletIndex !== -1 && mockConnectors[mockWalletIndex]) {
			await handleConnect(mockConnectors[mockWalletIndex]);
		} else {
			const customMockConnector = mock({
				accounts: [trimmed as Address],
				features: { reconnect: true },
			});
			setConnectingId("custom-mock");
			try {
				await connectAsync({ connector: customMockConnector });
				onClose();
			} catch {
				setCustomAddressError(t`Failed to connect with custom address`);
			} finally {
				setConnectingId(null);
			}
		}
	}

	const hasConnectors = regularConnectors.length > 0 || mockConnectors.length > 0;
	const visibleConnectors = showAll ? [...popular, ...other] : popular;

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				{isMobile && (
					<div
						className={cn(DRAWER_HANDLE_SIZE_CLASS, "absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-fill/20")}
						aria-hidden="true"
					/>
				)}
				<div className="flex items-center gap-2">
					<WalletIcon className="size-4 text-brand" weight="duotone" aria-hidden="true" />
					<h2 className="text-sm font-semibold text-fg">
						<Trans>Connect Wallet</Trans>
					</h2>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label={t`Close`}
					className="flex items-center justify-center size-8 rounded-8 text-icon hover:bg-fill-hover active:bg-fill-press cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-stroke-focus focus-visible:outline-offset-2"
				>
					<XIcon size={16} weight="bold" aria-hidden="true" />
				</button>
			</div>

			<div className={cn("overflow-y-auto overscroll-contain", WALLET_LIST_MAX_HEIGHT)}>
				{hasConnectors ? (
					<>
						<div className="divide-y divide-stroke-weak/30">
							{visibleConnectors.map((connector) => (
								<ConnectorRow
									key={connector.uid}
									connector={connector}
									isPending={isPending}
									connectingId={connectingId}
									isRecent={recentWallets.includes(connector.id)}
									onConnect={handleConnect}
								/>
							))}
						</div>

						{other.length > 0 && (
							<button
								type="button"
								onClick={() => setShowAll((v) => !v)}
								aria-expanded={showAll}
								className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs text-fg-muted hover:text-fg hover:bg-fill-hover transition-colors cursor-pointer border-t border-stroke-weak/20 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus"
							>
								<span>{showAll ? <Trans>Show fewer wallets</Trans> : <Trans>{other.length} more wallets</Trans>}</span>
								<CaretDownIcon
									aria-hidden="true"
									className={cn("size-3 transition-transform duration-150", showAll && "rotate-180")}
								/>
							</button>
						)}
					</>
				) : (
					<div className="px-4 py-8 text-center space-y-1.5">
						<WarningCircleIcon className="size-8 text-fg-muted mx-auto" aria-hidden="true" />
						<p className="text-sm font-medium">
							<Trans>No wallets found</Trans>
						</p>
						<p className="text-xs text-fg-muted">
							<Trans>Install a wallet extension to continue</Trans>
						</p>
					</div>
				)}

				{error && (
					<div
						role="alert"
						className="mx-4 mb-3 flex items-start gap-2 p-2.5 rounded-xs bg-error-soft border border-stroke-error-strong/20"
					>
						<WarningCircleIcon className="size-3.5 text-error shrink-0 mt-0.5" aria-hidden="true" />
						<p className="text-xs text-error">{error.message}</p>
					</div>
				)}
			</div>

			{mockConnectors.length > 0 && (
				<div className="border-t border-stroke-warning-strong/20 bg-warning-soft/10">
					<button
						type="button"
						onClick={() => setShowMock((v) => !v)}
						aria-expanded={showMock}
						className="w-full flex items-center justify-between px-4 py-2.5 text-2xs font-medium uppercase tracking-wider text-warning hover:bg-warning-soft/20 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus"
					>
						<span>
							<Trans>Mock Wallet (Testing)</Trans>
						</span>
						<CaretDownIcon
							aria-hidden="true"
							className={cn("size-3 transition-transform duration-150", showMock && "rotate-180")}
						/>
					</button>

					{showMock && (
						<div className="px-3 pb-3 space-y-2">
							<div className="divide-y divide-stroke-warning-strong/20 border border-stroke-warning-strong/25 rounded-xs overflow-hidden">
								{mockConnectors.map((connector, index) => {
									const config = MOCK_WALLETS[index];
									const isConnecting = connectingId === connector.uid;
									return (
										<button
											key={connector.uid}
											type="button"
											onClick={() => handleConnect(connector)}
											disabled={isPending}
											className={cn(
												"w-full flex items-center gap-3 px-3 py-2.5 text-left",
												"bg-warning-soft/30 hover:bg-warning-soft/60 transition-colors cursor-pointer",
												"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus",
												"disabled:opacity-50 disabled:cursor-not-allowed group",
											)}
										>
											<div
												className="size-7 rounded-xs bg-warning-soft flex items-center justify-center flex-shrink-0"
												aria-hidden="true"
											>
												<FlaskIcon className="size-3.5 text-warning" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium group-hover:text-warning transition-colors truncate">
													{config?.name ?? connector.name}
												</p>
												<p className="text-2xs text-fg-muted font-mono truncate">{config?.address ?? "Mock wallet"}</p>
											</div>
											{isConnecting && (
												<SpinnerGapIcon
													className="size-3.5 animate-spin motion-reduce:animate-none text-warning flex-shrink-0"
													aria-hidden="true"
												/>
											)}
										</button>
									);
								})}
							</div>

							<div className="space-y-1">
								<div className="flex gap-2">
									<TextInput
										aria-label={t`Custom wallet address`}
										placeholder="0x…"
										spellCheck={false}
										autoComplete="off"
										value={customAddress}
										onChange={(e: ChangeEvent<HTMLInputElement>) => {
											setCustomAddress(e.target.value);
											setCustomAddressError(null);
										}}
										className="font-mono text-xs"
									/>
									<Button
										variant="outline"
										intent="neutral"
										size="sm"
										onClick={handleCustomAddressConnect}
										disabled={isPending}
										className="shrink-0"
									>
										<Trans>Connect</Trans>
									</Button>
								</div>
								{customAddressError && (
									<p role="alert" className="text-xs text-error px-1">
										{customAddressError}
									</p>
								)}
							</div>
						</div>
					)}
				</div>
			)}

			<div className="border-t border-stroke-weak/40 px-4 py-2.5 flex items-center justify-center gap-1.5">
				<span className="text-xs text-fg-muted">
					<Trans>New to wallets?</Trans>
				</span>
				<a
					href="https://ethereum.org/en/wallets/"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-xs text-brand hover:underline focus-visible:outline-2 focus-visible:outline-stroke-focus focus-visible:rounded-xs"
				>
					<Trans>Learn more</Trans>
					<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
				</a>
			</div>
		</div>
	);
}

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function WalletModal({ open, onOpenChange }: Props) {
	const isMobile = useIsMobile();

	if (isMobile) {
		return (
			<Drawer side="bottom" open={open} onOpenChange={onOpenChange}>
				<DrawerContent className="pb-[env(safe-area-inset-bottom)]">
					<WalletContent onClose={() => onOpenChange(false)} isMobile />
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="sm" showClose={false}>
				<ModalContent className="p-0">
					<WalletContent onClose={() => onOpenChange(false)} isMobile={false} />
				</ModalContent>
			</ModalPopup>
		</Modal>
	);
}
