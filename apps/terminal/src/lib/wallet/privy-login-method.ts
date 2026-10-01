import { useCallback, useMemo, useSyncExternalStore } from "react";

export type PrivyLoginMethod = "email" | "wallet";

export interface PrivyLoginIntent {
	method: PrivyLoginMethod;
	userId: string;
	walletAddress?: string;
}

export const PRIVY_LOGIN_INTENT_STORAGE_KEY_PREFIX = "sairn:privy-login-intent:v2:";

const listenersByUser = new Map<string, Set<() => void>>();

export function getPrivyLoginIntentStorageKey(userId: string): string {
	return `${PRIVY_LOGIN_INTENT_STORAGE_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

function parseStoredLoginIntent(value: string): PrivyLoginIntent | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object") return undefined;

	const candidate = parsed as Partial<PrivyLoginIntent>;
	if (typeof candidate.userId !== "string" || candidate.userId.length === 0) return undefined;
	if (candidate.method !== "email" && candidate.method !== "wallet") return undefined;
	if (candidate.walletAddress !== undefined && typeof candidate.walletAddress !== "string") return undefined;

	return {
		method: candidate.method,
		userId: candidate.userId,
		...(candidate.walletAddress ? { walletAddress: candidate.walletAddress } : {}),
	};
}

function readLoginIntentSnapshot(userId: string | null | undefined): string | null {
	if (!userId || typeof window === "undefined") return null;

	try {
		const value = window.sessionStorage.getItem(getPrivyLoginIntentStorageKey(userId));
		if (!value) return null;
		const stored = parseStoredLoginIntent(value);
		return stored?.userId === userId ? value : null;
	} catch {
		return null;
	}
}

function subscribeToPrivyLoginIntent(userId: string | null | undefined, listener: () => void): () => void {
	if (!userId) return () => {};
	const listeners = listenersByUser.get(userId) ?? new Set<() => void>();
	listeners.add(listener);
	listenersByUser.set(userId, listeners);

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) listenersByUser.delete(userId);
	};
}

function publishLoginIntentChange(userId: string): void {
	for (const listener of listenersByUser.get(userId) ?? []) listener();
}

function resolveLoginMethod(loginMethod: string): PrivyLoginMethod | undefined {
	if (loginMethod === "email") return "email";
	if (loginMethod === "siwe") return "wallet";
	return undefined;
}

function decodeLoginIntent(snapshot: string | null, userId: string | null | undefined): PrivyLoginIntent | undefined {
	if (!snapshot || !userId) return undefined;
	const stored = parseStoredLoginIntent(snapshot);
	return stored?.userId === userId ? stored : undefined;
}

export function getPrivyLoginIntent(userId: string | null | undefined): PrivyLoginIntent | undefined {
	return decodeLoginIntent(readLoginIntentSnapshot(userId), userId);
}

export function getPrivyLoginMethod(userId: string | null | undefined): PrivyLoginMethod | undefined {
	return getPrivyLoginIntent(userId)?.method;
}

export function usePrivyLoginIntent(userId: string | null | undefined): PrivyLoginIntent | undefined {
	const subscribe = useCallback((listener: () => void) => subscribeToPrivyLoginIntent(userId, listener), [userId]);
	const getSnapshot = useCallback(() => readLoginIntentSnapshot(userId), [userId]);
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
	return useMemo(() => decodeLoginIntent(snapshot, userId), [snapshot, userId]);
}

export function recordPrivyLoginMethod(userId: string, loginMethod: string | null, walletAddress?: string): void {
	if (!userId || loginMethod === null || typeof window === "undefined") return;

	try {
		const method = resolveLoginMethod(loginMethod);
		if (!method) {
			clearPrivyLoginMethod(userId);
			return;
		}

		const intent: PrivyLoginIntent = {
			method,
			userId,
			...(method === "wallet" && walletAddress ? { walletAddress } : {}),
		};
		window.sessionStorage.setItem(getPrivyLoginIntentStorageKey(userId), JSON.stringify(intent));
		publishLoginIntentChange(userId);
	} catch {}
}

export function clearPrivyLoginMethod(userId: string | null | undefined): void {
	if (!userId || typeof window === "undefined") return;

	try {
		window.sessionStorage.removeItem(getPrivyLoginIntentStorageKey(userId));
		publishLoginIntentChange(userId);
	} catch {}
}
