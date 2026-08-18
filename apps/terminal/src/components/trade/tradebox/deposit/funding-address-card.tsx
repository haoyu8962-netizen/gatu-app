import { ButtonIcon } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { CheckIcon, CopyIcon, QrCodeIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef } from "react";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";

interface ReadyProps {
	address: `0x${string}`;
	state: "ready";
}

interface LoadingProps {
	address?: never;
	action?: ReactNode;
	message?: ReactNode;
	state: "loading";
}

interface UnavailableProps {
	address?: never;
	action?: ReactNode;
	message: ReactNode;
	state: "unavailable";
}

type Props = LoadingProps | ReadyProps | UnavailableProps;

export function FundingAddressCard(props: Props) {
	const address = props.state === "ready" ? props.address : null;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { copied, copy } = useCopyToClipboard(1500);

	useEffect(() => {
		if (!address) return;
		const canvas = canvasRef.current;
		if (!canvas) return;

		let cancelled = false;
		void import("qrcode")
			.then(({ toCanvas }) => {
				if (cancelled) return;
				return toCanvas(canvas, address, {
					errorCorrectionLevel: "M",
					margin: 1,
					width: 132,
				});
			})
			.catch(() => {
				if (cancelled) return;
				canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
			});

		return () => {
			cancelled = true;
		};
	}, [address]);

	if (props.state !== "ready") {
		const isLoading = props.state === "loading";

		return (
			<div className="flex flex-col items-center gap-4" data-address-state={props.state}>
				<div
					className="flex size-[140px] flex-col items-center justify-center gap-2 rounded-[12px] border border-market-close-stroke-card bg-market-close-card px-4 text-center"
					role={isLoading ? (props.message ? "status" : undefined) : "alert"}
				>
					{isLoading ? (
						<QrCodeIcon className="size-8 text-market-close-muted" aria-hidden="true" />
					) : (
						<WarningCircleIcon className="size-8 text-market-close-danger" aria-hidden="true" />
					)}
					{props.message ? <p className="text-[11px] leading-4 text-market-close-muted">{props.message}</p> : null}
					{props.action}
				</div>

				<div className="w-full space-y-1.5">
					<p className="text-[11px] leading-4 text-market-close-subtle">
						<Trans>Deposit address</Trans>
					</p>
					<div
						className="flex min-h-[50px] items-center justify-center rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3 py-2"
						aria-hidden="true"
					>
						{isLoading ? (
							<div
								className="h-2 w-3/4 rounded-full bg-market-close-stroke-input/50"
								data-address-placeholder="skeleton"
							/>
						) : (
							<span className="text-sm text-market-close-muted">—</span>
						)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-4" data-address-state="ready">
			<div className="flex size-[140px] items-center justify-center rounded-[12px] border border-market-close-stroke-card bg-market-close-card p-[3px]">
				<canvas
					ref={canvasRef}
					className="block size-[132px] rounded-[8px] bg-white"
					role="img"
					aria-label={t`Deposit address QR code`}
				/>
			</div>

			<div className="w-full space-y-1.5">
				<p className="text-[11px] leading-4 text-market-close-subtle">
					<Trans>Deposit address</Trans>
				</p>
				<div className="flex min-h-12 items-center gap-2.5 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3 py-2">
					<span
						className="min-w-0 flex-1 break-all text-center font-mono text-xs leading-[18px] tabular-nums text-market-close-fg min-[1001px]:break-normal min-[1001px]:whitespace-nowrap"
						title={props.address}
					>
						{props.address}
					</span>
					<ButtonIcon
						type="button"
						variant="outline"
						intent="neutral"
						size="sm"
						onClick={() => copy(props.address)}
						aria-label={copied ? t`Copied` : t`Copy deposit address`}
						className="rounded-[7px] border-market-close-stroke-input bg-modal text-market-close-fg shadow-none hover:border-market-close-control"
					>
						{copied ? (
							<CheckIcon className="size-4 text-success" weight="bold" aria-hidden="true" />
						) : (
							<CopyIcon className="size-4" aria-hidden="true" />
						)}
					</ButtonIcon>
				</div>
			</div>
		</div>
	);
}
