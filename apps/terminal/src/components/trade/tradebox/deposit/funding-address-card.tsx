import { Trans, useLingui } from "@lingui/react/macro";
import { CopyIcon, QrCodeIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ButtonIcon } from "@sairn/ui";
import { type ReactNode, useEffect, useRef } from "react";
import { BrandMotion } from "@/components/brand/brand-motion";
import { USDC_ICON_URL } from "@/config/bridge";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { BRAND_MOTION_COPY_FEEDBACK } from "@/lib/brand/brand-motion.gen";
import { cn } from "@/lib/cn";

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

const QR_SIZE = 132;
const CARD_CLASS = "flex flex-col items-center gap-3";
const QR_FRAME_CLASS =
	"flex size-[140px] items-center justify-center rounded-24 border border-market-close-stroke-card bg-market-close-card";
const ADDRESS_GROUP_CLASS = "w-full space-y-1.5";
const ADDRESS_LABEL_CLASS = "text-2xs leading-4 text-market-close-subtle";
const ADDRESS_FIELD_CLASS =
	"flex min-h-11 items-center rounded-20 border border-market-close-stroke-card bg-market-close-card px-3 py-1.5";

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
					errorCorrectionLevel: "H",
					margin: 1,
					width: QR_SIZE,
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
			<div className={CARD_CLASS} data-address-state={props.state} aria-busy={props.state === "loading"}>
				<div className={cn(QR_FRAME_CLASS, "flex-col gap-2 px-4 text-center")}>
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

				<div className={ADDRESS_GROUP_CLASS}>
					<p className={ADDRESS_LABEL_CLASS}>
						<Trans>Deposit address</Trans>
					</p>
					<div className={cn(ADDRESS_FIELD_CLASS, "justify-center")} aria-hidden="true">
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
		<div className={CARD_CLASS} data-address-state="ready">
			<div className={QR_FRAME_CLASS}>
				<div className="relative">
					<canvas
						ref={canvasRef}
						className="block size-[132px] rounded-16 bg-white"
						role="img"
						aria-label={t`Deposit address QR code`}
					/>
					<img
						src={USDC_ICON_URL}
						alt=""
						aria-hidden="true"
						data-slot="qr-token-logo"
						className="pointer-events-none absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-0.5"
					/>
				</div>
			</div>

			<div className={ADDRESS_GROUP_CLASS}>
				<p className={ADDRESS_LABEL_CLASS}>
					<Trans>Deposit address</Trans>
				</p>
				<div className={cn(ADDRESS_FIELD_CLASS, "gap-2")}>
					<span
						className="min-w-0 flex-1 break-all text-balance text-center font-mono text-xs leading-[18px] tabular-nums text-market-close-fg"
						title={props.address}
					>
						{props.address}
					</span>
					<ButtonIcon
						type="button"
						variant="ghost"
						intent="neutral"
						size="sm"
						onClick={() => copy(props.address)}
						aria-label={copied ? t`Copied` : t`Copy deposit address`}
						className="shrink-0 rounded-16 text-market-close-muted shadow-none not-data-disabled:hover:bg-market-close-hover not-data-disabled:hover:text-market-close-fg"
					>
						{copied ? (
							<BrandMotion motion={BRAND_MOTION_COPY_FEEDBACK} size={16} />
						) : (
							<CopyIcon className="size-4" aria-hidden="true" />
						)}
					</ButtonIcon>
				</div>
			</div>
		</div>
	);
}
