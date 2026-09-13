export const APP_NAME = "gatu";

export interface BuildMetaInput {
	version: string;
	commit: string;
	release: string;
	builtAt: string;
	ticketApiVersion: number;
	pairing: { createAndReveal: boolean; importFromQr: boolean };
}

export interface BuildMeta {
	name: string;
	version: string;
	commit: string;
	release: string;
	builtAt: string;
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
		mobileSync: {
			ticketApiVersion: input.ticketApiVersion,
			legacyRegisterDisabled: true,
			store: "single-process",
			createAndReveal: input.pairing.createAndReveal,
			importFromQr: input.pairing.importFromQr,
		},
	};
}
