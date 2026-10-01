import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, SpinnerGapIcon, XCircleIcon } from "@phosphor-icons/react";
import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@sairn/ui";
import type { ReactNode } from "react";
import { BrandMotion } from "@/components/brand/brand-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	BRAND_MOTION_AWAITING_RESULT,
	BRAND_MOTION_CANCELLED,
	BRAND_MOTION_ERROR,
	BRAND_MOTION_SUBMITTING,
	BRAND_MOTION_SUCCESS,
	BRAND_MOTION_UNKNOWN,
	BRAND_MOTION_WALLET_AWAITING,
} from "@/lib/brand/brand-motion.gen";
import type { BrandMotionDefinition } from "@/lib/brand/status-glyph.gen";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format";
import { ApiWalletCredentialBox } from "./api-wallet-credential-box";
import type {
	ApiWalletActionResult,
	ApiWalletActionSigner,
	ApiWalletActionStage,
	ApiWalletActionView,
} from "./api-wallet-view";

const ACTION_STAGE_ORDER: ApiWalletActionStage[] = ["review", "awaiting", "submitted", "reconciling", "done"];

interface Props {
	action: ApiWalletActionView;
	onClose: () => void;
	onConfirm: () => void;
	onVerifyAgain: () => void;
	onTogglePrivateKey: () => void;
	onDownloadCredential: () => void;
	onCredentialSavedChange: (saved: boolean) => void;
	onFinish: () => void;
}

type StepStatus = "complete" | "current" | "failed" | "waiting";

function getFailureStageIndex(result: ApiWalletActionResult | undefined): number {
	if (result === "rejected") return ACTION_STAGE_ORDER.indexOf("awaiting");
	if (result === "apiError") return ACTION_STAGE_ORDER.indexOf("submitted");
	if (result === "unknown") return ACTION_STAGE_ORDER.indexOf("submitted");
	return ACTION_STAGE_ORDER.indexOf("done");
}

function getStepStatus(action: ApiWalletActionView, step: ApiWalletActionStage): StepStatus {
	const stepIndex = ACTION_STAGE_ORDER.indexOf(step);
	const currentIndex = ACTION_STAGE_ORDER.indexOf(action.stage);

	if (action.stage !== "done") {
		if (stepIndex < currentIndex) return "complete";
		if (stepIndex === currentIndex) return "current";
		return "waiting";
	}

	if (action.result === "success") return "complete";
	const failureIndex = getFailureStageIndex(action.result);
	if (stepIndex < failureIndex) return "complete";
	if (stepIndex === failureIndex) return action.result === "unknown" ? "current" : "failed";
	return "waiting";
}

function getStepLabel(step: ApiWalletActionStage): ReactNode {
	if (step === "review") return <Trans>Review</Trans>;
	if (step === "awaiting") return <Trans>Sign</Trans>;
	if (step === "submitted") return <Trans>Submit</Trans>;
	if (step === "reconciling") return <Trans>Verify</Trans>;
	return <Trans>Done</Trans>;
}

function ActionStepper({ action }: { action: ApiWalletActionView }) {
	const { t } = useLingui();
	return (
		<ol className="grid grid-cols-5 gap-1" aria-label={t`API wallet action progress`}>
			{ACTION_STAGE_ORDER.map((step) => {
				const status = getStepStatus(action, step);
				return (
					<li
						key={step}
						className="flex min-w-0 flex-col items-center gap-1 text-center"
						aria-current={status === "current" ? "step" : undefined}
					>
						<span
							className={cn(
								"grid size-[var(--api-wallet-step-dot-size)] place-items-center rounded-full text-3xs font-bold",
								status === "complete" && "bg-success text-fg-inverse",
								status === "current" && "bg-api-wallet-control text-api-wallet-on-control",
								status === "failed" && "bg-error text-fg-inverse",
								status === "waiting" && "bg-fill-weak text-api-wallet-subtle",
							)}
							aria-hidden="true"
						>
							{status === "complete" ? (
								<CheckIcon className="size-2.5" weight="bold" />
							) : status === "failed" ? (
								<XCircleIcon className="size-2.5" weight="fill" />
							) : null}
						</span>
						<span
							className={cn(
								"w-full truncate text-3xs",
								status === "current" && "font-bold text-api-wallet-fg",
								status === "complete" && "font-medium text-api-wallet-fg",
								status === "failed" && "font-bold text-error",
								status === "waiting" && "text-api-wallet-subtle",
							)}
						>
							{getStepLabel(step)}
							{status === "complete" ? (
								<span className="sr-only">
									{" "}
									— <Trans>Completed</Trans>
								</span>
							) : status === "failed" ? (
								<span className="sr-only">
									{" "}
									— <Trans>Failed</Trans>
								</span>
							) : null}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

function ReviewContent({ action }: { action: ApiWalletActionView }) {
	const isRemove = action.kind === "remove";
	const rows: { key: string; label: ReactNode; value: ReactNode; detail?: string; danger?: boolean; ltr?: boolean }[] =
		isRemove
			? [
					{ key: "name", label: <Trans>Name</Trans>, value: action.agentName },
					{
						key: "address",
						label: <Trans>API wallet address</Trans>,
						value: shortenAddress(action.agentAddress),
						detail: action.agentAddress,
						ltr: true,
					},
					{
						key: "validity",
						label: <Trans>Current validity</Trans>,
						value: action.validityLabel ?? <Trans>Not reported</Trans>,
					},
					{ key: "result", label: <Trans>After removal</Trans>, value: <Trans>Access disabled</Trans>, danger: true },
				]
			: [
					{ key: "name", label: <Trans>Name</Trans>, value: action.agentName },
					{
						key: "address",
						label: <Trans>API wallet address</Trans>,
						value: shortenAddress(action.agentAddress),
						detail: action.agentAddress,
						ltr: true,
					},
					{
						key: "validity",
						label: <Trans>Validity</Trans>,
						value: action.validityLabel ?? <Trans>Not reported</Trans>,
					},
					{ key: "approval", label: <Trans>Approval</Trans>, value: <Trans>Account-level agent approval</Trans> },
				];

	return (
		<div className="space-y-3">
			{action.errorMessage ? (
				<p role="alert" className="rounded-16 bg-error-soft px-3 py-2 text-xs leading-5 text-error">
					{action.errorMessage}
				</p>
			) : null}
			<div className="space-y-2 py-3">
				{rows.map((row) => (
					<div key={row.key} className="flex items-start justify-between gap-3">
						<span className="shrink-0 text-xs text-api-wallet-muted">{row.label}</span>
						<span className="min-w-0 text-right">
							<span
								className={cn("block truncate text-2sm font-semibold text-api-wallet-fg", row.danger && "text-error")}
							>
								{row.ltr ? <bdi dir="ltr">{row.value}</bdi> : row.value}
							</span>
							{row.detail ? (
								<span
									className="block truncate font-mono text-3xs tabular-nums text-api-wallet-subtle"
									title={String(row.detail)}
								>
									{row.ltr ? <bdi dir="ltr">{row.detail}</bdi> : row.detail}
								</span>
							) : null}
						</span>
					</div>
				))}
			</div>

			{isRemove ? (
				<p role="alert" className="text-xs leading-5 text-error">
					<Trans>
						Removing this approval immediately stops programs using this exact API wallet. Restoring access requires a
						new approval.
					</Trans>
				</p>
			) : (
				<div className="rounded-20 border border-dashed border-api-wallet-stroke-input px-3 py-2.5">
					<p className="text-xs font-semibold text-api-wallet-fg">
						<Trans>Private-key handling</Trans>
					</p>
					<p className="mt-1 text-xs leading-5 text-api-wallet-muted">
						<Trans>
							Only the public address is submitted for approval. After fresh extraAgents data confirms the approval, the
							private key is shown once for download and secure storage.
						</Trans>
					</p>
				</div>
			)}
		</div>
	);
}

function getApiWalletProgressMotion(stage: ApiWalletActionStage, signsSilently: boolean): BrandMotionDefinition {
	if (stage === "awaiting") return signsSilently ? BRAND_MOTION_SUBMITTING : BRAND_MOTION_WALLET_AWAITING;
	if (stage === "submitted") return BRAND_MOTION_SUBMITTING;
	return BRAND_MOTION_AWAITING_RESULT;
}

function getApiWalletResultMotion(result: ApiWalletActionResult): BrandMotionDefinition {
	if (result === "success") return BRAND_MOTION_SUCCESS;
	if (result === "rejected") return BRAND_MOTION_CANCELLED;
	if (result === "apiError") return BRAND_MOTION_ERROR;
	return BRAND_MOTION_UNKNOWN;
}

function ProgressContent({
	stage,
	signer,
}: {
	stage: ApiWalletActionStage;
	signer: ApiWalletActionSigner | undefined;
}) {
	const signsSilently = signer === "embedded";
	const progressMotion = getApiWalletProgressMotion(stage, signsSilently);
	return (
		<div className="flex flex-col items-center gap-3 py-2 text-center" aria-live="polite">
			<BrandMotion key={progressMotion.id} motion={progressMotion} size={64} />
			<span className="sr-only">
				<Trans>Processing</Trans>
			</span>
			<div>
				<p className="text-sm font-bold text-api-wallet-fg">
					{stage === "awaiting" ? (
						signsSilently ? (
							<Trans>Signing with your email wallet</Trans>
						) : (
							<Trans>Waiting for wallet signature</Trans>
						)
					) : stage === "submitted" ? (
						<Trans>Submitting to Hyperliquid</Trans>
					) : (
						<Trans>Verifying the result</Trans>
					)}
				</p>
				<p className="mt-1 text-xs leading-5 text-api-wallet-muted">
					{stage === "awaiting" ? (
						signsSilently ? (
							<Trans>
								Your email wallet signs the reviewed request automatically. Nothing changes before Hyperliquid accepts
								it.
							</Trans>
						) : (
							<Trans>Confirm the request in the matching master wallet. Nothing changes before you approve it.</Trans>
						)
					) : stage === "submitted" ? (
						<Trans>The signed request has been submitted. Keep this window open.</Trans>
					) : (
						<Trans>Fresh extraAgents data is being checked before the result is accepted.</Trans>
					)}
				</p>
			</div>
			<p className="text-2xs leading-5 text-api-wallet-subtle">
				<Trans>This window stays locked until the request reaches a verifiable result.</Trans>
			</p>
		</div>
	);
}

function ResultContent({ action }: { action: ApiWalletActionView }) {
	const result = action.result ?? "unknown";
	const isSuccess = result === "success";
	const resultMotion = getApiWalletResultMotion(result);
	const title = isSuccess ? (
		action.kind === "authorize" ? (
			<Trans>API wallet authorized</Trans>
		) : (
			<Trans>API wallet removed</Trans>
		)
	) : result === "rejected" ? (
		<Trans>Signature rejected</Trans>
	) : result === "apiError" ? (
		<Trans>Hyperliquid rejected the request</Trans>
	) : (
		<Trans>Result not yet confirmed</Trans>
	);
	const description = isSuccess ? (
		action.kind === "authorize" ? (
			<Trans>The exact name and public address are now present in fresh extraAgents data.</Trans>
		) : (
			<Trans>Neither the exact name nor the old public address appears in fresh extraAgents data.</Trans>
		)
	) : result === "rejected" ? (
		<Trans>The wallet did not sign, so no request was submitted. You can review the details and try again.</Trans>
	) : result === "apiError" ? (
		<Trans>Review fresh API wallet data before creating another signed request.</Trans>
	) : (
		<Trans>
			The signed request may have succeeded, but reconciliation timed out. Do not submit it again; verify against fresh
			extraAgents data. Closing before verification discards the local key.
		</Trans>
	);

	return (
		<div className="flex flex-col items-center gap-3 py-1 text-center" aria-live="polite">
			<BrandMotion key={resultMotion.id} motion={resultMotion} size={48} />
			<div>
				<p className="text-sm font-bold text-api-wallet-fg">{title}</p>
				<p className="mt-1 text-xs leading-5 text-api-wallet-muted">{description}</p>
				{result === "apiError" && action.errorMessage ? (
					<p className="mt-2 rounded-16 bg-error-soft px-3 py-2 font-mono text-xs text-error">{action.errorMessage}</p>
				) : null}
				{result === "unknown" ? (
					<div className="mt-3 rounded-20 border border-api-wallet-stroke-card bg-api-wallet-card px-3 py-2 text-start">
						<p className="text-3xs text-api-wallet-subtle">
							<Trans>Verification reference</Trans>
						</p>
						<p className="mt-1 truncate text-xs font-semibold text-api-wallet-fg">{action.agentName}</p>
						<p className="mt-0.5 break-all font-mono text-3xs tabular-nums text-api-wallet-muted">
							{action.agentAddress}
						</p>
						{action.errorMessage ? <p className="mt-2 text-xs leading-5 text-warning">{action.errorMessage}</p> : null}
					</div>
				) : null}
			</div>
		</div>
	);
}

function ReviewPreflightStatus() {
	return (
		<output className="flex items-center justify-center gap-1.5 text-xs leading-5 text-api-wallet-muted">
			<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
			<Trans>Checking fresh API wallet data…</Trans>
		</output>
	);
}

export function ApiWalletActionModal({
	action,
	onClose,
	onConfirm,
	onVerifyAgain,
	onTogglePrivateKey,
	onDownloadCredential,
	onCredentialSavedChange,
	onFinish,
}: Props) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const isProgress = action.stage === "awaiting" || action.stage === "submitted" || action.stage === "reconciling";
	const result = action.result ?? "unknown";
	const credentialReady = action.credentialDownloaded && action.credentialSaved;
	const credentialsPending =
		action.stage === "done" && result === "success" && action.kind === "authorize" && !credentialReady;
	const requiresExplicitDiscard = action.stage === "done" && result === "unknown" && action.kind === "authorize";
	const locked = action.locked || isProgress || credentialsPending || requiresExplicitDiscard;

	return (
		<AdaptiveModal
			open={action.open}
			onOpenChange={(open) => !open && onClose()}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={!locked}
			showClose={!isMobile && !locked}
			showHandle={isMobile && !locked}
			layer="blocking"
			closeLabel={t`Close API wallet action`}
			className={cn(
				"max-h-[calc(100dvh-var(--api-wallet-modal-viewport-gap))] bg-modal shadow-api-wallet-modal data-starting-style:scale-100 data-ending-style:scale-100",
				isMobile ? "rounded-t-32" : "max-w-[var(--api-wallet-modal-width)] rounded-32",
			)}
		>
			<ModalHeader divider={false} className="px-4 pt-6 pb-2">
				<ModalTitle
					className={cn(
						"font-bold text-api-wallet-fg",
						isMobile
							? "text-base"
							: "text-[length:var(--api-wallet-modal-title-font-size)] leading-[var(--api-wallet-modal-title-line-height)]",
					)}
				>
					{action.kind === "authorize" ? <Trans>Authorize API wallet</Trans> : <Trans>Remove API wallet</Trans>}
				</ModalTitle>
				<ModalDescription className="text-xs leading-5 text-api-wallet-muted">
					{action.kind === "authorize" ? (
						<Trans>The matching master wallet signs this account-level agent approval.</Trans>
					) : (
						<Trans>Programs using this exact API wallet lose access after removal is verified.</Trans>
					)}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4 px-4 py-3" aria-busy={action.locked || undefined}>
				<ActionStepper action={action} />
				{action.stage === "review" ? <ReviewContent action={action} /> : null}
				{action.stage === "review" && action.locked ? <ReviewPreflightStatus /> : null}
				{isProgress ? <ProgressContent stage={action.stage} signer={action.signer} /> : null}
				{action.stage === "done" ? (
					<div>
						<ResultContent action={action} />
						{result === "success" && action.kind === "authorize" ? (
							<div className="mt-3">
								<ApiWalletCredentialBox
									address={action.agentAddress}
									privateKey={action.privateKey}
									privateKeyVisible={action.privateKeyVisible ?? false}
									downloaded={action.credentialDownloaded ?? false}
									saved={action.credentialSaved ?? false}
									onTogglePrivateKey={onTogglePrivateKey}
									onDownload={onDownloadCredential}
									onSavedChange={onCredentialSavedChange}
								/>
							</div>
						) : null}
					</div>
				) : null}
			</ModalContent>

			<ModalFooter className="gap-2 px-4 pt-1 pb-5">
				{action.stage === "review" ? (
					<>
						<Button
							type="button"
							variant="outline"
							intent="neutral"
							size={isMobile ? "lg" : "md"}
							className="flex-1 rounded-20 active:scale-100"
							disabled={action.locked}
							onClick={onClose}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							type="button"
							intent={action.kind === "remove" ? "error" : "brand"}
							size={isMobile ? "lg" : "md"}
							className={cn(
								"flex-1 rounded-20 active:scale-100",
								action.kind === "authorize" && "bg-api-wallet-control text-api-wallet-on-control",
							)}
							disabled={action.locked}
							onClick={onConfirm}
						>
							{action.kind === "remove" ? <Trans>Confirm removal</Trans> : <Trans>Sign and authorize</Trans>}
						</Button>
					</>
				) : isProgress ? null : result === "success" ? (
					<Button
						type="button"
						size={isMobile ? "lg" : "md"}
						className="w-full rounded-20 bg-api-wallet-control text-api-wallet-on-control active:scale-100"
						disabled={action.kind === "authorize" && !credentialReady}
						onClick={onFinish}
					>
						<Trans>Finish</Trans>
					</Button>
				) : result === "unknown" ? (
					<>
						<Button
							type="button"
							variant="outline"
							intent={action.kind === "authorize" ? "error" : "neutral"}
							size={isMobile ? "lg" : "md"}
							className="flex-1 rounded-20 active:scale-100"
							onClick={onClose}
						>
							{action.kind === "authorize" ? <Trans>Discard local key</Trans> : <Trans>Close</Trans>}
						</Button>
						<Button
							type="button"
							size={isMobile ? "lg" : "md"}
							className="flex-1 rounded-20 bg-api-wallet-control text-api-wallet-on-control active:scale-100"
							onClick={onVerifyAgain}
						>
							<Trans>Verify again</Trans>
						</Button>
					</>
				) : (
					<>
						<Button
							type="button"
							variant="outline"
							intent="neutral"
							size={isMobile ? "lg" : "md"}
							className="flex-1 rounded-20 active:scale-100"
							onClick={onClose}
						>
							<Trans>Close</Trans>
						</Button>
						<Button
							type="button"
							size={isMobile ? "lg" : "md"}
							className="flex-1 rounded-20 bg-api-wallet-control text-api-wallet-on-control active:scale-100"
							onClick={onConfirm}
						>
							<Trans>Review request</Trans>
						</Button>
					</>
				)}
			</ModalFooter>
		</AdaptiveModal>
	);
}
