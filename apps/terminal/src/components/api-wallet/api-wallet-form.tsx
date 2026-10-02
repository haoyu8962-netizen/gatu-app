import { Trans, useLingui } from "@lingui/react/macro";
import { KeyIcon } from "@phosphor-icons/react";
import { Button, RadioGroup, RadioGroupItem, Select, TextInput } from "@sairn/ui";
import { useId } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import type { ApiWalletPageState, ApiWalletValidityDays } from "./api-wallet-view";

const VALIDITY_OPTIONS: ApiWalletValidityDays[] = [30, 90, 180];

interface Props {
	pageState: ApiWalletPageState;
	name: string;
	nameError?: string;
	generatedAddress?: string;
	validityDays: ApiWalletValidityDays;
	canGenerate: boolean;
	canAuthorize: boolean;
	onNameChange: (name: string) => void;
	onValidityChange: (validityDays: ApiWalletValidityDays) => void;
	onGenerate: () => void;
	onAuthorize: () => void;
	onConnect: () => void;
}

function isValidityDays(value: string | null): value is `${ApiWalletValidityDays}` {
	return value === "30" || value === "90" || value === "180";
}

export function ApiWalletForm({
	pageState,
	name,
	nameError,
	generatedAddress,
	validityDays,
	canGenerate,
	canAuthorize,
	onNameChange,
	onValidityChange,
	onGenerate,
	onAuthorize,
	onConnect,
}: Props) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const validityLegendId = useId();
	const isDisconnected = pageState === "disconnected";
	const isOperable = pageState === "normal" || pageState === "empty";
	const validityOptions = VALIDITY_OPTIONS.map((days) => ({
		value: String(days),
		label: t`${days} days`,
	}));

	return (
		<div className={cn("border-b border-api-wallet-stroke-card", isMobile ? "px-4 pb-4" : "px-5 pb-4")}>
			<div
				className={cn(
					"items-end gap-2.5",
					isMobile
						? "flex flex-col"
						: "grid grid-cols-2 min-[1200px]:[grid-template-columns:var(--api-wallet-form-columns)]",
				)}
			>
				<TextInput
					label={t`Name`}
					value={name}
					onChange={(event) => onNameChange(event.target.value)}
					maxLength={16}
					autoCapitalize="none"
					autoComplete="off"
					spellCheck={false}
					disabled={!isOperable}
					error={nameError}
					placeholder={t`For example: grid-bot`}
					size={isMobile ? "lg" : "md"}
					className={cn(
						"rounded-20 border-api-wallet-stroke-input bg-surface",
						isMobile ? "min-h-[var(--api-wallet-mobile-control-height)]" : "h-[var(--api-wallet-control-height)]",
					)}
					inputClassName="font-semibold"
					iconRight={<span className="text-2xs tabular-nums text-api-wallet-subtle">{name.length}/16</span>}
				/>

				<TextInput
					label={t`API wallet address`}
					value={generatedAddress ?? ""}
					readOnly
					disabled={!isOperable}
					placeholder={t`Generate a new local key pair`}
					size={isMobile ? "lg" : "md"}
					className={cn(
						"rounded-20 border-api-wallet-stroke-input bg-surface",
						isMobile
							? "min-h-[var(--api-wallet-mobile-control-height)] py-0 pr-1"
							: "h-[var(--api-wallet-control-height)]",
					)}
					inputClassName="truncate font-mono tabular-nums"
					iconLeft={<KeyIcon className="size-4" />}
					iconRight={
						<Button
							type="button"
							variant="link"
							intent="brand"
							size="xs"
							className={cn("shrink-0 active:scale-100", isMobile ? "touch-target px-2 py-0" : "p-0")}
							disabled={!isOperable || !canGenerate}
							onClick={onGenerate}
						>
							<Trans>Generate</Trans>
						</Button>
					}
				/>

				<div className="w-full">
					{isMobile ? (
						<fieldset disabled={!isOperable}>
							<legend id={validityLegendId} className="mb-1 text-xs font-semibold text-api-wallet-fg">
								<Trans>Validity</Trans>
							</legend>
							<RadioGroup
								value={String(validityDays)}
								orientation="horizontal"
								aria-labelledby={validityLegendId}
								className="grid grid-cols-3 gap-1.5"
								onValueChange={(value) => {
									if (typeof value === "string" && isValidityDays(value)) {
										onValidityChange(Number(value) as ApiWalletValidityDays);
									}
								}}
							>
								{VALIDITY_OPTIONS.map((days) => {
									return (
										<RadioGroupItem
											key={days}
											value={String(days)}
											size="sm"
											label={<Trans>{days} days</Trans>}
											disabled={!isOperable}
											className={cn(
												"min-h-[var(--api-wallet-mobile-control-height)] min-w-0 items-center justify-center rounded-20 border border-api-wallet-stroke-input bg-surface px-2 py-1",
												"hover:bg-api-wallet-hover [&:has([data-checked])]:border-api-wallet-control [&:has([data-checked])]:bg-api-wallet-card",
												"[&>div]:min-w-0 [&>div>span]:truncate [&>div>span]:font-semibold",
											)}
										/>
									);
								})}
							</RadioGroup>
						</fieldset>
					) : (
						<Select
							label={t`Validity`}
							options={validityOptions}
							value={String(validityDays)}
							disabled={!isOperable}
							onValueChange={(value) => {
								if (isValidityDays(value)) onValidityChange(Number(value) as ApiWalletValidityDays);
							}}
							triggerClassName="h-[var(--api-wallet-control-height)] rounded-20 border-api-wallet-stroke-input bg-surface"
							popupClassName="data-starting-style:scale-100 data-ending-style:scale-100"
						/>
					)}
				</div>

				<Button
					type="button"
					size={isMobile ? "lg" : "md"}
					className={cn(
						"w-full rounded-20 bg-api-wallet-control text-api-wallet-on-control active:scale-100",
						isMobile ? "min-h-[var(--api-wallet-mobile-control-height)]" : "h-[var(--api-wallet-control-height)]",
					)}
					disabled={!isDisconnected && (!isOperable || !canAuthorize)}
					onClick={isDisconnected ? onConnect : onAuthorize}
				>
					{isDisconnected ? <Trans>Connect wallet</Trans> : <Trans>Authorize API wallet</Trans>}
				</Button>
			</div>

			{!nameError ? (
				<p className="mt-2 text-2xs leading-5 text-api-wallet-subtle">
					<Trans>
						Generate creates a new key pair only in this browser. The private key is shown after the approval is
						verified, and it cannot be displayed again after you finish.
					</Trans>
				</p>
			) : null}
		</div>
	);
}
