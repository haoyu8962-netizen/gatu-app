/**
 * Privy keeps the session tokens of a logged-in user in local storage under these keys (the SDK's
 * default storage). Their presence means the account menu will most likely resolve to an identity
 * once Privy is ready, so the header shows "Connecting..." instead of "Connect Wallet" meanwhile.
 * Visitors who never logged in have none of them and get the connect button immediately; if the SDK
 * ever renames the keys the only effect is that returning users see "Connect Wallet" until ready.
 */
const PRIVY_SESSION_STORAGE_KEYS = ["privy:token", "privy:refresh_token", "privy:id_token"] as const;

export function hasPersistedPrivySession(storage: Pick<Storage, "getItem"> | undefined = readLocalStorage()): boolean {
	if (!storage) return false;
	try {
		return PRIVY_SESSION_STORAGE_KEYS.some((key) => storage.getItem(key) !== null);
	} catch {
		return false;
	}
}

function readLocalStorage(): Storage | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}
