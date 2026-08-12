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
import { CheckCircleIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { ReferralAction } from "@/hooks/trade/use-referral-actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatExchangeActionError } from "@/lib/errors/format";
import { formatToken } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { ReferralRewardRow } from "@/lib/trade/referral";

type Step = "error" | "form" | "review" | "submitting" | "success";

interface Props {
	action: ReferralAction;
	claimableRewards: ReferralRewardRow[];
	onClose: () => void;
	onSubmit: (action: ReferralAction, code?: string) => Promise<void>;
}

export function ReferralActionModal({ action, claimableRewards, onClose, onSubmit }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [step, setStep] = useState<Step>(action === "claim" ? "review" : "form");
	const isSubmitting = step === "submitting";
	const codeValid = code.length >= 1 && code.length <= 20;
	const title =
		action === "apply" ? t`Enter referral code` : action === "create" ? t`Create referral code` : t`Claim rewards`;

	function close() {
		if (!isSubmitting) onClose();
	}

	async function submit() {
		if ((action === "apply" || action === "create") && !codeValid) return;
		setError(null);
		setStep("submitting");
		try {
			await onSubmit(action, action === "claim" ? undefined : code);
			setStep("success");
		} catch (submitError) {
			setError(formatExchangeActionError(submitError, t`Referral request could not be completed.`));
			setStep("error");
		}
	}

	return (
		<AdaptiveModal
			open
			onOpenChange={(open) => !open && close()}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={!isSubmitting}
			showClose={!isMobile && !isSubmitting}
			showHandle={isMobile && !isSubmitting}
			handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-fill/30"
			layer="blocking"
			className="max-h-[calc(100dvh-1rem)] rounded-t-[18px] min-[1001px]:max-w-[25rem] min-[1001px]:rounded-[16px]"
		>
			<ModalHeader divider={false} className="px-4 pt-6 pb-2 min-[1001px]:px-6">
				<ModalTitle className="text-base font-bold min-[1001px]:text-[17px]">{title}</ModalTitle>
				<ModalDescription>
					{action === "apply" ? (
						<Trans>A referral code can only be applied once and cannot be changed from this page.</Trans>
					) : action === "create" ? (
						<Trans>
							Create a code after Hyperliquid confirms your eligibility. It cannot be changed from this page later.
						</Trans>
					) : (
						<Trans>All currently available referral rewards are claimed to your Spot balance.</Trans>
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
							<div className="divide-y divide-stroke-weak overflow-hidden rounded-[12px] border border-stroke-weak">
								{claimableRewards.map((reward) => (
									<div key={reward.tokenId} className="flex items-center justify-between gap-4 px-4 py-3">
										<span className="text-sm text-fg-muted">{reward.name}</span>
										<span className="text-sm font-semibold tabular-nums text-fg">
											{formatToken(reward.claimableRewards, {
												symbol: reward.name,
												maximumFractionDigits: reward.weiDecimals ?? 8,
											})}
										</span>
									</div>
								))}
							</div>
						) : (
							<div className="rounded-[12px] border border-stroke-weak bg-fill-weak p-4">
								<p className="text-xs text-fg-muted">
									{action === "apply" ? <Trans>Code to apply</Trans> : <Trans>Code to create</Trans>}
								</p>
								<p className="mt-1 break-all text-lg font-semibold text-fg">{code}</p>
							</div>
						)}
						<p className="flex items-start gap-2 rounded-[10px] bg-warning-soft px-3 py-2.5 text-xs leading-5 text-warning">
							<WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
							<span>
								<Trans>
									The approved Hyperliquid Agent signs this request. Signed requests are never retried automatically.
								</Trans>
							</span>
						</p>
					</div>
				) : null}

				{step === "submitting" ? (
					<output aria-live="polite" className="flex flex-col items-center gap-3 py-8 text-center">
						<SpinnerGapIcon className="size-8 animate-spin text-brand motion-reduce:animate-none" />
						<p className="text-sm font-semibold text-fg">
							<Trans>Waiting for confirmation</Trans>
						</p>
						<p className="text-xs text-fg-muted">
							<Trans>Keep this window open while Hyperliquid processes the request.</Trans>
						</p>
					</output>
				) : null}

				{step === "success" ? (
					<output aria-live="polite" className="flex flex-col items-center gap-3 py-8 text-center">
						<CheckCircleIcon weight="fill" className="size-9 text-success" />
						<p className="text-base font-semibold text-fg">
							{action === "claim" ? (
								<Trans>Rewards claimed</Trans>
							) : action === "apply" ? (
								<Trans>Referral code applied</Trans>
							) : (
								<Trans>Referral code created</Trans>
							)}
						</p>
						<p className="text-xs leading-5 text-fg-muted">
							<Trans>The page is refreshing from Hyperliquid. Recent changes can take a moment to appear.</Trans>
						</p>
					</output>
				) : null}

				{step === "error" ? (
					<div role="alert" className="flex flex-col items-center gap-3 py-7 text-center">
						<WarningCircleIcon weight="fill" className="size-9 text-error" />
						<p className="text-base font-semibold text-fg">
							<Trans>Request not confirmed</Trans>
						</p>
						<p className="text-xs leading-5 text-error">{error}</p>
						<p className="text-xs leading-5 text-fg-muted">
							<Trans>Refresh referral data before submitting another signed request.</Trans>
						</p>
					</div>
				) : null}
			</ModalContent>

			<ModalFooter className="gap-2 px-4 pt-0 pb-5 min-[1001px]:px-6">
				{step === "form" ? (
					<>
						<Button variant="outline" intent="neutral" className="flex-1 rounded-[10px]" onClick={close}>
							<Trans>Cancel</Trans>
						</Button>
						<Button className="flex-1 rounded-[10px]" disabled={!codeValid} onClick={() => setStep("review")}>
							<Trans>Review</Trans>
						</Button>
					</>
				) : step === "review" ? (
					<>
						<Button
							variant="outline"
							intent="neutral"
							className="flex-1 rounded-[10px]"
							onClick={() => (action === "claim" ? close() : setStep("form"))}
						>
							<Trans>Back</Trans>
						</Button>
						<Button className="flex-1 rounded-[10px]" onClick={() => void submit()}>
							{action === "claim" ? <Trans>Claim all</Trans> : <Trans>Confirm</Trans>}
						</Button>
					</>
				) : step === "success" || step === "error" ? (
					<Button className="w-full rounded-[10px]" onClick={close}>
						<Trans>Close</Trans>
					</Button>
				) : null}
			</ModalFooter>
		</AdaptiveModal>
	);
}
