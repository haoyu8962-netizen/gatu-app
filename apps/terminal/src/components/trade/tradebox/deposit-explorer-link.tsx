import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { Chain } from "viem";
import { getExplorerTxUrl } from "@/lib/explorer";

interface Props {
	txHash: string | undefined;
	txChain: Chain;
	label: string;
}

export function DepositExplorerLink({ txHash, txChain, label }: Props) {
	const explorerUrl = txHash ? getExplorerTxUrl(txHash, txChain) : null;
	if (!explorerUrl) return null;

	return (
		<a
			href={explorerUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1.5 text-signal hover:text-signal-hover hover:underline"
		>
			{label}
			<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
		</a>
	);
}
