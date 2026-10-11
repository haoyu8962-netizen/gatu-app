import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowSquareOutIcon, CheckIcon, CopyIcon, LinkSimpleIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { Button, ButtonIcon } from "@sairn/ui";
import { useId } from "react";
import { BrandMotion } from "@/components/brand/brand-motion";
import { BRAND_NAME } from "@/config/brand";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { BRAND_MOTION_COPY_FEEDBACK } from "@/lib/brand/brand-motion.gen";
import { shortenAddress, useNumberFormat } from "@/lib/format";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	canApplyReferralCode,
	getBrandReferralUrl,
	getOfficialReferralUrl,
	getReferralActivationProgress,
	getReferralActivationTargetVolume,
	getReferralCumulativeVolume,
	type ReferralData,
} from "@/lib/trade/referral";
import { isSafeReferralJoinCode } from "@/lib/trade/referral-join";

interface Props {
	actionsDisabled: boolean;
	actionsUnavailableReason?: string | null;
	data: ReferralData;
	invitationCode?: string;
	onApplyCode: () => void;
	onCreateCode: () => void;
}

export function ReferralCodeCard({
	actionsDisabled,
	actionsUnavailableReason = null,
	data,
	invitationCode,
	onApplyCode,
	onCreateCode,
}: Props) {
	const { formatNumber, formatUSD } = useNumberFormat();
	const { t } = useLingui();
	const { env } = useHyperliquid();
	const createReasonId = useId();
	const applyReasonId = useId();
	const codeCopy = useCopyToClipboard();
	const linkCopy = useCopyToClipboard();
	const readyState = data.referrerState.stage === "ready" ? data.referrerState : null;
	const code = readyState?.data.code ?? null;
	const officialReferralUrl = code ? getOfficialReferralUrl(code, env) : null;
	const usesBrandInvitationLink = code ? isSafeReferralJoinCode(code) : false;
	const referralUrl = code
		? usesBrandInvitationLink
			? getBrandReferralUrl(code, env)
			: getOfficialReferralUrl(code, env)
		: null;
	const activationProgress = getReferralActivationProgress(data);
	const activationTarget = getReferralActivationTargetVolume(data);
	const cumulativeVolume = getReferralCumulativeVolume(data);
	const canApplyCode = canApplyReferralCode(data);
	const currentStep =
		data.referrerState.stage === "needToTrade" ? 1 : data.referrerState.stage === "needToCreateCode" ? 2 : 3;

	async function share() {
		if (!referralUrl || !code) return;
		if (typeof navigator.share !== "function") {
			await linkCopy.copy(referralUrl);
			return;
		}
		try {
			await navigator.share({
				title: t`Trade on Hyperliquid`,
				text: t`Use referral code ${code} when joining Hyperliquid.`,
				url: referralUrl,
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			await linkCopy.copy(referralUrl);
		}
	}

	return (
		<article className="h-full rounded-16 border border-stroke-weak bg-surface px-3 py-3 min-[1001px]:px-4 min-[1001px]:py-3.5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-xs font-bold text-fg min-[1001px]:text-2sm">
						<Trans>Your referral</Trans>
					</h2>
					<p className="mt-1 text-2xs leading-4 text-fg-muted max-[1000px]:hidden">
						<Trans>Complete the protocol stages, then share your official Hyperliquid referral link.</Trans>
					</p>
				</div>
				<span className="rounded-full border border-stroke-signal/30 bg-signal-soft px-2 py-0.5 text-2xs font-semibold text-signal">
					<Trans>Step {currentStep} of 3</Trans>
				</span>
			</div>

			<ol className="mt-3 grid grid-cols-3 gap-1.5" aria-label={t`Referral activation progress`}>
				{[t`Trade`, t`Create code`, t`Invite traders`].map((label, index) => {
					const step = index + 1;
					const complete = step < currentStep;
					const active = step === currentStep;
					return (
						<li
							key={label}
							className={
								active
									? "flex min-w-0 items-center gap-1.5 overflow-hidden rounded-16 bg-fill-weaker px-1.5 py-2 min-[1001px]:px-2"
									: "flex min-w-0 items-center gap-1.5 overflow-hidden rounded-16 px-1.5 py-2 min-[1001px]:px-2"
							}
						>
							<span
								className={
									complete
										? "grid size-4 shrink-0 place-items-center rounded-full bg-success text-fg-inverse"
										: active
											? "grid size-4 shrink-0 place-items-center rounded-full bg-action text-3xs font-semibold text-on-action"
											: "grid size-4 shrink-0 place-items-center rounded-full border border-stroke-strong text-3xs text-fg-muted"
								}
							>
								{complete ? <CheckIcon className="size-2.5" weight="bold" /> : step}
							</span>
							<p className="min-w-0 flex-1 text-balance break-words text-2xs font-medium text-fg-muted">{label}</p>
						</li>
					);
				})}
			</ol>

			{data.referrerState.stage === "needToTrade" ? (
				<div className="mt-3 rounded-16 bg-warning-soft px-3 py-2.5">
					<div className="flex items-center justify-between gap-3 text-xs">
						<span className="text-fg-muted">
							<Trans>Trading volume progress</Trans>
						</span>
						<span className="font-semibold tabular-nums text-fg">
							{formatUSD(cumulativeVolume, { compact: true })} / {formatUSD(activationTarget ?? "0", { compact: true })}
						</span>
					</div>
					<div
						role="progressbar"
						aria-label={t`Trading volume progress`}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={activationProgress ?? 0}
						className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill-press"
					>
						<div className="h-full rounded-full bg-action" style={{ width: `${activationProgress ?? 0}%` }} />
					</div>
					<p className="mt-1.5 text-2xs leading-4 text-fg-muted">
						<Trans>Hyperliquid will unlock code creation when the required volume is confirmed.</Trans>
					</p>
				</div>
			) : null}

			{data.referrerState.stage === "needToCreateCode" ? (
				<div className="mt-3 py-3">
					<p className="text-xs font-semibold text-fg">
						<Trans>You are eligible to create a referral code.</Trans>
					</p>
					<p className="mt-1 text-2xs leading-4 text-fg-muted">
						<Trans>Codes support 1–20 characters. Availability is confirmed by Hyperliquid when submitted.</Trans>
					</p>
					<Button
						size="sm"
						className="mt-3 w-full min-[1001px]:w-auto"
						aria-describedby={actionsUnavailableReason ? createReasonId : undefined}
						disabled={actionsDisabled}
						focusableWhenDisabled={actionsUnavailableReason !== null}
						onClick={onCreateCode}
					>
						<Trans>Create referral code</Trans>
					</Button>
					{actionsUnavailableReason ? (
						<p id={createReasonId} className="mt-1.5 text-2xs leading-4 text-fg-muted">
							{actionsUnavailableReason}
						</p>
					) : null}
				</div>
			) : null}

			{code && referralUrl ? (
				<div className="mt-3 space-y-2.5">
					<div>
						<p className="text-2xs font-medium uppercase tracking-wide text-fg-muted">
							<Trans>Referral code</Trans>
						</p>
						<div className="mt-1 flex min-h-[50px] items-center gap-2 rounded-16 border border-stroke-weak bg-fill-weaker px-3 py-2.5">
							<span className="min-w-0 flex-1 break-all text-lg font-bold tracking-wider text-fg">{code}</span>
							<ButtonIcon
								variant="ghost"
								intent="neutral"
								size="sm"
								aria-label={codeCopy.copied ? t`Code copied` : t`Copy referral code`}
								onClick={() => void codeCopy.copy(code)}
							>
								{codeCopy.copied ? (
									<BrandMotion motion={BRAND_MOTION_COPY_FEEDBACK} size={16} />
								) : (
									<CopyIcon className="size-4" />
								)}
							</ButtonIcon>
						</div>
					</div>
					<div>
						<p className="text-2xs font-medium uppercase tracking-wide text-fg-muted">
							{usesBrandInvitationLink ? (
								<Trans>{BRAND_NAME} invitation link</Trans>
							) : (
								<Trans>Official referral link</Trans>
							)}
						</p>
						<div className="mt-1 flex min-h-[39px] items-center gap-2 rounded-16 border border-stroke-weak px-3 py-2">
							<LinkSimpleIcon className="size-4 shrink-0 text-fg-muted" />
							<span className="min-w-0 flex-1 truncate text-xs text-fg min-[1001px]:text-2sm">{referralUrl}</span>
							<ButtonIcon
								variant="ghost"
								intent="neutral"
								size="sm"
								aria-label={linkCopy.copied ? t`Link copied` : t`Copy referral link`}
								onClick={() => void linkCopy.copy(referralUrl)}
							>
								{linkCopy.copied ? (
									<BrandMotion motion={BRAND_MOTION_COPY_FEEDBACK} size={16} />
								) : (
									<CopyIcon className="size-4" />
								)}
							</ButtonIcon>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							intent="neutral"
							size="sm"
							iconLeft={<ShareNetworkIcon />}
							onClick={() => void share()}
						>
							<Trans>Share</Trans>
						</Button>
						{usesBrandInvitationLink ? (
							<Button
								variant="outline"
								intent="neutral"
								size="sm"
								iconLeft={<ArrowSquareOutIcon />}
								onClick={() => officialReferralUrl && window.open(officialReferralUrl, "_blank", "noopener,noreferrer")}
							>
								<Trans>Open official link</Trans>
							</Button>
						) : null}
					</div>
				</div>
			) : null}

			<div className="mt-3 border-t border-stroke-weak pt-3">
				{data.referredBy ? (
					<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
						<span className="text-fg-muted">
							<Trans>Your account was referred by</Trans>
						</span>
						<span className="font-medium text-fg">
							<bdi dir="ltr">
								{data.referredBy.code} · {shortenAddress(data.referredBy.referrer)}
							</bdi>
						</span>
					</div>
				) : canApplyCode ? (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-xs font-medium text-fg">
								{invitationCode ? <Trans>Invitation ready to review</Trans> : <Trans>Have a referral code?</Trans>}
							</p>
							<p className="mt-0.5 text-2xs text-fg-muted">
								{invitationCode ? (
									<Trans>Review the code from this invitation before applying it.</Trans>
								) : (
									<Trans>A valid code may unlock the active referral fee discount.</Trans>
								)}
							</p>
						</div>
						<Button
							variant="outline"
							intent="brand"
							size="sm"
							aria-describedby={actionsUnavailableReason ? applyReasonId : undefined}
							disabled={actionsDisabled}
							focusableWhenDisabled={actionsUnavailableReason !== null}
							onClick={onApplyCode}
						>
							{invitationCode ? <Trans>Review invitation</Trans> : <Trans>Enter code</Trans>}
						</Button>
						{actionsUnavailableReason ? (
							<p id={applyReasonId} className="basis-full text-2xs leading-4 text-fg-muted">
								{actionsUnavailableReason}
							</p>
						) : null}
					</div>
				) : (
					<p className="text-xs leading-5 text-fg-muted">
						<Trans>Referral codes cannot be applied after cumulative volume exceeds $10,000.</Trans>
					</p>
				)}
			</div>

			<p className="sr-only">
				<Trans>Cumulative volume: {formatNumber(cumulativeVolume)}</Trans>
			</p>
		</article>
	);
}
