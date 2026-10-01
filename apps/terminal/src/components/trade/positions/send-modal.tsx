import { useLingui } from "@lingui/react/macro";
import { PaperPlaneTiltIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ExchangeRequestInvalidatedError } from "@sairn/hl-react/internal/exchange/request-scheduler";
import { Button, ModalContent, ModalDescription, ModalHeader, ModalTitle, Select, TextInput } from "@sairn/ui";
import { type ChangeEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { exceedsBalance, getTokenTransferDecimals, isAmountWithinBalance } from "@/domain/market";
import { getAccountModeAvailability } from "@/domain/trade/account-abstraction";
import {
	type BalanceRow,
	getAccountBalanceSummary,
	getSpotTransferable,
	getSpotTransferableValue,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import { assertFreshFundsAmount, FundsExecutionError } from "@/domain/trade/funds-execution-guard";
import {
	AccountAbstractionExecutionError,
	useAccountAbstractionPreExecutionGuard,
} from "@/hooks/trade/use-account-abstraction-guard";
import {
	isSupportedAccountAbstraction,
	isTokenSpotBalance,
	useDefaultDexBalances,
} from "@/hooks/trade/use-account-balances";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { STATUS_GLYPH_UNKNOWN } from "@/lib/brand/status-glyph.gen";
import { cn } from "@/lib/cn";
import { formatExchangeActionError, isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { formatNumber } from "@/lib/format";
import { type ExchangeParams, useExchange, useHyperliquid } from "@/lib/hyperliquid";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import {
	FundsActionFeedbackCause,
	formatFundsActionFeedback,
	fundsActionFeedbackCause,
} from "@/lib/trade/funds-action-feedback";
import { floorToString, limitDecimalInput } from "@/lib/trade/numbers";
import { formatTokenId } from "@/lib/trade/token-id";
import { clearSendDraft, getSendDraft, saveSendDraft } from "@/stores/use-send-draft-store";
import { PendingActionModal } from "../components/pending-action-modal";

type AccountType = "perp" | "spot";

interface SendSubmission {
	identity: object;
	sequence: number;
	method: "sendAsset" | "spotSend";
	amount: string;
	destination: string;
	token: string;
	sourceDex: string | undefined;
	destinationDex: string | undefined;
}

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
	const { t } = useLingui();
	useNumberFormatRevision();
	const submissionSequenceRef = useRef(0);
	const submissionIdentityRef = useRef<object | null>(null);
	const submissionRef = useRef<SendSubmission | null>(null);
	const requestSubmissionsRef = useRef(new WeakMap<object, SendSubmission>());
	const { clientKey, env, exchangeLifecycle, sessionMode: exchangeSessionMode } = useHyperliquid();
	const draftOwnerKey = `${env}:${clientKey.toLowerCase()}`;
	const [restoredDraft] = useState(() => getSendDraft(draftOwnerKey));
	const restoresAsset =
		restoredDraft !== null && restoredDraft.token === initialAsset && restoredDraft.accountType === initialAccountType;
	const [destination, setDestination] = useState(restoredDraft?.destination ?? "");
	const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
	const [selectedToken, setSelectedToken] = useState(initialAsset);
	const [amount, setAmount] = useState(restoresAsset ? restoredDraft.amount : "");

	const { getToken } = useSpotTokens();
	const {
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		withdrawable,
		spotStateStatus,
		perpStateStatus,
		spotStateReceivedAt,
		perpStateReceivedAt,
		isDataStale,
		hasError: hasBalanceError,
	} = useDefaultDexBalances();
	const accountDataReady =
		spotStateStatus === "success" && perpStateStatus === "success" && !isDataStale && !hasBalanceError;
	const accountDataReadyRef = useRef(accountDataReady);
	accountDataReadyRef.current = accountDataReady;
	const balanceExecutionRef = useRef({
		available: "0",
		receivedAt: undefined as number | undefined,
		tokenId: "",
		source: "spot" as "spot" | "perp",
	});
	const { address, hasWalletAccess, sessionMode: walletSessionMode, walletAddress, walletIntent } = useWalletSession();
	const submissionIdentityKey = [
		env,
		clientKey.toLowerCase(),
		exchangeSessionMode,
		address?.toLowerCase() ?? "disconnected",
		walletAddress?.toLowerCase() ?? "no-wallet",
		walletSessionMode,
		accountAbstraction,
	].join(":");
	useLayoutEffect(() => {
		const identity = { exchangeLifecycle, key: submissionIdentityKey };
		submissionIdentityRef.current = identity;
		return () => {
			if (submissionIdentityRef.current === identity) submissionIdentityRef.current = null;
			if (submissionRef.current?.identity === identity) submissionRef.current = null;
			submissionSequenceRef.current += 1;
		};
	}, [exchangeLifecycle, submissionIdentityKey]);
	const assertAccountAbstraction = useAccountAbstractionPreExecutionGuard(accountAbstraction, address);
	async function assertCurrentAccountAbstraction(signal: AbortSignal) {
		try {
			await assertAccountAbstraction(signal);
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof AccountAbstractionExecutionError) {
				throw fundsActionFeedbackCause(
					error.reason === "changed" ? "account-mode-changed" : "account-mode-unavailable",
				);
			}
			throw error;
		}
	}
	function assertCurrentFundsAmount(amount: unknown, available: unknown, receivedAt: number | undefined) {
		try {
			assertFreshFundsAmount(amount, available, receivedAt);
		} catch (error) {
			if (!(error instanceof FundsExecutionError)) throw error;
			throw fundsActionFeedbackCause(error.reason === "balance-changed" ? "balance-changed" : "balance-unavailable");
		}
	}
	function assertCurrentSendAssetBalance(params: ExchangeParams<"sendAsset">) {
		if (!accountDataReadyRef.current) throw fundsActionFeedbackCause("balance-unavailable");
		const current = balanceExecutionRef.current;
		if (params.token !== current.tokenId || params.sourceDex !== (current.source === "spot" ? "spot" : "")) {
			throw fundsActionFeedbackCause("balance-unavailable");
		}
		assertCurrentFundsAmount(params.amount, current.available, current.receivedAt);
	}
	function assertCurrentSpotSendBalance(params: ExchangeParams<"spotSend">) {
		if (!accountDataReadyRef.current) throw fundsActionFeedbackCause("balance-unavailable");
		const current = balanceExecutionRef.current;
		if (current.source !== "spot" || params.token !== current.tokenId) {
			throw fundsActionFeedbackCause("balance-unavailable");
		}
		assertCurrentFundsAmount(params.amount, current.available, current.receivedAt);
	}
	function assertCurrentSendSubmission(
		method: SendSubmission["method"],
		params: ExchangeParams<"sendAsset"> | ExchangeParams<"spotSend">,
	): void {
		const submission = submissionRef.current;
		const boundSubmission = requestSubmissionsRef.current.get(params);
		if (
			!submission ||
			!exchangeLifecycle.active ||
			submission.identity !== submissionIdentityRef.current ||
			submission.sequence !== submissionSequenceRef.current ||
			(boundSubmission && boundSubmission !== submission) ||
			submission.method !== method ||
			submission.amount !== params.amount ||
			submission.destination !== params.destination ||
			submission.token !== params.token ||
			submission.sourceDex !== ("sourceDex" in params ? params.sourceDex : undefined) ||
			submission.destinationDex !== ("destinationDex" in params ? params.destinationDex : undefined)
		) {
			throw new ExchangeRequestInvalidatedError();
		}
		requestSubmissionsRef.current.set(params, submission);
	}
	const { mutateAsync: sendAsset, isPending: isSendAssetPending } = useExchange("sendAsset", {
		executionGuard: (params) => {
			assertCurrentSendSubmission("sendAsset", params);
			assertCurrentSendAssetBalance(params);
		},
		preExecutionGuard: async (params, signal) => {
			assertCurrentSendAssetBalance(params);
			await assertCurrentAccountAbstraction(signal);
			signal.throwIfAborted();
			assertCurrentSendAssetBalance(params);
		},
	});
	const { mutateAsync: spotSend, isPending: isSpotSendPending } = useExchange("spotSend", {
		executionGuard: (params) => {
			assertCurrentSendSubmission("spotSend", params);
			assertCurrentSpotSendBalance(params);
		},
		preExecutionGuard: async (params, signal) => {
			assertCurrentSpotSendBalance(params);
			await assertCurrentAccountAbstraction(signal);
			signal.throwIfAborted();
			assertCurrentSpotSendBalance(params);
		},
	});

	const isPending = isSendAssetPending || isSpotSendPending;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
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
		if (!accountModeReady || !accountDataReady || !spotBalances?.length) return [];
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
				transferable: getSpotTransferableValue(b),
				inOrder: b.hold,
				total: b.total,
				usdValue: b.coin === DEFAULT_QUOTE_TOKEN ? b.total : b.entryNtl,
				entryNtl: b.entryNtl,
			}));
	}, [accountDataReady, accountModeReady, spotBalances]);

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
		!accountModeReady || !accountDataReady
			? 0
			: activeAccountType === "perp"
				? accountSummary.withdrawable
				: getSpotTransferable(selectedSpotBalance);
	const availableBalanceExact =
		!accountModeReady || !accountDataReady
			? "0"
			: activeAccountType === "perp"
				? String(withdrawable)
				: getSpotTransferableValue(selectedSpotBalance);
	balanceExecutionRef.current = {
		available: availableBalanceExact,
		receivedAt: activeAccountType === "perp" ? perpStateReceivedAt : spotStateReceivedAt,
		tokenId,
		source: activeAccountType,
	};

	const isValidDestination = isAddress(destination);
	const destinationError = destination && !isValidDestination ? t`Enter a valid Ethereum address.` : undefined;
	const isValidAmount = isAmountWithinBalance(amount, availableBalance);
	const canSend =
		accountModeReady &&
		accountDataReady &&
		hasWalletAccess &&
		isValidDestination &&
		isValidAmount &&
		!!tokenId &&
		!isPending;

	function handleAccountTypeChange(value: string | null) {
		if (!value || usesTradingAccount || !accountDataReady || isPending) return;
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
		if (!value || !accountDataReady || isPending) return;
		setSelectedToken(value);
		setAmount("");
	}

	function handleAmountChange(value: string) {
		if (!accountDataReady || isPending) return;
		setAmount(limitDecimalInput(value, decimals));
	}

	function handleMaxClick() {
		if (!accountDataReady || isPending) return;
		setAmount(floorToString(availableBalance, decimals));
	}

	async function handleSend() {
		if (!canSend) return;

		const submissionIdentity = submissionIdentityRef.current;
		if (!submissionIdentity || submissionRef.current) return;
		const submissionSequence = ++submissionSequenceRef.current;
		const method = usesTradingAccount || activeAccountType === "perp" ? "sendAsset" : "spotSend";
		const dex = usesTradingAccount ? "spot" : "";
		const submission: SendSubmission = {
			identity: submissionIdentity,
			sequence: submissionSequence,
			method,
			amount,
			destination,
			token: tokenId,
			sourceDex: method === "sendAsset" ? dex : undefined,
			destinationDex: method === "sendAsset" ? dex : undefined,
		};
		submissionRef.current = submission;
		const isCurrentSubmission = () =>
			submissionIdentityRef.current === submissionIdentity && submissionSequenceRef.current === submissionSequence;
		const draftAmount = amount;
		const sentAmount = formatNumber(amount);
		const sentToken = selectedToken;
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
			clearSendDraft();
			if (isCurrentSubmission()) toast.success(t`Sent ${sentAmount} ${sentToken}`);
		} catch (err) {
			if (isAmbiguousExchangeActionError(err)) {
				clearSendDraft();
				if (isCurrentSubmission()) {
					toast.warning(t`Send status unknown`, {
						icon: <StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} />,
						description: t`Check your balances and the Deposits & Withdrawals history before retrying.`,
						duration: Number.POSITIVE_INFINITY,
						closeButton: true,
					});
				}
			} else if (isCurrentSubmission()) {
				saveSendDraft({
					ownerKey: draftOwnerKey,
					destination,
					amount: draftAmount,
					token: sentToken,
					accountType: activeAccountType,
				});
				toast.error(
					err instanceof FundsActionFeedbackCause
						? formatFundsActionFeedback(err.code, (descriptor) => t(descriptor))
						: formatExchangeActionError(err, t`Send failed`, (descriptor) => t(descriptor)),
				);
			}
		} finally {
			if (submissionRef.current === submission) submissionRef.current = null;
			if (isCurrentSubmission()) onOpenChange(false);
		}
	}

	const accountTypeOptions = !accountModeReady
		? []
		: usesTradingAccount
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
				<ModalDescription>{t`Send to another Hyperliquid account. To receive USDC on Arbitrum, use Withdraw.`}</ModalDescription>
			</ModalHeader>

			<ModalContent>
				<div className="space-y-4">
					<div className="flex items-center justify-between gap-3 text-sm">
						<span className="text-fg-muted">{t`Network`}</span>
						<span>Hyperliquid (HyperCore)</span>
					</div>
					{!hasWalletAccess && (
						<div className="flex items-center gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft p-2.5 text-xs text-warning">
							<WarningCircleIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{t`Connect your wallet to send funds.`}</span>
						</div>
					)}
					{hasWalletAccess && getAccountModeAvailability(accountAbstraction) === "unsupported" ? (
						<p className="text-xs text-fg-muted">{t`Select a supported account mode before moving funds.`}</p>
					) : null}
					<TextInput
						placeholder={t`Destination address`}
						aria-label={t`Destination address`}
						value={destination}
						onChange={(e: ChangeEvent<HTMLInputElement>) => setDestination(e.target.value)}
						dir="auto"
						autoCapitalize="none"
						autoComplete="off"
						spellCheck={false}
						error={destinationError}
						disabled={isPending || !accountModeReady || !accountDataReady}
						mobileSafe
						className="max-[1000px]:min-h-11"
					/>

					<div className="flex gap-2">
						<Select
							value={accountModeReady ? activeAccountType : ""}
							onValueChange={handleAccountTypeChange}
							options={accountTypeOptions}
							triggerAriaLabel={t`Account`}
							disabled={!accountModeReady || !accountDataReady || usesTradingAccount || isPending}
							className="flex-1"
						/>

						<Select
							value={accountModeReady ? selectedToken : ""}
							onValueChange={handleTokenChange}
							options={tokenSelectOptions}
							triggerAriaLabel={t`Asset`}
							disabled={isPending || !accountModeReady || !accountDataReady}
							className="flex-1"
						/>
					</div>

					<NumberInput
						label={t`Amount`}
						labelValue={
							<>
								{t`Available`}:{" "}
								<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">
									{accountModeReady && accountDataReady
										? `${floorToString(availableBalance, decimals)} ${selectedToken}`
										: "—"}
								</span>
							</>
						}
						onLabelValueClick={handleMaxClick}
						placeholder="0.00"
						value={amount}
						onChange={(e: ChangeEvent<HTMLInputElement>) => handleAmountChange(e.target.value)}
						disabled={isPending || !accountModeReady || !accountDataReady}
						mobileSafe
						className={cn(
							"w-full tabular-nums max-[1000px]:h-11",
							accountDataReady &&
								exceedsBalance(amount, availableBalance) &&
								"border-stroke-error-strong focus:border-stroke-error-strong",
						)}
					/>

					<Button variant="filled" intent="neutral" onClick={handleSend} disabled={!canSend} className="w-full">
						<PaperPlaneTiltIcon className="me-2 size-3.5" />
						{isPending && walletIntent === "external" ? t`Confirm in wallet` : t`Send`}
					</Button>
				</div>
			</ModalContent>
		</PendingActionModal>
	);
}
