import { createValidatedStorage } from "@/lib/storage/validated-storage";
import { z } from "@/lib/zod";

export const DIAGNOSTICS_STORAGE_KEY = "startup-diagnostics-v1";
export const DIAGNOSTICS_MAX_BOOTS = 10;
export const DIAGNOSTICS_MAX_RECOVERIES = 20;
export const DIAGNOSTICS_MAX_BYTES = 32_000;

const DIAGNOSTICS_VERSION = 1;

const timeMs = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const shortText = z.string().max(64);

const milestonesSchema = z.object({
	entry: timeMs.optional(),
	runtime: timeMs.optional(),
	locale: timeMs.optional(),
	localeFallback: timeMs.optional(),
	fonts: timeMs.optional(),
	reveal: timeMs.optional(),
	route: timeMs.optional(),
});

const navigationSchema = z.object({
	type: shortText,
	transferSize: timeMs,
	workerStart: timeMs,
	fetchStart: timeMs,
	requestStart: timeMs,
	responseStart: timeMs,
	responseEnd: timeMs,
	domInteractive: timeMs,
	domContentLoaded: timeMs,
	loadEnd: timeMs,
});

const recoverySchema = z.object({
	at: timeMs,
	cause: z.enum(["stream-stale", "multiple-streams-stale", "network-resume"]),
	action: z.enum(["resubscribe", "reconnect"]),
	streams: timeMs,
	visibility: z.enum(["visible", "hidden"]),
	network: z.enum(["online", "offline"]),
	durationMs: timeMs,
	result: z.enum(["recovered", "pending", "timeout", "dropped"]),
});

const bootSchema = z.object({
	id: shortText,
	startedAt: timeMs,
	build: z.object({ commit: shortText, release: shortText }),
	navigation: navigationSchema.nullable(),
	resources: z.object({ total: timeMs, fetched: timeMs, fetchedBytes: timeMs }),
	milestones: milestonesSchema,
	hiddenAt: timeMs.nullable(),
	recoveries: z.array(recoverySchema).max(DIAGNOSTICS_MAX_RECOVERIES),
});

const bufferSchema = z.object({
	v: z.literal(DIAGNOSTICS_VERSION),
	boots: z.array(bootSchema).max(DIAGNOSTICS_MAX_BOOTS),
});

export type DiagnosticsBootRecord = z.infer<typeof bootSchema>;
export type DiagnosticsRecovery = z.infer<typeof recoverySchema>;
export type DiagnosticsBuffer = z.infer<typeof bufferSchema>;

const storage = createValidatedStorage(bufferSchema, "diagnostics");

function emptyBuffer(): DiagnosticsBuffer {
	return { v: DIAGNOSTICS_VERSION, boots: [] };
}

/** Corrupt, oversized or unknown-version data is discarded (the validated storage removes it). */
export function readDiagnosticsBuffer(): DiagnosticsBuffer {
	try {
		const item = storage.getItem(DIAGNOSTICS_STORAGE_KEY);
		if (typeof item !== "string") return emptyBuffer();
		const parsed = bufferSchema.safeParse(JSON.parse(item));
		return parsed.success ? parsed.data : emptyBuffer();
	} catch {
		return emptyBuffer();
	}
}

/** Replaces this boot's entry (or appends it), keeps the newest boots within the count and size caps, and never throws. */
export function upsertDiagnosticsBootRecord(record: DiagnosticsBootRecord): void {
	try {
		const candidate = bootSchema.safeParse(record);
		if (!candidate.success) return;
		let boots = readDiagnosticsBuffer().boots.filter((boot) => boot.id !== record.id);
		boots.push(candidate.data);
		boots = boots.slice(-DIAGNOSTICS_MAX_BOOTS);
		let serialized = JSON.stringify({ v: DIAGNOSTICS_VERSION, boots });
		while (serialized.length > DIAGNOSTICS_MAX_BYTES && boots.length > 1) {
			boots = boots.slice(1);
			serialized = JSON.stringify({ v: DIAGNOSTICS_VERSION, boots });
		}
		if (serialized.length > DIAGNOSTICS_MAX_BYTES) return;
		storage.setItem(DIAGNOSTICS_STORAGE_KEY, serialized);
	} catch {}
}
