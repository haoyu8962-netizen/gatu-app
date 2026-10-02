import { createChartLibraryScriptUrl } from "./chart-library";

export const APP_NAME = "sairn";

export interface BuildMetaInput {
	version: string;
	commit: string;
	release: string;
	builtAt: string;
	pairing: { enabled: boolean };
	cctpDeposits: { mainnetSponsoredWallet: boolean; testnetExternalWallet: boolean; testnetSponsoredWallet: boolean };
	/** Content hash of the TradingView loader the build emitted under a hashed name; empty in development. */
	chartLibraryHash?: string;
}

export interface BuildMeta {
	name: string;
	version: string;
	commit: string;
	release: string;
	builtAt: string;
	/** The TradingView loader URL this build requests, so the shell can preload the same one. */
	chartLibraryScript: string;
	/** Whether this build exposes Link mobile device and phone import; the release tooling refuses an unacknowledged true. */
	mobileSync: {
		enabled: boolean;
	};
	/** The gated deposit paths this build exposes; the release tooling refuses an unacknowledged sponsored Mainnet path. */
	cctpDeposits: {
		mainnetSponsoredWallet: boolean;
		testnetExternalWallet: boolean;
		testnetSponsoredWallet: boolean;
	};
}

/**
 * Shared by the `/build-meta.json` server route and the build-time static asset so both
 * describe the same build identity. This module must stay free of `import.meta.env`
 * access: the Vite config evaluates it outside the application runtime.
 */
export function createBuildMeta(input: BuildMetaInput): BuildMeta {
	return {
		name: APP_NAME,
		version: input.version,
		commit: input.commit,
		release: input.release,
		builtAt: input.builtAt,
		chartLibraryScript: createChartLibraryScriptUrl(input.chartLibraryHash || input.commit),
		mobileSync: {
			enabled: input.pairing.enabled,
		},
		cctpDeposits: {
			mainnetSponsoredWallet: input.cctpDeposits.mainnetSponsoredWallet,
			testnetExternalWallet: input.cctpDeposits.testnetExternalWallet,
			testnetSponsoredWallet: input.cctpDeposits.testnetSponsoredWallet,
		},
	};
}
