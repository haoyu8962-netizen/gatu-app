const MOBILE_AGENT_SYNC_ROUTE_PATH = "/mobile-agent-sync";
const MOBILE_AGENT_SYNC_FRAGMENT_KEY = "ht-mobile-sync";
const MOBILE_AGENT_SYNC_KEY_FRAGMENT_KEY = "k";

export type MobileAgentSyncBootstrapScrubStatus = "not_applicable" | "scrubbed" | "blocked";

let pendingMobileAgentSyncUrl: string | null = null;
let pendingInvalidMobileAgentSyncLocation = false;

function isMobileAgentSyncPath(pathname: string): boolean {
	return pathname === MOBILE_AGENT_SYNC_ROUTE_PATH || pathname === `${MOBILE_AGENT_SYNC_ROUTE_PATH}/`;
}

function isUnexpectedMobileAgentSyncPath(pathname: string): boolean {
	try {
		const decodedPathname = decodeURIComponent(pathname);
		return decodedPathname.startsWith(`${MOBILE_AGENT_SYNC_ROUTE_PATH}/`) && !isMobileAgentSyncPath(decodedPathname);
	} catch {
		return pathname.startsWith(MOBILE_AGENT_SYNC_ROUTE_PATH);
	}
}

function scrubMobileAgentSyncFragment(): MobileAgentSyncBootstrapScrubStatus {
	if (typeof window === "undefined") return "not_applicable";

	try {
		const { location, history } = window;
		const isExactPath = isMobileAgentSyncPath(location.pathname);
		const isUnexpectedNestedPath = isUnexpectedMobileAgentSyncPath(location.pathname);
		const searchParams = new URLSearchParams(location.search);
		const hasCredentialQuery =
			searchParams.has(MOBILE_AGENT_SYNC_FRAGMENT_KEY) || searchParams.has(MOBILE_AGENT_SYNC_KEY_FRAGMENT_KEY);

		if (isUnexpectedNestedPath || (isExactPath && hasCredentialQuery)) {
			searchParams.delete(MOBILE_AGENT_SYNC_FRAGMENT_KEY);
			searchParams.delete(MOBILE_AGENT_SYNC_KEY_FRAGMENT_KEY);
			const sanitizedSearch = searchParams.toString();
			const cleanUrl = `${MOBILE_AGENT_SYNC_ROUTE_PATH}${sanitizedSearch ? `?${sanitizedSearch}` : ""}`;
			history.replaceState(history.state, "", cleanUrl);
			if (
				location.hash !== "" ||
				location.pathname !== MOBILE_AGENT_SYNC_ROUTE_PATH ||
				new URLSearchParams(location.search).has(MOBILE_AGENT_SYNC_FRAGMENT_KEY) ||
				new URLSearchParams(location.search).has(MOBILE_AGENT_SYNC_KEY_FRAGMENT_KEY)
			) {
				return "blocked";
			}
			pendingInvalidMobileAgentSyncLocation = true;
			return "scrubbed";
		}

		if (!isExactPath || location.hash === "") {
			return "not_applicable";
		}

		const capturedUrl = location.href;
		const cleanUrl = `${location.pathname}${location.search}`;

		// Do not retain the bearer URL until the address bar has been scrubbed.
		history.replaceState(history.state, "", cleanUrl);
		if (location.hash !== "") return "blocked";

		pendingMobileAgentSyncUrl = capturedUrl;
		return "scrubbed";
	} catch {
		pendingMobileAgentSyncUrl = null;
		return "blocked";
	}
}

export const mobileAgentSyncBootstrapScrubStatus = scrubMobileAgentSyncFragment();

/**
 * A failed scrub blocks application hydration so providers, telemetry, and the
 * router cannot observe a bearer fragment that is still in the address bar.
 */
export const canHydrateAfterMobileAgentSyncScrub = mobileAgentSyncBootstrapScrubStatus !== "blocked";

/** Returns the scrubbed direct-load URL once, then releases the bearer value. */
export function consumeBootstrappedMobileAgentSyncUrl(): string | null {
	const capturedUrl = pendingMobileAgentSyncUrl;
	pendingMobileAgentSyncUrl = null;
	return capturedUrl;
}

/** Reports a scrubbed query/path credential once without retaining its value. */
export function consumeInvalidBootstrappedMobileAgentSyncLocation(): boolean {
	const invalid = pendingInvalidMobileAgentSyncLocation;
	pendingInvalidMobileAgentSyncLocation = false;
	return invalid;
}
