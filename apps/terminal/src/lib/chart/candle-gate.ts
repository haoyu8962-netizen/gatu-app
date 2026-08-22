import type { CandleSnapshotResponse } from "@nktkas/hyperliquid";
import { getInfoClient } from "@/lib/hyperliquid";
import { isTestnet } from "@/lib/network";
import { getHttpStatus, parseRetryAfterMs } from "@/lib/query-retry";
import type { CandleInterval } from "./resolution";

export const CANDLE_GATE_BACKOFF_MS = [10_000, 20_000, 40_000, 60_000] as const;
export const CANDLE_GATE_PROBE_RETRY_MS = 2_000;
export const CANDLE_GATE_MIN_OPEN_MS = 1_000;

export interface CandleSnapshotParams {
	coin: string;
	interval: CandleInterval;
	startTime: number;
	endTime: number;
}

export class CandleRateLimitError extends Error {
	readonly retryAt: number;

	constructor(retryAt: number, options?: ErrorOptions) {
		super("Candle history is rate limited", options);
		this.name = "CandleRateLimitError";
		this.retryAt = retryAt;
	}
}

type CandleGate = {
	retryAt: number;
	backoffIndex: number;
	probeInFlight: boolean;
	episode: number;
	inflight: Map<string, Promise<CandleSnapshotResponse>>;
};

const gates = new Map<string, CandleGate>();
const gateListeners = new Set<() => void>();

function getGate(): CandleGate {
	const key = isTestnet() ? "testnet" : "mainnet";
	let gate = gates.get(key);
	if (!gate) {
		gate = { retryAt: 0, backoffIndex: 0, probeInFlight: false, episode: 0, inflight: new Map() };
		gates.set(key, gate);
	}
	return gate;
}

function notifyGateListeners(): void {
	for (const listener of [...gateListeners]) {
		try {
			listener();
		} catch {}
	}
}

function getRetryAfterMs(error: Error): number | null {
	const headers = (error as Error & { response?: { headers?: { get?: (name: string) => string | null } } }).response
		?.headers;
	if (typeof headers?.get !== "function") return null;
	return parseRetryAfterMs(headers.get("retry-after"));
}

function openGate(gate: CandleGate, error: Error): CandleRateLimitError {
	const backoffMs = CANDLE_GATE_BACKOFF_MS[Math.min(gate.backoffIndex, CANDLE_GATE_BACKOFF_MS.length - 1)];
	gate.retryAt = Date.now() + Math.max(getRetryAfterMs(error) ?? backoffMs, CANDLE_GATE_MIN_OPEN_MS);
	gate.backoffIndex = Math.min(gate.backoffIndex + 1, CANDLE_GATE_BACKOFF_MS.length - 1);
	gate.episode += 1;
	notifyGateListeners();
	return new CandleRateLimitError(gate.retryAt, { cause: error });
}

function closeGate(gate: CandleGate): void {
	if (gate.retryAt === 0 && gate.backoffIndex === 0) return;
	gate.retryAt = 0;
	gate.backoffIndex = 0;
	notifyGateListeners();
}

export function getCandleGateRetryAt(): number | null {
	const gate = getGate();
	return gate.retryAt > Date.now() ? gate.retryAt : null;
}

export function subscribeCandleGate(listener: () => void): () => void {
	gateListeners.add(listener);
	return () => {
		gateListeners.delete(listener);
	};
}

export function requestCandleSnapshot(params: CandleSnapshotParams): Promise<CandleSnapshotResponse> {
	const gate = getGate();
	const inflightKey = `${params.coin}|${params.interval}|${params.startTime}|${params.endTime}`;
	const pending = gate.inflight.get(inflightKey);
	if (pending) return pending;

	const now = Date.now();
	if (gate.retryAt > now) {
		return Promise.reject(new CandleRateLimitError(gate.retryAt));
	}
	const isProbe = gate.retryAt !== 0;
	if (isProbe) {
		if (gate.probeInFlight) {
			gate.retryAt = now + CANDLE_GATE_PROBE_RETRY_MS;
			notifyGateListeners();
			return Promise.reject(new CandleRateLimitError(gate.retryAt));
		}
		gate.probeInFlight = true;
	}

	// The shared request is intentionally never aborted by consumers: an HTTP request
	// that already reached the server counts against the IP rate limit either way, so
	// late results are kept joinable by identical requests until the promise settles.
	// The episode captured at issue time keeps straggler responses from an earlier
	// rate-limit episode from closing or re-escalating the gate out of order.
	const issuedEpisode = gate.episode;
	let transportRequest: Promise<CandleSnapshotResponse>;
	try {
		transportRequest = getInfoClient().candleSnapshot(params);
	} catch (error) {
		if (isProbe) gate.probeInFlight = false;
		return Promise.reject(error);
	}
	const request = transportRequest
		.then((candles) => {
			if (gate.episode === issuedEpisode) closeGate(gate);
			return candles;
		})
		.catch((error: unknown) => {
			if (error instanceof Error && getHttpStatus(error) === 429) {
				if (gate.episode === issuedEpisode) throw openGate(gate, error);
				if (gate.retryAt > Date.now()) throw new CandleRateLimitError(gate.retryAt, { cause: error });
			}
			throw error;
		})
		.finally(() => {
			if (isProbe) gate.probeInFlight = false;
			gate.inflight.delete(inflightKey);
		});

	request.catch(() => {});
	gate.inflight.set(inflightKey, request);
	return request;
}

export function resetCandleGates(): void {
	gates.clear();
}
