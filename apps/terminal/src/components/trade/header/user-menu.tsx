import { Button, Dropdown } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	CheckIcon,
	CopyIcon,
	PlusCircleIcon,
	SignOutIcon,
	SpinnerGapIcon,
	UserCircleIcon,
	WalletIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useConnection, useDisconnect, useEnsName } from "wagmi";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { useSubAccounts } from "@/hooks/use-sub-accounts";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { useSelectedSubAddress, useSubAccountActions } from "@/stores/use-sub-account-store";
import { WalletModal } from "../components/wallet-modal";

export function UserMenu() {
	const { address, isConnected, isConnecting } = useConnection();
	const disconnect = useDisconnect();
	const { data: ensName } = useEnsName({ address });
	const { open: openDepositModal } = useDepositModalActions();
	const [isOpen, setIsOpen] = useState(false);
	const [mounted, setMounted] = useState(false);
	const { copied, copy } = useCopyToClipboard();

	const { data: subAccounts } = useSubAccounts();
	const selectedSubAddress = useSelectedSubAddress();
	const { setSelectedAddress } = useSubAccountActions();

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		setSelectedAddress(null);
	}, [address, setSelectedAddress]);

	if (!mounted || isConnecting) {
		return (
			<Button
				variant="outline"
				intent="neutral"
				size="sm"
				className="h-8 min-h-8 min-w-[9rem] shrink-0 px-3 transition-[color,background-color,border-color] duration-150 ease-out"
				disabled
			>
				<SpinnerGapIcon className="size-3.5 animate-spin" />
				<Trans>Connecting...</Trans>
			</Button>
		);
	}

	if (!isConnected) {
		return (
			<>
				<Button
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={() => setIsOpen(true)}
					iconLeft={<WalletIcon className="size-3.5" />}
					className="h-8 min-h-8 shrink-0 px-3 transition-[color,background-color,border-color] duration-150 ease-out"
				>
					<Trans>Connect Wallet</Trans>
				</Button>
				<WalletModal open={isOpen} onOpenChange={setIsOpen} />
			</>
		);
	}

	const activeAddress = selectedSubAddress ?? address;
	const activeSubAccount = subAccounts?.find((s) => s.subAccountUser === selectedSubAddress);
	const displayLabel = activeSubAccount?.name ?? ensName ?? (address ? shortenAddress(address) : "");
	const hasSubAccounts = subAccounts && subAccounts.length > 0;

	const accountItems = hasSubAccounts
		? [
				{
					label: t`Master`,
					icon: <UserCircleIcon className="size-3.5" />,
					active: selectedSubAddress === null,
					onSelect: () => setSelectedAddress(null),
				},
				...subAccounts.map((sub) => ({
					label: sub.name,
					icon: <UserCircleIcon className="size-3.5" />,
					active: selectedSubAddress === sub.subAccountUser,
					onSelect: () => setSelectedAddress(sub.subAccountUser),
				})),
			]
		: [];

	const actionItems = [
		...(activeAddress
			? [
					{
						label: copied ? t`Copied!` : t`Copy Address`,
						icon: copied ? (
							<CheckIcon className="size-3.5 animate-in zoom-in-50 fade-in-0 duration-150 ease-out" />
						) : (
							<CopyIcon className="size-3.5" />
						),
						onSelect: () => copy(activeAddress),
					},
				]
			: []),
		{
			label: t`Add funds`,
			icon: <PlusCircleIcon className="size-3.5" />,
			onSelect: () => openDepositModal("deposit"),
		},
	];

	return (
		<Dropdown
			align="end"
			size="sm"
			triggerVariant="minimal"
			className="flex shrink-0 items-center"
			triggerClassName={cn(
				"h-8 min-h-8 max-h-8 shrink-0 !rounded-8 border border-stroke-weak bg-transparent px-3 shadow-raised",
				"!py-0 text-xs gap-1.5",
				"items-center justify-start font-semibold text-text-strong",
				"hover:bg-fill-hover active:bg-fill-press",
				"data-[popup-open]:border-stroke-brand-strong/40 data-[popup-open]:bg-fill-hover",
				"transition-[color,background-color,border-color] duration-150 ease-out",
			)}
			triggerAriaLabel={t`Account and wallet`}
			trigger={
				<>
					<span className="size-1.5 shrink-0 rounded-full bg-fill-success-strong" aria-hidden />
					<span className="min-w-0 max-w-[11rem] truncate font-mono text-xs text-text-strong">{displayLabel}</span>
				</>
			}
			groups={[
				...(hasSubAccounts
					? [
							{
								label: t`Accounts`,
								items: accountItems,
							},
						]
					: []),
				{
					items: actionItems,
				},
				{
					items: [
						{
							label: t`Disconnect`,
							icon: <SignOutIcon className="size-3.5" />,
							danger: true,
							onSelect: () => disconnect.mutate(),
						},
					],
				},
			]}
		/>
	);
}
