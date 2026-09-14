import { createChartLibraryScriptUrl } from "./chart-library";

export const APP_NAME = "gatu";

export interface BuildMetaInput {
	version: string;
	commit: string;
	release: string;
	builtAt: string;
	ticketApiVersion: number;
	pairing: { createAndReveal: boolean; importFromQr: boolean };
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
	mobileSync: {
		ticketApiVersion: number;
		legacyRegisterDisabled: true;
		store: "single-process";
		createAndReveal: boolean;
		importFromQr: boolean;
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
			ticketApiVersion: input.ticketApiVersion,
			legacyRegisterDisabled: true,
			store: "single-process",
			createAndReveal: input.pairing.createAndReveal,
			importFromQr: input.pairing.importFromQr,
		},
	};
}
