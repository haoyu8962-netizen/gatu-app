import { ButtonIcon } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, CopyIcon, QrCodeIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef } from "react";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";

interface ReadyProps {
	address: `0x${string}`;
	state: "ready";
}

interface PendingProps {
	address?: never;
	action?: ReactNode;
	state: "loading" | "pending";
}

interface UnavailableProps {
	address?: never;
	action?: ReactNode;
	message: ReactNode;
	state: "unavailable";
}

type Props = PendingProps | ReadyProps | UnavailableProps;

export function FundingAddressCard(props: Props) {
	const { t } = useLingui();
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
		const isUnavailable = props.state === "unavailable";

		return (
			<div
				className="flex flex-col items-center gap-4"
				data-address-state={props.state}
				aria-busy={props.state === "loading"}
			>
				<div className="flex size-[140px] flex-col items-center justify-center gap-2 rounded-[12px] border border-market-close-stroke-card bg-market-close-card px-4 text-center">
					{!isUnavailable ? (
						<QrCodeIcon className="size-8 text-market-close-muted" aria-hidden="true" />
					) : (
						<WarningCircleIcon className="size-8 text-market-close-danger" aria-hidden="true" />
					)}
					{!isUnavailable ? props.action : null}
				</div>
				{isUnavailable ? (
					<div role="alert" className="w-full space-y-1 text-center text-xs leading-5 text-market-close-danger">
						<p>{props.message}</p>
						{props.action}
					</div>
				) : null}

				<div className="w-full space-y-1.5">
					<p className="text-2xs leading-4 text-market-close-subtle">
						<Trans>Deposit address</Trans>
					</p>
					<div
						className="flex min-h-[50px] items-center justify-center rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3 py-2"
						aria-hidden="true"
					>
						{!isUnavailable ? (
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
				<p className="text-2xs leading-4 text-market-close-subtle">
					<Trans>Deposit address</Trans>
				</p>
				<div className="flex min-h-12 items-center gap-2.5 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3 py-2">
					<span
						className="min-w-0 flex-1 break-all text-center font-mono text-xs leading-[18px] tabular-nums text-market-close-fg"
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
