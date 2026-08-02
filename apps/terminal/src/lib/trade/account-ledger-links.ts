import { arbitrum, arbitrumSepolia } from "viem/chains";
import { getExplorerTxUrl as getEvmExplorerTxUrl } from "@/lib/explorer";
import { getExplorerTxUrl as getHyperliquidExplorerTxUrl } from "@/lib/hyperliquid";
import type { AccountLedgerRow } from "./account-ledger";

export function getAccountLedgerExplorerUrl(row: AccountLedgerRow, isTestnet: boolean): string | null {
	if (row.explorer === "arbitrum") {
		return getEvmExplorerTxUrl(row.hash, isTestnet ? arbitrumSepolia : arbitrum);
	}
	return getHyperliquidExplorerTxUrl(row.hash, isTestnet);
}
