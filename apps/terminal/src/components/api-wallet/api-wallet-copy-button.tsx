import { Button, ButtonIcon } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
	value: string;
	appearance?: "icon" | "text";
	stopPropagation?: boolean;
}

export function ApiWalletCopyButton({ value, appearance = "text", stopPropagation = false }: Props) {
	const { t } = useLingui();
	const { copied, copy } = useCopyToClipboard();
	const isMobile = useIsMobile();

	function handleClick(event: MouseEvent<HTMLButtonElement>) {
		if (stopPropagation) event.stopPropagation();
		void copy(value);
	}

	if (appearance === "icon") {
		return (
			<ButtonIcon
				type="button"
				variant="ghost"
				intent="neutral"
				size="xs"
				className="active:scale-100"
				aria-label={copied ? t`Address copied` : t`Copy address`}
				onClick={handleClick}
			>
				{copied ? (
					<CheckIcon className="size-3.5 text-api-wallet-success" weight="bold" />
				) : (
					<CopyIcon className="size-3.5" />
				)}
			</ButtonIcon>
		);
	}

	return (
		<Button
			type="button"
			variant="link"
			intent={copied ? "neutral" : "brand"}
			size="xxs"
			className={isMobile ? "touch-target shrink-0 p-0 active:scale-100" : "shrink-0 p-0 active:scale-100"}
			onClick={handleClick}
		>
			{copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
		</Button>
	);
}
