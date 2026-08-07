import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";

interface Props {
	address: `0x${string}`;
}

export function FundingAddressCard({ address }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { copied, copy } = useCopyToClipboard(1500);

	useEffect(() => {
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

	return (
		<div className="flex flex-col items-center gap-3 rounded-12 border border-stroke-weak/50 bg-fill-weaker p-3">
			<div className="rounded-8 bg-white p-2 shadow-sm">
				<canvas ref={canvasRef} className="block size-[132px]" role="img" aria-label={t`Deposit address QR code`} />
			</div>

			<div className="w-full space-y-1.5">
				<p className="text-2xs font-medium uppercase tracking-wide text-fg-muted">
					<Trans>Deposit address</Trans>
				</p>
				<div className="flex min-h-11 items-center gap-2 rounded-8 border border-stroke-weak bg-surface px-3 py-2">
					<span className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed tabular-nums text-fg">
						{address}
					</span>
					<Button
						type="button"
						variant="ghost"
						intent="neutral"
						size="xs"
						onClick={() => copy(address)}
						aria-label={copied ? t`Copied` : t`Copy deposit address`}
						className="shrink-0"
					>
						{copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
					</Button>
				</div>
			</div>
		</div>
	);
}
