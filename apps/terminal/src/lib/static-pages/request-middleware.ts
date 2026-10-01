import { createMiddleware } from "@tanstack/react-start";
import { STATIC_SHELL_FILE } from "@/lib/static-pages/static-pages";
import { createStaticPagesResponder, type StaticPagesResponder } from "@/lib/static-pages/static-pages-responder";

let responderPromise: Promise<StaticPagesResponder> | undefined;

async function resolvePublicDir(): Promise<string | null> {
	const { access } = await import("node:fs/promises");
	const { resolve } = await import("node:path");
	const { listPublicDirCandidates } = await import("@/lib/static-pages/public-dir");
	const candidates = listPublicDirCandidates({
		configuredDir: process.env.SAIRN_PUBLIC_DIR,
		cwd: process.cwd(),
		entryFile: process.argv[1],
	});
	for (const candidate of candidates) {
		try {
			await access(resolve(candidate, STATIC_SHELL_FILE));
			return candidate;
		} catch {}
	}
	return null;
}

async function createResponder(): Promise<StaticPagesResponder> {
	const { readFile } = await import("node:fs/promises");
	return createStaticPagesResponder({
		publicDir: await resolvePublicDir(),
		readFile: (file) => readFile(file, "utf8"),
		allowRuntimeSsr: process.env.SAIRN_RUNTIME_SSR === "true",
		warn: (message) => console.warn(`[static-pages] ${message}`),
	});
}

/**
 * Runtime server rendering is off: the Node process answers navigations from the prerendered
 * client build and only executes the `/api/*` and pairing handlers. Development keeps the Vite
 * SSR pipeline, and build-time prerendering must render, so both bypass the responder.
 */
export const staticPagesRequestMiddleware = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
	if (import.meta.env.DEV || process.env.TSS_PRERENDERING === "true") return next();
	responderPromise ??= createResponder();
	const responder = await responderPromise;
	const response = await responder(request);
	return response ?? next();
});
