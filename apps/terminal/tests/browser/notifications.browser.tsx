import { createContext, useContext } from "react";

export const OWNER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const OWNER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const NotificationIdentity = createContext({ clientKey: OWNER_A, env: "Mainnet" as "Mainnet" | "Testnet" });
export function useHyperliquid() {
	return useContext(NotificationIdentity);
}
