import {
	decodeMobileSyncEnvelope,
	encodeMobileSyncEnvelope,
	MOBILE_SYNC_CLOCK_SKEW_MS,
	type MobileSyncEnvelope,
} from "./sync-core";

const MOBILE_SYNC_DRAFT_STORAGE_KEY = "gatu.mobile-sync.import-draft.v1";
let draftExpiryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let scheduledDraftStorage: Storage | null = null;

interface StoredMobileSyncDraft {
	v: 1;
	syncId: string;
	createdAtMs: number;
	expiresAtMs: number;
	encodedEnvelope: string;
	encodedKey: string;
	storedAtMs: number;
}

export interface MobileSyncDraft {
	envelope: MobileSyncEnvelope;
	encodedKey: string;
	syncId: string;
	createdAtMs: number;
	expiresAtMs: number;
	storedAtMs: number;
}

export type ReadMobileSyncDraftResult =
	| { status: "empty" }
	| { status: "found"; draft: MobileSyncDraft }
	| { status: "expired" }
	| { status: "invalid" }
	| { status: "unavailable" };

interface MobileSyncDraftStorageOptions {
	nowMs?: number;
	storage?: Storage | null;
}

export function saveMobileSyncDraft(
	envelope: MobileSyncEnvelope,
	encodedKey: string,
	options: MobileSyncDraftStorageOptions = {},
): boolean {
	const storage = getDraftStorage(options.storage);
	if (!storage) return false;

	const storedDraft: StoredMobileSyncDraft = {
		v: 1,
		syncId: envelope.syncId,
		createdAtMs: envelope.createdAtMs,
		expiresAtMs: envelope.expiresAtMs,
		encodedEnvelope: encodeMobileSyncEnvelope(envelope),
		encodedKey,
		storedAtMs: options.nowMs ?? Date.now(),
	};

	try {
		const serialized = JSON.stringify(storedDraft);
		storage.setItem(MOBILE_SYNC_DRAFT_STORAGE_KEY, serialized);
		if (storage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY) !== serialized) {
			clearMobileSyncDraft({ storage });
			return false;
		}
		if (isBrowserSessionStorage(storage)) {
			scheduleMobileSyncDraftExpiry(storage, envelope.expiresAtMs, options.nowMs ?? Date.now());
		}
		return true;
	} catch {
		clearMobileSyncDraft({ storage });
		return false;
	}
}

export function readMobileSyncDraft(options: MobileSyncDraftStorageOptions = {}): ReadMobileSyncDraftResult {
	const storage = getDraftStorage(options.storage);
	if (!storage) return { status: "unavailable" };

	let storedValue: string | null;
	try {
		storedValue = storage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY);
	} catch {
		return { status: "unavailable" };
	}
	if (!storedValue) return { status: "empty" };

	try {
		const parsed = JSON.parse(storedValue) as Partial<StoredMobileSyncDraft>;
		if (
			parsed.v !== 1 ||
			typeof parsed.syncId !== "string" ||
			typeof parsed.createdAtMs !== "number" ||
			typeof parsed.expiresAtMs !== "number" ||
			typeof parsed.encodedEnvelope !== "string" ||
			typeof parsed.encodedKey !== "string" ||
			typeof parsed.storedAtMs !== "number"
		) {
			clearMobileSyncDraft({ storage });
			return { status: "invalid" };
		}

		if (isMobileSyncEnvelopeExpiredAt(parsed.expiresAtMs, options.nowMs ?? Date.now())) {
			clearMobileSyncDraft({ storage });
			return { status: "expired" };
		}

		const envelope = decodeMobileSyncEnvelope(parsed.encodedEnvelope);
		if (
			envelope.syncId !== parsed.syncId ||
			envelope.createdAtMs !== parsed.createdAtMs ||
			envelope.expiresAtMs !== parsed.expiresAtMs
		) {
			clearMobileSyncDraft({ storage });
			return { status: "invalid" };
		}
		if (isBrowserSessionStorage(storage)) {
			scheduleMobileSyncDraftExpiry(storage, parsed.expiresAtMs, options.nowMs ?? Date.now());
		}

		return {
			status: "found",
			draft: {
				envelope,
				encodedKey: parsed.encodedKey,
				syncId: parsed.syncId,
				createdAtMs: parsed.createdAtMs,
				expiresAtMs: parsed.expiresAtMs,
				storedAtMs: parsed.storedAtMs,
			},
		};
	} catch {
		clearMobileSyncDraft({ storage });
		return { status: "invalid" };
	}
}

export function clearMobileSyncDraft(options: Pick<MobileSyncDraftStorageOptions, "storage"> = {}): boolean {
	const storage = getDraftStorage(options.storage);
	if (!storage) return false;

	try {
		storage.removeItem(MOBILE_SYNC_DRAFT_STORAGE_KEY);
		const removed = storage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY) === null;
		if (removed) cancelMobileSyncDraftExpiry(storage);
		return removed;
	} catch {
		return false;
	}
}

export function isMobileSyncEnvelopeExpired(envelope: MobileSyncEnvelope, nowMs = Date.now()): boolean {
	return isMobileSyncEnvelopeExpiredAt(envelope.expiresAtMs, nowMs);
}

/** Arms cleanup for a draft left by a previous route or full-page navigation. */
export function armMobileSyncDraftExpiryCleanup(): void {
	readMobileSyncDraft();
}

function isMobileSyncEnvelopeExpiredAt(expiresAtMs: number, nowMs: number): boolean {
	return nowMs > expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS;
}

function getDraftStorage(storage?: Storage | null): Storage | null {
	if (storage !== undefined) return storage;
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function isBrowserSessionStorage(storage: Storage): boolean {
	if (typeof window === "undefined") return false;
	try {
		return storage === window.sessionStorage;
	} catch {
		return false;
	}
}

function scheduleMobileSyncDraftExpiry(storage: Storage, expiresAtMs: number, nowMs: number): void {
	if (draftExpiryTimer !== null) globalThis.clearTimeout(draftExpiryTimer);
	scheduledDraftStorage = storage;
	const delayMs = Math.max(0, expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS - nowMs + 1);
	draftExpiryTimer = globalThis.setTimeout(() => {
		draftExpiryTimer = null;
		scheduledDraftStorage = null;
		clearMobileSyncDraft({ storage });
	}, delayMs);
}

function cancelMobileSyncDraftExpiry(storage: Storage): void {
	if (scheduledDraftStorage !== storage) return;
	if (draftExpiryTimer !== null) globalThis.clearTimeout(draftExpiryTimer);
	draftExpiryTimer = null;
	scheduledDraftStorage = null;
}

export { MOBILE_SYNC_DRAFT_STORAGE_KEY };
