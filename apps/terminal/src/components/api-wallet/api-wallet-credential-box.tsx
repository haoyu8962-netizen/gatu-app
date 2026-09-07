import { Badge, Button, Checkbox } from "@gatu/ui";
import { Trans } from "@lingui/react/macro";
import { DownloadSimpleIcon, EyeIcon, EyeSlashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ApiWalletCopyButton } from "./api-wallet-copy-button";

const MASKED_PRIVATE_KEY = "••••••••••••••••••••••••••••••••";

interface Props {
	address: string;
	privateKey?: string;
	privateKeyVisible: boolean;
	downloaded: boolean;
	saved: boolean;
	onTogglePrivateKey: () => void;
	onDownload: () => void;
	onSavedChange: (saved: boolean) => void;
}

export function ApiWalletCredentialBox({
	address,
	privateKey,
	privateKeyVisible,
	downloaded,
	saved,
	onTogglePrivateKey,
	onDownload,
	onSavedChange,
}: Props) {
	return (
		<div className="w-full space-y-3 rounded-24 border border-api-wallet-stroke-card bg-api-wallet-card p-3.5">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-2xs text-api-wallet-muted">
						<Trans>API wallet address</Trans>
					</p>
					<p className="truncate font-mono text-xs font-semibold tabular-nums text-api-wallet-fg" title={address}>
						{address}
					</p>
				</div>
				<ApiWalletCopyButton value={address} appearance="icon" />
			</div>

			<div className="space-y-2 border-t border-dashed border-api-wallet-stroke-card pt-3">
				<div className="flex items-center justify-between gap-3">
					<p className="text-2xs text-api-wallet-muted">
						<Trans>Private key — shown once</Trans>
					</p>
					<Button
						type="button"
						variant="ghost"
						intent="neutral"
						size="xs"
						className="p-0 active:scale-100"
						disabled={!privateKey}
						onClick={onTogglePrivateKey}
						iconLeft={privateKeyVisible ? <EyeSlashIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
					>
						{privateKeyVisible ? <Trans>Hide</Trans> : <Trans>Reveal</Trans>}
					</Button>
				</div>
				<div className="overflow-hidden rounded-20 border border-api-wallet-stroke-input bg-surface px-3 py-2.5">
					{privateKeyVisible && privateKey ? (
						<code className="block break-all font-mono text-xs leading-5 text-api-wallet-fg">{privateKey}</code>
					) : (
						<>
							<span className="sr-only">
								<Trans>Private key hidden</Trans>
							</span>
							<span
								aria-hidden="true"
								className="block truncate font-mono text-xs text-api-wallet-subtle [letter-spacing:var(--api-wallet-secret-tracking)]"
							>
								{MASKED_PRIVATE_KEY}
							</span>
						</>
					)}
				</div>
			</div>

			<div
				role="alert"
				className="flex items-start gap-2 rounded-20 bg-warning-soft p-2.5 text-xs leading-5 text-warning"
			>
				<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
				<p>
					<Trans>
						Download the credential now and move it to secure storage. Gatu cannot recover it after this window is
						closed.
					</Trans>
				</p>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button
					type="button"
					variant="outline"
					intent="neutral"
					size="sm"
					className="rounded-20 active:scale-100"
					disabled={!privateKey}
					onClick={onDownload}
					iconLeft={<DownloadSimpleIcon className="size-4" />}
				>
					<Trans>Download credential</Trans>
				</Button>
				{downloaded ? (
					<Badge tone="success" size="xs" dot>
						<Trans>Downloaded</Trans>
					</Badge>
				) : null}
			</div>

			<Checkbox
				checked={saved}
				disabled={!downloaded}
				onCheckedChange={(checked) => onSavedChange(checked)}
				label={<Trans>I have saved the private key in a secure location</Trans>}
				description={
					downloaded ? (
						<Trans>This confirmation is required before finishing.</Trans>
					) : (
						<Trans>Download the credential before confirming.</Trans>
					)
				}
			/>
		</div>
	);
}
