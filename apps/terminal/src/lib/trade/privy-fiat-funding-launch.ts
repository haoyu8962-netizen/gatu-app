import { showPrivyFiatFundingNotice } from "@/components/trade/tradebox/privy-fiat-funding-notice-toast";
import {
	finishPrivyFiatFunding,
	isCurrentPrivyFiatFundingAttempt,
	mountPrivyFiatFundingHost,
	type PrivyFiatFundingAttempt,
	readPrivyFiatFundingHost,
	requestPrivyFiatFunding,
} from "@/stores/use-privy-fiat-funding-store";

/**
 * Downloads the card purchase host and hands it to the page-level gate. Resolves false when the
 * chunk cannot be loaded; nothing is remembered, so the next call tries again.
 */
export function loadPrivyFiatFundingHost(): Promise<boolean> {
	if (readPrivyFiatFundingHost()) return Promise.resolve(true);
	return import("@/components/trade/tradebox/privy-fiat-funding-host").then(
		(module) => {
			mountPrivyFiatFundingHost(module.PrivyFiatFundingHost);
			return true;
		},
		() => false,
	);
}

/** Starts the download ahead of a purchase, for the moment its entry comes on screen. A failure stays silent. */
export function warmPrivyFiatFundingHost(): void {
	void loadPrivyFiatFundingHost();
}

/**
 * Hands a purchase attempt to the page-level host and makes sure that host is loaded. An attempt
 * whose host cannot load ends with a notice for its owner instead of blocking later purchases.
 */
export function launchPrivyFiatFunding(attempt: PrivyFiatFundingAttempt): void {
	if (!requestPrivyFiatFunding(attempt)) return;
	void loadPrivyFiatFundingHost().then((loaded) => {
		if (loaded || !isCurrentPrivyFiatFundingAttempt(attempt)) return;
		finishPrivyFiatFunding(attempt);
		showPrivyFiatFundingNotice({
			kind: "unavailable",
			network: attempt.network,
			ownerKey: attempt.ownerKey,
			walletKind: attempt.destination.walletKind,
		});
	});
}
