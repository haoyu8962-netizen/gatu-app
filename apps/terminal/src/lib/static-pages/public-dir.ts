import { dirname, resolve } from "node:path";

export interface PublicDirLookup {
	/** `GATU_PUBLIC_DIR` from the environment, when set. */
	configuredDir: string | undefined;
	cwd: string;
	/** The server entry script (`process.argv[1]`), `.output/server/index.mjs` in a Nitro build. */
	entryFile: string | undefined;
}

/**
 * Where the prerendered client output may live, most specific first. A release directory runs the
 * server from its root (`server/index.mjs` next to `public/`), the repository runs it from the
 * terminal package or from the monorepo root, and CI starts it by path from the repository root; the
 * entry file therefore also names the output directory so the shell is found regardless of cwd.
 */
export function listPublicDirCandidates({ configuredDir, cwd, entryFile }: PublicDirLookup): string[] {
	const candidates = [
		configuredDir?.trim() || undefined,
		resolve(cwd, "public"),
		resolve(cwd, ".output/public"),
		resolve(cwd, "apps/terminal/.output/public"),
		entryFile ? resolve(dirname(entryFile), "../public") : undefined,
	];
	return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}
