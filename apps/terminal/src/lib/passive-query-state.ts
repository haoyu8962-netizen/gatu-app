/**
 * What a page may show for one passive read (docs/mobile-data-presentation.md, staking, referral and
 * Vault pages):
 * - `loading`: nothing usable yet and no failure to report; a blank busy region or a skeleton.
 * - `failed`: nothing usable and the latest request failed or answered malformed data; only a neutral
 *   retry.
 * - `ready`: the latest request succeeded, possibly while a background refresh runs; the data, its
 *   empty conclusions and the actions that need it.
 * - `retained`: the latest request failed, but data a request delivered after the page began reading
 *   this source stays on screen, silently; actions that need it stay disabled and empty lists draw no
 *   conclusion until a refresh succeeds. Data cached before the page read the source is never
 *   retained (the portfolio's E13 rule, `useDataReceivedSinceMount`).
 */
export type PassiveQueryState = "loading" | "failed" | "ready" | "retained";

export interface PassiveQuerySnapshot {
	/** Usable data is present: delivered, and valid where the page validates it. */
	hasData: boolean;
	/** The latest request failed, or its answer was malformed. */
	failed: boolean;
	/** The data was delivered after the page began reading this source for the current identity. */
	receivedSinceMount: boolean;
}

export function getPassiveQueryState({ hasData, failed, receivedSinceMount }: PassiveQuerySnapshot): PassiveQueryState {
	if (!failed) return hasData ? "ready" : "loading";
	return hasData && receivedSinceMount ? "retained" : "failed";
}

/** Sources shown as one snapshot: the weakest decides. */
export function combinePassiveQueryStates(states: readonly PassiveQueryState[]): PassiveQueryState {
	if (states.includes("failed")) return "failed";
	if (states.includes("loading")) return "loading";
	if (states.includes("retained")) return "retained";
	return "ready";
}

export function isPassiveQueryShown(state: PassiveQueryState): boolean {
	return state === "ready" || state === "retained";
}
