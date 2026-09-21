import {
	AdaptiveModal,
	Button,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
	TextInput,
} from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import { type ReferralAction, ReferralActionStatusUnknownError } from "@/hooks/trade/use-referral-actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatExchangeActionError, isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { formatToken } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { ReferralRewardRow } from "@/lib/trade/referral";

type Step = "form" | "review";

interface Props {
	action: ReferralAction;
	unclaimedRewards: ReferralRewardRow[];
	initialCode?: string;
	onClose: () => void;
	onSubmit: (action: ReferralAction, code?: string) => Promise<void>;
}

export function ReferralActionModal({ action, unclaimedRewards, initialCode, onClose, onSubmit }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const isReferralCodeLocked = action === "apply" && initialCode !== undefined;
	const lockedReferralCode = isReferralCodeLocked ? initialCode : undefined;
	const [code, setCode] = useState(initialCode ?? "");
	const [step, setStep] = useState<Step>(action === "claim" || initialCode !== undefined ? "review" : "form");
	const submittedRef = useRef(false);
	const submittedCode = lockedReferralCode ?? code;
	const codeValid = submittedCode.length >= 1 && submittedCode.length <= 20;
	const title =
		action === "apply" ? t`Enter referral code` : action === "create" ? t`Create referral code` : t`Claim rewards`;

	function close() {
		if (!submittedRef.current) onClose();
	}

	function getSuccessTitle(): string {
		if (action === "claim") return t`Rewards claimed`;
		if (action === "apply") return t`Referral code applied`;
		return t`Referral code created`;
	}

	async function submit() {
		if (submittedRef.current) return;
		if ((action === "apply" || action === "create") && !codeValid) return;
		submittedRef.current = true;
		onClose();
		try {
			await onSubmit(action, action === "claim" ? undefined : submittedCode);
			toast.success(getSuccessTitle(), {
				description: t`The page is refreshing from Hyperliquid. Recent changes can take a moment to appear.`,
				duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
			});
		} catch (submitError) {
			const description = (
				<span className="flex flex-col gap-1">
					<span>{formatExchangeActionError(submitError, t`Referral request could not be completed.`)}</span>
					<span>{t`Refresh referral data before submitting another signed request.`}</span>
				</span>
			);
			if (submitError instanceof ReferralActionStatusUnknownError || isAmbiguousExchangeActionError(submitError)) {
				toast.warning(t`Request not confirmed`, {
					description,
					duration: Number.POSITIVE_INFINITY,
					closeButton: true,
				});
			} else {
				toast.error(t`Request not confirmed`, { description, duration: FUNDS_OUTCOME_TOAST_DURATION_MS });
			}
		}
	}

	return (
		<AdaptiveModal
			open
			onOpenChange={(open) => !open && close()}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible
			showClose={!isMobile}
			closeLabel={t`Close`}
			showHandle={isMobile}
			handleClassName="top-2 h-1 w-9 !rounded-4 bg-fill/30"
			layer="blocking"
			className="max-h-[calc(100dvh-1rem)] rounded-t-32 min-[1001px]:max-w-[25rem] min-[1001px]:rounded-32"
		>
			<ModalHeader divider={false} className="px-4 pt-6 pb-2 min-[1001px]:px-6">
				<ModalTitle className="text-base font-bold">{title}</ModalTitle>
				<ModalDescription>
					{action === "apply" ? (
						<Trans>A referral code can only be applied once and cannot be changed from this page.</Trans>
					) : action === "create" ? (
						<Trans>
							Create a code after Hyperliquid confirms your eligibility. It cannot be changed from this page later.
						</Trans>
					) : (
						<Trans>
							Hyperliquid verifies the listed unclaimed rewards and credits eligible rewards to your Spot balance.
						</Trans>
					)}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4 px-4 py-4 min-[1001px]:px-6">
				{step === "form" ? (
					<TextInput
						label={t`Referral code`}
						value={code}
						onChange={(event) => setCode(event.target.value)}
						maxLength={20}
						autoCapitalize="off"
						autoComplete="off"
						spellCheck={false}
						size="lg"
						placeholder={t`1–20 characters`}
						hint={t`${code.length}/20 characters`}
					/>
				) : null}

				{step === "review" ? (
					<div className="space-y-3">
						{action === "claim" ? (
							<div className="divide-y divide-stroke-weak">
								{unclaimedRewards.map((reward) => (
									<div key={reward.tokenId} className="flex items-center justify-between gap-4 px-4 py-3">
										<span className="text-sm text-fg-muted">{reward.name}</span>
										<span className="text-sm font-semibold tabular-nums text-fg">
											{formatToken(reward.unclaimedRewards, {
												symbol: reward.name,
												maximumFractionDigits: reward.weiDecimals ?? 8,
											})}
										</span>
									</div>
								))}
							</div>
						) : (
							<div className="py-4">
								<p className="text-xs text-fg-muted">
									{action === "apply" ? <Trans>Code to apply</Trans> : <Trans>Code to create</Trans>}
								</p>
								<p className="mt-1 break-all text-lg font-semibold text-fg">{submittedCode}</p>
							</div>
						)}
						<p className="flex items-start gap-2 rounded-20 bg-warning-soft px-3 py-2.5 text-xs leading-5 text-warning">
							<WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
							<span>
								<Trans>Your trading wallet signs this request. Signed requests are never retried automatically.</Trans>
							</span>
						</p>
					</div>
				) : null}
			</ModalContent>

			<ModalFooter className="gap-2 px-4 pt-0 pb-5 min-[1001px]:px-6">
				{step === "form" ? (
					<>
						<Button variant="outline" intent="neutral" className="flex-1" onClick={close}>
							<Trans>Cancel</Trans>
						</Button>
						<Button className="flex-1" disabled={!codeValid} onClick={() => setStep("review")}>
							<Trans>Review</Trans>
						</Button>
					</>
				) : (
					<>
						<Button
							variant="outline"
							intent="neutral"
							className="flex-1"
							onClick={() => (action === "claim" || isReferralCodeLocked ? close() : setStep("form"))}
						>
							{action === "claim" || isReferralCodeLocked ? <Trans>Cancel</Trans> : <Trans>Back</Trans>}
						</Button>
						<Button className="flex-1" onClick={() => void submit()}>
							{action === "claim" ? <Trans>Claim all</Trans> : <Trans>Confirm</Trans>}
						</Button>
					</>
				)}
			</ModalFooter>
		</AdaptiveModal>
	);
}
