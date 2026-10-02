import { usePrivyFiatFundingHost } from "@/stores/use-privy-fiat-funding-store";

export function PrivyFiatFundingHostGate() {
	const Host = usePrivyFiatFundingHost();
	return Host ? <Host /> : null;
}
