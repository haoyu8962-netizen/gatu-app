import { HyperliquidOwnerSignerProvider } from "@sairn/hl-react";
import type { ReactNode } from "react";
import { usePrivyOwnerSigner } from "@/hooks/wallet/use-privy-owner-signer";

interface Props {
	children: ReactNode;
}

export function HyperliquidOwnerSignerBridge({ children }: Props) {
	const value = usePrivyOwnerSigner();
	return <HyperliquidOwnerSignerProvider value={value}>{children}</HyperliquidOwnerSignerProvider>;
}
