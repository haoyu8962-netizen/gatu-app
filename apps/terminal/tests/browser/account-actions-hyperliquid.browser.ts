import { useAccountActionsFixture } from "./account-actions.browser";

export * from "../../src/lib/hyperliquid";

const FIXTURE_OWNER = "0x1111111111111111111111111111111111111111";

/** The account surfaces render without a HyperliquidProvider; notifications only need the account identity. */
export function useHyperliquid() {
	const connected = useAccountActionsFixture((state) => state.connected);
	return { clientKey: connected ? FIXTURE_OWNER : "disconnected", env: "Mainnet" as const };
}
