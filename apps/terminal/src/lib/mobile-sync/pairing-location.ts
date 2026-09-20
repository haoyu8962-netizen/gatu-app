/**
 * The one implementation of the pairing-page address scrub. It runs twice from the same source: as
 * the generated inline script that is the first executable script of the shell (so the bearer
 * fragment leaves the address bar before any chunk downloads), and from the client entry as the
 * second line of defence. This file must stay free of imports and of references outside itself,
 * because `scripts/render-pairing-head-scrub.mjs` turns it into that inline script as it stands.
 *
 * It shortens how long the fragment is visible and makes failures explicit. It cannot defend
 * against a script that already runs in the page's main world before it.
 */
const PAIRING_ROUTE_PATH = "/mobile-agent-sync";
const CREDENTIAL_QUERY_KEYS = ["ht-mobile-sync", "k"];
// ASCII case folding only: the router matches paths case-insensitively, and no `u` flag keeps
// letters such as `ſ` from folding into `s`.
const PAIRING_PATH = /^\/mobile-agent-sync\/?$/i;
const NESTED_PAIRING_PATH = /^\/mobile-agent-sync\//i;
const UNDECODABLE_PAIRING_PATH = /^\/mobile-agent-sync(?:[/%]|$)/i;

export const PAIRING_BOOTSTRAP_GLOBAL = "__gatuPairingBootstrap";
export const PAIRING_BOOTSTRAP_VERSION = 1;

/** `pairing` may import; `rejected` is scrubbed and refused; `other` is not the pairing page. */
export type PairingPathKind = "pairing" | "rejected" | "other";
export type PairingScrubStatus = "none" | "captured" | "invalid" | "blocked";

export interface PairingScrubResult {
	status: PairingScrubStatus;
	capturedUrl: string | null;
}

export interface PairingScrubWindow {
	location: { hash: string; href: string; pathname: string; search: string };
	history: { state: unknown; replaceState(state: unknown, unused: string, url: string): void };
}

export interface PairingBootstrapHandoff {
	v: number;
	status: PairingScrubStatus;
	take(): string | null;
}

/** Decodes once, never recursively, and never strips `;` path parameters. */
export function classifyPairingPath(pathname: string): PairingPathKind {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return UNDECODABLE_PAIRING_PATH.test(pathname) ? "rejected" : "other";
	}
	if (PAIRING_PATH.test(decoded)) return "pairing";
	return NESTED_PAIRING_PATH.test(decoded) ? "rejected" : "other";
}

/** The exact route spelling is kept as typed; every other accepted spelling becomes the canonical path. */
export function canonicalPairingPath(pathname: string): string {
	return pathname === PAIRING_ROUTE_PATH || pathname === `${PAIRING_ROUTE_PATH}/` ? pathname : PAIRING_ROUTE_PATH;
}

function hasCredentialQuery(search: string): boolean {
	const params = new URLSearchParams(search);
	return CREDENTIAL_QUERY_KEYS.some((key) => params.has(key));
}

export function scrubPairingLocation(win: PairingScrubWindow): PairingScrubResult {
	const blocked: PairingScrubResult = { status: "blocked", capturedUrl: null };
	try {
		const { location, history } = win;
		const kind = classifyPairingPath(location.pathname);
		if (kind === "other") return { status: "none", capturedUrl: null };

		if (kind === "rejected" || hasCredentialQuery(location.search)) {
			const params = new URLSearchParams(location.search);
			for (const key of CREDENTIAL_QUERY_KEYS) params.delete(key);
			const search = params.toString();
			history.replaceState(history.state, "", `${PAIRING_ROUTE_PATH}${search ? `?${search}` : ""}`);
			const scrubbed =
				location.hash === "" && location.pathname === PAIRING_ROUTE_PATH && !hasCredentialQuery(location.search);
			return scrubbed ? { status: "invalid", capturedUrl: null } : blocked;
		}

		if (location.hash === "") return { status: "none", capturedUrl: null };

		const capturedUrl = location.href;
		// Do not retain the bearer URL until the address bar has been scrubbed.
		history.replaceState(history.state, "", `${canonicalPairingPath(location.pathname)}${location.search}`);
		return location.hash === "" ? { status: "captured", capturedUrl } : blocked;
	} catch {
		return blocked;
	}
}

/**
 * Publishes the scrub outcome for the client entry. The status is not a secret and stays readable,
 * so an entry that finds `captured` but receives nothing knows the URL was taken by someone else.
 */
export function installPairingBootstrap(win: PairingScrubWindow): void {
	const result = scrubPairingLocation(win);
	let capturedUrl = result.capturedUrl;
	const handoff: PairingBootstrapHandoff = {
		v: PAIRING_BOOTSTRAP_VERSION,
		status: result.status,
		take() {
			const url = capturedUrl;
			capturedUrl = null;
			return url;
		},
	};
	result.capturedUrl = null;
	Object.defineProperty(win, PAIRING_BOOTSTRAP_GLOBAL, { value: Object.freeze(handoff) });
}
