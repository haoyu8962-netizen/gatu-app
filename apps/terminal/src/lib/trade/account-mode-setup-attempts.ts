import {
	ACCOUNT_MODE_SETUP_MAX_ATTEMPTS,
	ACCOUNT_MODE_SETUP_RETRY_DELAY_MS,
	ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS,
	type AccountModeSetupAttemptStatus,
	type AccountModeSetupFailure,
	getAccountModeSetupAttemptStatusAfterFailure,
} from "@/domain/trade/account-mode-setup";

interface AttemptEntry {
	attempts: number;
	status: AccountModeSetupAttemptStatus;
	timer?: ReturnType<typeof setTimeout>;
}

// Attempts are counted per network and account for the life of the page, so a remount or a
// StrictMode effect replay can neither send a second request for an attempt in flight nor reset
// the limit. Timers only ever change their own entry.
const entries = new Map<string, AttemptEntry>();
const listeners = new Set<() => void>();

function notify() {
	for (const listener of listeners) listener();
}

function setStatus(key: string, entry: AttemptEntry, status: AccountModeSetupAttemptStatus) {
	entry.status = status;
	entries.set(key, entry);
	notify();
}

function scheduleStatus(
	key: string,
	entry: AttemptEntry,
	from: AccountModeSetupAttemptStatus,
	to: AccountModeSetupAttemptStatus,
	delayMs: number,
) {
	entry.timer = setTimeout(() => {
		entry.timer = undefined;
		if (entries.get(key) === entry && entry.status === from) setStatus(key, entry, to);
	}, delayMs);
}

function finish(key: string, entry: AttemptEntry, status: AccountModeSetupAttemptStatus) {
	setStatus(key, entry, status);
	if (status === "waiting") scheduleStatus(key, entry, "waiting", "idle", ACCOUNT_MODE_SETUP_RETRY_DELAY_MS);
	if (status === "settled") scheduleStatus(key, entry, "settled", "exhausted", ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS);
}

export function subscribeAccountModeSetupAttempts(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getAccountModeSetupAttemptStatus(key: string): AccountModeSetupAttemptStatus {
	return entries.get(key)?.status ?? "idle";
}

export function beginAccountModeSetupAttempt(key: string): boolean {
	const entry = entries.get(key) ?? { attempts: 0, status: "idle" };
	if (entry.status !== "idle" || entry.attempts >= ACCOUNT_MODE_SETUP_MAX_ATTEMPTS) return false;
	entry.attempts += 1;
	setStatus(key, entry, "in-flight");
	return true;
}

export function settleAccountModeSetupAttempt(key: string): void {
	const entry = entries.get(key);
	if (entry?.status !== "in-flight") return;
	finish(key, entry, "settled");
}

export function failAccountModeSetupAttempt(key: string, failure: AccountModeSetupFailure): void {
	const entry = entries.get(key);
	if (entry?.status !== "in-flight") return;
	finish(key, entry, getAccountModeSetupAttemptStatusAfterFailure(failure, entry.attempts));
}

export function resetAccountModeSetupAttempts(): void {
	for (const entry of entries.values()) {
		if (entry.timer !== undefined) clearTimeout(entry.timer);
	}
	entries.clear();
	notify();
}
