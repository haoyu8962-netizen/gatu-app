import {
	Button,
	Modal,
	ModalContent,
	ModalDescription,
	ModalHeader,
	ModalPopup,
	ModalTitle,
	TextInput,
} from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	FlaskIcon,
	QuestionIcon,
	ShieldIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { type ChangeEvent, type ReactNode, useState } from "react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { type Connector, useConnect, useConnectors } from "wagmi";
import { mock } from "wagmi/connectors";
import { MOCK_WALLETS } from "@/config/wagmi";
import { cn } from "@/lib/cn";
import { getLastUsedWallet, getWalletInfo, isMockConnector, setLastUsedWallet } from "@/lib/wallet-utils";

function WalletSection({
	label,
	tone,
	children,
}: {
	label: ReactNode;
	tone?: "default" | "warning";
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"rounded-12 border p-3 space-y-3",
				tone === "warning"
					? "border-stroke-warning-strong/25 bg-fill-warning-weak/20"
					: "border-stroke-weak/60 bg-bg-raised/40",
			)}
		>
			<p
				className={cn(
					"text-xs font-semibold uppercase tracking-wider px-0.5",
					tone === "warning" ? "text-text-warning" : "text-text-weak",
				)}
			>
				{label}
			</p>
			{children}
		</div>
	);
}

function ConnectorRow({
	connector,
	isPending,
	connectingId,
	onConnect,
}: {
	connector: Connector;
	isPending: boolean;
	connectingId: string | null;
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
				"w-full flex items-center gap-3 p-3 rounded-10 border cursor-pointer text-left",
				"bg-bg-base hover:bg-bg-raised/60 border-stroke-weak/80",
				"hover:border-stroke-brand-strong/35 hover:shadow-sm",
				"group focus-visible:outline-2 focus-visible:outline-stroke-focus",
				"disabled:opacity-50 disabled:cursor-not-allowed",
			)}
		>
			<div
				className={cn(
					"size-10 rounded-10 overflow-hidden flex-shrink-0 shadow-raised",
					"ring-1 ring-stroke-weak/40 group-hover:ring-stroke-brand-strong/25 transition-[box-shadow,ring-color]",
				)}
			>
				<Icon className="size-full" />
			</div>
			<div className="flex-1 text-left min-w-0">
				<p className="font-medium text-sm group-hover:text-text-brand transition-colors">{connector.name}</p>
				<p className="text-xs text-text-weak truncate">{walletInfo.description}</p>
			</div>
			{isConnecting ? (
				<SpinnerGapIcon className="size-4 animate-spin text-text-brand flex-shrink-0" />
			) : (
				<div className="size-4 rounded-full border border-stroke-weak group-hover:border-stroke-brand-strong/50 flex-shrink-0 transition-colors" />
			)}
		</button>
	);
}

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function WalletDialog({ open, onOpenChange }: Props) {
	const connectors = useConnectors();
	const { mutateAsync: connectAsync, isPending, error } = useConnect();
	const [connectingId, setConnectingId] = useState<string | null>(null);
	const [showHelp, setShowHelp] = useState(false);
	const [lastUsedWallet] = useState(() => getLastUsedWallet());
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

	function sortByPriority(a: Connector, b: Connector) {
		if (lastUsedWallet) {
			if (a.id === lastUsedWallet) return -1;
			if (b.id === lastUsedWallet) return 1;
		}
		const priorityA = getWalletInfo(a).priority ?? 50;
		const priorityB = getWalletInfo(b).priority ?? 50;
		return priorityA - priorityB;
	}

	const popular = regularConnectors.filter((c) => getWalletInfo(c).popular).sort(sortByPriority);
	const other = regularConnectors.filter((c) => !getWalletInfo(c).popular).sort(sortByPriority);
	const availableConnectors = { popular, other, all: regularConnectors };

	const handleConnect = async (connector: Connector) => {
		setConnectingId(connector.uid);
		setLastUsedWallet(connector.id);
		try {
			await connectAsync({ connector });
			onOpenChange(false);
		} finally {
			setConnectingId(null);
		}
	};

	const handleCustomAddressConnect = async () => {
		const trimmed = customAddress.trim();
		if (!trimmed) {
			setCustomAddressError("Please enter an address");
			return;
		}
		if (!isAddress(trimmed)) {
			setCustomAddressError("Invalid Ethereum address");
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
				onOpenChange(false);
			} catch {
				setCustomAddressError("Failed to connect with custom address");
			} finally {
				setConnectingId(null);
			}
		}
	};

	const hasConnectors = availableConnectors.all.length > 0 || mockConnectors.length > 0;

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="lg" showClose>
				<ModalHeader>
					<ModalTitle className="flex items-center gap-3 text-lg">
						<span
							className={cn(
								"flex size-10 shrink-0 items-center justify-center rounded-10",
								"border border-stroke-weak/70 bg-fill-brand-strong/12",
								"shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
							)}
						>
							<WalletIcon className="size-5 text-text-brand" weight="duotone" />
						</span>
						<span className="leading-tight">
							<Trans>Connect Wallet</Trans>
						</span>
					</ModalTitle>
					<ModalDescription>
						<Trans>Connect your wallet to start trading on Hyperliquid</Trans>
					</ModalDescription>
				</ModalHeader>

				<ModalContent className="space-y-4 max-h-[min(60vh,28rem)] overflow-y-auto">
					{availableConnectors.popular.length > 0 && (
						<WalletSection label={<Trans>Popular</Trans>}>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{availableConnectors.popular.map((connector) => (
									<ConnectorRow
										key={connector.uid}
										connector={connector}
										isPending={isPending}
										connectingId={connectingId}
										onConnect={handleConnect}
									/>
								))}
							</div>
						</WalletSection>
					)}

					{availableConnectors.other.length > 0 && (
						<WalletSection label={<Trans>Other Options</Trans>}>
							<div className="space-y-2">
								{availableConnectors.other.map((connector) => (
									<ConnectorRow
										key={connector.uid}
										connector={connector}
										isPending={isPending}
										connectingId={connectingId}
										onConnect={handleConnect}
									/>
								))}
							</div>
						</WalletSection>
					)}

					{mockConnectors.length > 0 && (
						<WalletSection tone="warning" label={<Trans>Mock Wallet (Testing)</Trans>}>
							<div className="space-y-2">
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
												"w-full flex items-center gap-3 p-3 rounded-10 border border-stroke-warning-strong/30 cursor-pointer",
												"bg-fill-warning-weak/50 hover:bg-fill-warning-weak hover:border-stroke-warning-strong/50",
												"group focus-visible:outline-2 focus-visible:outline-stroke-focus",
												"disabled:opacity-50 disabled:cursor-not-allowed",
											)}
										>
											<div className="size-10 rounded-10 overflow-hidden flex-shrink-0 shadow-raised bg-fill-warning-weak flex items-center justify-center">
												<FlaskIcon className="size-5 text-text-warning" />
											</div>
											<div className="flex-1 text-left min-w-0">
												<p className="font-medium text-sm group-hover:text-text-warning transition-colors">
													{config?.name ?? connector.name}
												</p>
												<p className="text-xs text-text-weak truncate font-mono">{config?.address ?? "Mock wallet"}</p>
											</div>
											{isConnecting ? (
												<SpinnerGapIcon className="size-4 animate-spin text-text-warning flex-shrink-0" />
											) : (
												<div className="size-4 rounded-full border border-stroke-warning-strong/50 flex-shrink-0 transition-colors" />
											)}
										</button>
									);
								})}
							</div>
							<div className="pt-2 space-y-2">
								<div className="flex gap-2">
									<TextInput
										placeholder="0x..."
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
								{customAddressError && <p className="text-xs text-text-error px-1">{customAddressError}</p>}
							</div>
						</WalletSection>
					)}

					{!hasConnectors && (
						<div className="py-8 text-center space-y-3">
							<div className="size-12 rounded-full bg-bg-raised flex items-center justify-center mx-auto">
								<WarningCircleIcon className="size-6 text-text-weak" />
							</div>
							<div>
								<p className="text-sm font-medium">
									<Trans>No wallets found</Trans>
								</p>
								<p className="text-xs text-text-weak mt-1">
									<Trans>Install a wallet extension to continue</Trans>
								</p>
							</div>
						</div>
					)}

					{error && (
						<div className="flex items-start gap-2 p-3 rounded-8 bg-fill-error-weak border border-stroke-error-strong/20">
							<WarningCircleIcon className="size-4 text-text-error shrink-0 mt-0.5" />
							<p className="text-xs text-text-error">{error.message}</p>
						</div>
					)}
				</ModalContent>

				<div className="border-t border-stroke-weak/80 bg-bg-raised/80">
					<button
						type="button"
						onClick={() => setShowHelp(!showHelp)}
						className="w-full flex items-center justify-between gap-3 p-4 text-sm text-text-weak hover:text-text-strong hover:bg-fill-hover/40 cursor-pointer rounded-b-12"
						aria-expanded={showHelp}
					>
						<span className="flex items-center gap-2 min-w-0">
							<QuestionIcon className="size-4 shrink-0" aria-hidden />
							<Trans>New to wallets?</Trans>
						</span>
						<CaretDownIcon
							className={cn(
								"size-4 shrink-0 text-icon-neutral transition-transform duration-200",
								showHelp && "rotate-180",
							)}
							aria-hidden
						/>
					</button>

					{showHelp && (
						<div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
							<div className="flex items-start gap-3 text-xs">
								<ShieldIcon className="size-4 text-text-success flex-shrink-0 mt-0.5" />
								<div>
									<p className="font-medium text-text-strong">
										<Trans>Secure & Private</Trans>
									</p>
									<p className="text-text-weak mt-0.5">
										<Trans>Only you control your funds. No email or password required.</Trans>
									</p>
								</div>
							</div>
							<div className="flex items-start gap-3 text-xs">
								<WalletIcon className="size-4 text-text-brand flex-shrink-0 mt-0.5" />
								<div>
									<p className="font-medium text-text-strong">
										<Trans>What is a wallet?</Trans>
									</p>
									<p className="text-text-weak mt-0.5">
										<Trans>A crypto wallet lets you store and manage your digital assets securely.</Trans>
									</p>
								</div>
							</div>
							<Button variant="outline" intent="neutral" size="sm" className="w-full mt-2">
								<a
									href="https://ethereum.org/en/wallets/"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5"
								>
									<Trans>Learn more</Trans>
									<ArrowSquareOutIcon className="size-3" />
								</a>
							</Button>
						</div>
					)}
				</div>
			</ModalPopup>
		</Modal>
	);
}
