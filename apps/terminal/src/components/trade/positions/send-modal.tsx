import { Button, ModalContent, ModalDescription, ModalHeader, ModalTitle, Select, TextInput } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { PaperPlaneTiltIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ChangeEvent, useMemo, useState } from "react";
import { isAddress } from "viem";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { exceedsBalance, getTokenTransferDecimals, isAmountWithinBalance } from "@/domain/market";
import {
	type BalanceRow,
	getAccountBalanceSummary,
	getSpotTransferable,
	getSpotTransferableValue,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import { isTokenSpotBalance, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatExchangeActionError } from "@/lib/errors/format";
import { useExchange } from "@/lib/hyperliquid";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { floorToString, limitDecimalInput } from "@/lib/trade/numbers";
import { formatTokenId } from "@/lib/trade/token-id";
import { PendingActionModal } from "../components/pending-action-modal";

type AccountType = "perp" | "spot";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialAsset?: string;
	initialAccountType?: AccountType;
}

export function SendModal({
	open,
	onOpenChange,
	initialAsset = DEFAULT_QUOTE_TOKEN,
	initialAccountType = "spot",
}: Props) {
	return (
		<SendModalBody
			key={`${initialAsset}:${initialAccountType}:${open ? "open" : "closed"}`}
			onOpenChange={onOpenChange}
			initialAsset={initialAsset}
			initialAccountType={initialAccountType}
			open={open}
		/>
	);
}

interface BodyProps {
	onOpenChange: (open: boolean) => void;
	initialAsset: string;
	initialAccountType: AccountType;
	open: boolean;
}

function SendModalBody({ onOpenChange, initialAsset, initialAccountType, open }: BodyProps) {
	const [destination, setDestination] = useState("");
	const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
	const [selectedToken, setSelectedToken] = useState(initialAsset);
	const [amount, setAmount] = useState("");
	const [error, setError] = useState<string | null>(null);

	const { getToken } = useSpotTokens();
	const { mutateAsync: sendAsset, isPending: isSendAssetPending } = useExchange("sendAsset");
	const { mutateAsync: spotSend, isPending: isSpotSendPending } = useExchange("spotSend");
	const { marginSummary, perpSummary, spotBalances, spotAvailableAfterMaintenance, accountAbstraction, withdrawable } =
		useDefaultDexBalances();
	const { hasWalletAccess } = useWalletSession();

	const isPending = isSendAssetPending || isSpotSendPending;
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary,
		perpSummary,
		withdrawable,
		spotBalances,
		spotAvailableAfterMaintenance,
	});
	const usesTradingAccount = isQuoteBalanceSharedWithPerps(accountAbstraction);
	const activeAccountType = usesTradingAccount ? "spot" : accountType;

	const availableSpotTokens = useMemo((): BalanceRow[] => {
		if (!spotBalances?.length) return [];
		return spotBalances
			.filter(isTokenSpotBalance)
			.filter((b) => {
				const available = getSpotTransferable(b);
				return available > 0;
			})
			.map((b) => ({
				asset: b.coin,
				type: "spot" as const,
				available: getSpotTransferableValue(b),
				inOrder: b.hold,
				total: b.total,
				usdValue: b.coin === DEFAULT_QUOTE_TOKEN ? b.total : b.entryNtl,
				entryNtl: b.entryNtl,
			}));
	}, [spotBalances]);

	const tokenOptions = useMemo(() => {
		if (activeAccountType === "perp") {
			return [DEFAULT_QUOTE_TOKEN];
		}
		return availableSpotTokens.map((b) => b.asset);
	}, [activeAccountType, availableSpotTokens]);

	const tokenInfo = getToken(selectedToken);
	const tokenId = tokenInfo ? formatTokenId(tokenInfo) : "";

	const decimals = getTokenTransferDecimals(tokenInfo);

	const selectedSpotBalance = spotBalances?.find((balance) => balance.coin === selectedToken);
	const availableBalance =
		activeAccountType === "perp" ? accountSummary.withdrawable : getSpotTransferable(selectedSpotBalance);

	const isValidDestination = isAddress(destination);
	const isValidAmount = isAmountWithinBalance(amount, availableBalance);
	const canSend = hasWalletAccess && isValidDestination && isValidAmount && !!tokenId && !isPending;

	function handleAccountTypeChange(value: string | null) {
		if (!value || usesTradingAccount || isPending) return;
		const v = value as AccountType;
		setAccountType(v);
		if (v === "perp") {
			setSelectedToken(DEFAULT_QUOTE_TOKEN);
		} else if (!availableSpotTokens.some((t) => t.asset === selectedToken)) {
			setSelectedToken(availableSpotTokens[0]?.asset ?? DEFAULT_QUOTE_TOKEN);
		}
		setAmount("");
	}

	function handleTokenChange(value: string | null) {
		if (!value || isPending) return;
		setSelectedToken(value);
		setAmount("");
	}

	function handleAmountChange(value: string) {
		if (isPending) return;
		setAmount(limitDecimalInput(value, decimals));
	}

	function handleMaxClick() {
		if (isPending) return;
		setAmount(floorToString(availableBalance, decimals));
	}

	async function handleSend() {
		if (!canSend) return;

		setError(null);
		try {
			if (usesTradingAccount) {
				await sendAsset({
					destination,
					sourceDex: "spot",
					destinationDex: "spot",
					token: tokenId,
					amount,
				});
			} else if (activeAccountType === "perp") {
				await sendAsset({
					destination,
					sourceDex: "",
					destinationDex: "",
					token: tokenId,
					amount,
				});
			} else {
				await spotSend({
					destination,
					token: tokenId,
					amount,
				});
			}
			setDestination("");
			setAmount("");
			onOpenChange(false);
		} catch (err) {
			setError(formatExchangeActionError(err, t`Send failed`));
		}
	}

	const accountTypeOptions = usesTradingAccount
		? [{ value: "spot", label: t`Trading Account` }]
		: [
				{ value: "perp", label: t`Perps Account` },
				{ value: "spot", label: t`Spot Account` },
			];

	const tokenSelectOptions = tokenOptions.map((tokenName) => ({
		value: tokenName,
		label: tokenName,
	}));

	return (
		<PendingActionModal open={open} onOpenChange={onOpenChange} isPending={isPending}>
			<ModalHeader>
				<ModalTitle>{t`Send Tokens`}</ModalTitle>
				<ModalDescription>{t`Send tokens to another account on the Hyperliquid L1.`}</ModalDescription>
			</ModalHeader>

			<ModalContent>
				<div className="space-y-4">
					{!hasWalletAccess && (
						<div className="flex items-center gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft p-2.5 text-xs text-warning">
							<WarningCircleIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{t`Connect your wallet to send funds.`}</span>
						</div>
					)}

					<TextInput
						placeholder={t`Destination address`}
						value={destination}
						onChange={(e: ChangeEvent<HTMLInputElement>) => setDestination(e.target.value)}
						autoComplete="off"
						spellCheck={false}
						disabled={isPending}
						className={cn(
							destination &&
								!isValidDestination &&
								"border-stroke-error-strong focus-visible:border-stroke-error-strong",
						)}
					/>

					<div className="flex gap-2">
						<Select
							value={activeAccountType}
							onValueChange={handleAccountTypeChange}
							options={accountTypeOptions}
							disabled={usesTradingAccount || isPending}
							className="flex-1"
						/>

						<Select
							value={selectedToken}
							onValueChange={handleTokenChange}
							options={tokenSelectOptions}
							disabled={isPending}
							className="flex-1"
						/>
					</div>

					<NumberInput
						label={t`Amount`}
						labelValue={
							<>
								{t`Available`}:{" "}
								<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">
									{floorToString(availableBalance, decimals)} {selectedToken}
								</span>
							</>
						}
						onLabelValueClick={handleMaxClick}
						placeholder="0.00"
						value={amount}
						onChange={(e: ChangeEvent<HTMLInputElement>) => handleAmountChange(e.target.value)}
						disabled={isPending}
						className={cn(
							"w-full tabular-nums",
							exceedsBalance(amount, availableBalance) && "border-stroke-error-strong focus:border-stroke-error-strong",
						)}
					/>

					{error && (
						<div className="flex items-center gap-2 p-2.5 rounded-8 bg-error-soft border border-stroke-error-strong/20 text-xs text-error">
							<WarningCircleIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{error}</span>
						</div>
					)}

					<Button variant="filled" intent="neutral" onClick={handleSend} disabled={!canSend} className="w-full">
						{isPending && <SpinnerGapIcon className="size-3.5 animate-spin mr-2" />}
						<PaperPlaneTiltIcon className="size-3.5 mr-2" />
						{isPending ? t`Sending...` : t`Send`}
					</Button>
				</div>
			</ModalContent>
		</PendingActionModal>
	);
}
