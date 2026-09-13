import { classifyStaticPageRequest, decorateStaticPage, STATIC_SHELL_FILE } from "@/lib/static-pages/static-pages";

export interface StaticPagesResponderOptions {
	/** Directory that holds the client build (`_shell.html`, prerendered documents, assets); null when none was found. */
	publicDir: string | null;
	/** Reads a file relative to `publicDir`; must reject when the file is missing. */
	readFile: (file: string) => Promise<string>;
	/** Explicit opt-in to server rendering when no shell exists; otherwise navigations fail closed. */
	allowRuntimeSsr: boolean;
	warn?: (message: string) => void;
}

export type StaticPagesResponder = (request: Request) => Promise<Response | undefined>;

const HTML_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } as const;
const JSON_NO_STORE = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;
const TEXT_NO_STORE = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } as const;

function htmlResponse(request: Request, html: string): Response {
	return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: HTML_HEADERS });
}

/**
 * Serves the prerendered client build the way a static host would, in front of the router.
 * Returns `undefined` when the request must continue to the server handlers.
 */
export function createStaticPagesResponder(options: StaticPagesResponderOptions): StaticPagesResponder {
	const cache = new Map<string, Promise<string | null>>();
	let warnedMissingShell = false;

	function load(file: string): Promise<string | null> {
		if (options.publicDir === null) return Promise.resolve(null);
		const cached = cache.get(file);
		if (cached) return cached;
		const pending = options.readFile(`${options.publicDir}/${file}`).catch(() => null);
		cache.set(
			file,
			pending.then((html) => {
				if (html === null && file !== STATIC_SHELL_FILE) cache.delete(file);
				return html;
			}),
		);
		return pending;
	}

	return async function respond(request) {
		const decision = classifyStaticPageRequest(request.method, new URL(request.url).pathname);
		if (decision.kind === "pass") return undefined;
		if (decision.kind === "gone") {
			return Response.json({ error: "Server functions are not available" }, { status: 404, headers: JSON_NO_STORE });
		}
		if (decision.kind === "not-found") return new Response("Not Found", { status: 404, headers: TEXT_NO_STORE });

		for (const candidate of decision.candidates) {
			const html = await load(candidate);
			if (html !== null) return htmlResponse(request, decorateStaticPage(html, decision.marker));
		}

		if (options.allowRuntimeSsr) {
			if (!warnedMissingShell) {
				warnedMissingShell = true;
				options.warn?.(`Static shell ${STATIC_SHELL_FILE} not found; falling back to server rendering.`);
			}
			return undefined;
		}
		return new Response("Static shell missing; rebuild and deploy the client output.", {
			status: 503,
			headers: { ...TEXT_NO_STORE, "retry-after": "60" },
		});
	};
}
