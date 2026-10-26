// Hashes for the two inline blocks Base.astro writes with is:inline. Astro's CSP hashes the scripts and styles it
// bundles; inline blocks it does not process have to be added through Astro.csp, from the exact emitted text.

import { createHash } from "node:crypto";

/** Runs before first paint, so the no-JavaScript fallbacks in global.css never flash. */
export const JS_CLASS_SCRIPT = 'document.documentElement.classList.add("js");';

export function cspHash(source: string): `sha256-${string}` {
	return `sha256-${createHash("sha256").update(source, "utf8").digest("base64")}`;
}
