/**
 * The controls that open the deposit dialog warm its chunk on intent, but they must not import the
 * module that owns the lazy global modals: its dynamic imports are static edges for bundlers and
 * for Vite's dependency scan, so a control that imported it would pull every global modal into each
 * page and browser fixture that renders the control. The owner registers the warm-up here instead;
 * until it has loaded, an intent does nothing.
 */
let warmDepositModal: (() => void) | null = null;

export function registerDepositModalWarmUp(warmUp: () => void): void {
	warmDepositModal = warmUp;
}

function warmOnIntent(): void {
	warmDepositModal?.();
}

/** Spread onto every control that opens the deposit dialog, while it can open it (`loading-placeholder-contract`). */
export const depositModalIntentProps = {
	onPointerEnter: warmOnIntent,
	onPointerDown: warmOnIntent,
	onFocus: warmOnIntent,
} as const;
