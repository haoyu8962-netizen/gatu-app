import type { ExchangeClient } from "@nktkas/hyperliquid";
import type { SessionMode } from "../../signing/agent-session";
import type { HyperliquidEnv } from "../../signing/types";
import type { ExchangeMethod } from "../../types/clients";
import { getReceiptAgeMs } from "../websocket/staleness";

export type ExchangeRequestPriority = "normal" | "urgent";

/**
 * Which key signs the request. An external-wallet session signs user actions with the owner
 * wallet and trading actions with its Agent; each signer keeps its own generation slot so a
 * user-signed request can never invalidate a queued Agent-signed one, or the reverse.
 */
export type ExchangeRequestSigner = "user" | "agent";

export interface ExchangeRequestGeneration {
	readonly env: HyperliquidEnv;
	readonly clientKey: string;
	readonly sessionMode: SessionMode;
	readonly signer: ExchangeRequestSigner;
	readonly registrationEpoch?: string;
	readonly agentPublicKey?: string;
	readonly activeOwnerActivationEpoch?: string;
	readonly lifecycle?: ExchangeProviderLifecycleLease;
	readonly generation: symbol;
}

export interface ExchangeProviderLifecycleLease {
	readonly id: symbol;
	active: boolean;
}

export interface ExchangeRequestGenerationProof {
	signer?: ExchangeRequestSigner;
	registrationEpoch?: string;
	agentPublicKey?: string;
	activeOwnerActivationEpoch?: string;
	lifecycle?: ExchangeProviderLifecycleLease;
}

export type ExchangeRequestStartResult = { status: "started"; execution: Promise<unknown> } | { status: "invalidated" };

/** `signal` aborts when the request is rejected before it started (deadline, identity change). */
export type ExchangeRequestStartGate = (
	start: () => ExchangeRequestStartResult,
	signal: AbortSignal,
) => Promise<ExchangeRequestStartResult>;

interface SigningDeadline {
	queuedAt: number;
	queuedAtMonotonic: number;
	deadlineMs?: number;
}

/** The action a client is executing; its wallet checks the deadline before every signature (ADR 0053). */
export interface ExchangeSigningDeadlineSlot {
	current?: SigningDeadline;
}

type QueueEntry<T> = {
	run: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
	generation?: ExchangeRequestGeneration;
	startGate?: ExchangeRequestStartGate;
	started: boolean;
	settled: boolean;
	queuedAt: number;
	queuedAtMonotonic: number;
	deadlineMs?: number;
	deadlineTimer?: ReturnType<typeof setTimeout>;
	controller: AbortController;
};

const identityGenerations = new Map<string, ExchangeRequestGeneration>();
const activeSchedulers = new Set<ExchangeRequestScheduler>();

function getIdentityKey(
	env: HyperliquidEnv,
	clientKey: string,
	sessionMode: SessionMode,
	signer: ExchangeRequestSigner,
): string {
	return `${env}:${clientKey.toLowerCase()}:${sessionMode}:${signer}`;
}

function isGenerationCurrent(generation: ExchangeRequestGeneration | undefined): boolean {
	if (!generation) return true;
	return (
		generation.lifecycle?.active !== false &&
		identityGenerations.get(
			getIdentityKey(generation.env, generation.clientKey, generation.sessionMode, generation.signer),
		) === generation
	);
}

function hasSameGenerationProof(generation: ExchangeRequestGeneration, proof: ExchangeRequestGenerationProof): boolean {
	return (
		generation.registrationEpoch === proof.registrationEpoch &&
		generation.agentPublicKey === proof.agentPublicKey?.toLowerCase() &&
		generation.activeOwnerActivationEpoch === proof.activeOwnerActivationEpoch &&
		generation.lifecycle === proof.lifecycle
	);
}

function invalidateStaleSchedulerEntries(): void {
	for (const scheduler of activeSchedulers) scheduler.invalidateStaleRequests();
}

export class ExchangeRequestInvalidatedError extends Error {
	constructor() {
		super("Exchange request was cancelled because the active signing identity changed.");
		this.name = "ExchangeRequestInvalidatedError";
	}
}

/** ADR 0053: the longest an action may wait between enqueue and its signature, as long as ADR 0045's window. */
export const EXCHANGE_ACTION_START_DEADLINE_MS = 15_000;

export class ExchangeActionDeadlineError extends Error {
	constructor() {
		super("Exchange request expired before signing.");
		this.name = "ExchangeActionDeadlineError";
	}
}

/** Cancels only reduce exposure, so they keep their place however long the queue was busy (ADR 0053). */
export function getExchangeStartDeadlineMs(method: ExchangeMethod): number | undefined {
	return method === "cancel" || method === "cancelByCloid" || method === "twapCancel"
		? undefined
		: EXCHANGE_ACTION_START_DEADLINE_MS;
}

function hasPassedDeadline(entry: SigningDeadline): boolean {
	return entry.deadlineMs !== undefined && getReceiptAgeMs(entry.queuedAt, entry.queuedAtMonotonic) >= entry.deadlineMs;
}

/** A deadline that starts now, for a flow that signs outside the scheduler (builder fee, Agent approval). */
export function startExchangeActionDeadline(): ExchangeSigningDeadlineSlot {
	return {
		current: {
			queuedAt: Date.now(),
			queuedAtMonotonic: performance.now(),
			deadlineMs: EXCHANGE_ACTION_START_DEADLINE_MS,
		},
	};
}

export function hasExchangeActionDeadlinePassed(slot: ExchangeSigningDeadlineSlot): boolean {
	return !!slot.current && hasPassedDeadline(slot.current);
}

export function assertExchangeSigningDeadline(slot: ExchangeSigningDeadlineSlot): void {
	if (hasExchangeActionDeadlinePassed(slot)) throw new ExchangeActionDeadlineError();
}

/** The SDK wraps a wallet error in `AbstractWalletError`; a deadline error is surfaced as itself. */
export function unwrapExchangeSigningDeadline(error: unknown): never {
	throw error instanceof Error && error.cause instanceof ExchangeActionDeadlineError ? error.cause : error;
}

const signingDeadlineSlots = new WeakMap<ExchangeClient, ExchangeSigningDeadlineSlot>();

export function registerExchangeSigningDeadline(client: ExchangeClient, slot: ExchangeSigningDeadlineSlot): void {
	signingDeadlineSlots.set(client, slot);
}

export class ExchangeRequestScheduler {
	private readonly urgentQueue: QueueEntry<unknown>[] = [];
	private readonly normalQueue: QueueEntry<unknown>[] = [];
	private current: QueueEntry<unknown> | null = null;
	private running = false;

	constructor(private readonly slot: ExchangeSigningDeadlineSlot = {}) {}

	schedule<T>(
		priority: ExchangeRequestPriority,
		run: () => Promise<T>,
		generation?: ExchangeRequestGeneration,
		startGate?: ExchangeRequestStartGate,
		deadlineMs?: number,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const entry = {
				run,
				resolve,
				reject,
				generation,
				startGate,
				started: false,
				settled: false,
				queuedAt: Date.now(),
				queuedAtMonotonic: performance.now(),
				deadlineMs,
				controller: new AbortController(),
			} as QueueEntry<unknown>;
			if (!isGenerationCurrent(generation)) {
				this.rejectEntry(entry, new ExchangeRequestInvalidatedError());
				return;
			}
			if (deadlineMs !== undefined) {
				entry.deadlineTimer = setTimeout(() => {
					if (entry.started) return;
					this.rejectEntry(entry, new ExchangeActionDeadlineError());
					this.finishEntry(entry);
				}, deadlineMs);
			}
			if (priority === "urgent") this.urgentQueue.push(entry);
			else this.normalQueue.push(entry);
			activeSchedulers.add(this);
			this.drain();
		});
	}

	invalidateStaleRequests(): void {
		this.rejectQueuedEntries(this.urgentQueue, (entry) => !isGenerationCurrent(entry.generation));
		this.rejectQueuedEntries(this.normalQueue, (entry) => !isGenerationCurrent(entry.generation));
		if (this.current && !this.current.started && !isGenerationCurrent(this.current.generation)) {
			this.rejectEntry(this.current, new ExchangeRequestInvalidatedError());
		}
		this.releaseIfIdle();
	}

	invalidatePendingRequests(): void {
		this.rejectQueuedEntries(this.urgentQueue, () => true);
		this.rejectQueuedEntries(this.normalQueue, () => true);
		if (this.current && !this.current.started) {
			this.rejectEntry(this.current, new ExchangeRequestInvalidatedError());
		}
		this.releaseIfIdle();
	}

	private rejectQueuedEntries(
		queue: QueueEntry<unknown>[],
		shouldReject: (entry: QueueEntry<unknown>) => boolean,
	): void {
		for (let index = queue.length - 1; index >= 0; index--) {
			const entry = queue[index];
			if (!entry || !shouldReject(entry)) continue;
			queue.splice(index, 1);
			this.rejectEntry(entry, new ExchangeRequestInvalidatedError());
		}
	}

	private rejectEntry(entry: QueueEntry<unknown>, reason: unknown): void {
		if (entry.settled) return;
		entry.settled = true;
		clearTimeout(entry.deadlineTimer);
		entry.controller.abort();
		entry.reject(reason);
	}

	private resolveEntry(entry: QueueEntry<unknown>, value: unknown): void {
		if (entry.settled) return;
		entry.settled = true;
		clearTimeout(entry.deadlineTimer);
		entry.resolve(value);
	}

	private finishEntry(entry: QueueEntry<unknown>): void {
		if (this.current !== entry) return;
		this.current = null;
		this.running = false;
		this.drain();
	}

	private releaseIfIdle(): void {
		if (!this.running && this.urgentQueue.length === 0 && this.normalQueue.length === 0) {
			activeSchedulers.delete(this);
		}
	}

	private drain(): void {
		if (this.running) return;
		const entry = this.urgentQueue.shift() ?? this.normalQueue.shift();
		if (!entry) {
			this.releaseIfIdle();
			return;
		}

		this.running = true;
		this.current = entry;
		void Promise.resolve()
			.then(async () => {
				if (entry.settled) return;
				try {
					const start = (): ExchangeRequestStartResult => {
						if (entry.settled || !isGenerationCurrent(entry.generation)) {
							return { status: "invalidated" };
						}
						if (hasPassedDeadline(entry)) {
							this.rejectEntry(entry, new ExchangeActionDeadlineError());
							return { status: "invalidated" };
						}
						entry.started = true;
						clearTimeout(entry.deadlineTimer);
						this.slot.current = entry;
						let execution: Promise<unknown>;
						try {
							execution = Promise.resolve(entry.run());
						} catch (error) {
							execution = Promise.reject(error);
						}
						return { status: "started", execution };
					};
					const result = entry.startGate ? await entry.startGate(start, entry.controller.signal) : start();
					if (result.status === "invalidated") {
						this.rejectEntry(entry, new ExchangeRequestInvalidatedError());
						return;
					}
					this.resolveEntry(entry, await result.execution);
				} catch (error) {
					this.rejectEntry(entry, error);
				}
			})
			.finally(() => {
				if (this.slot.current === entry) this.slot.current = undefined;
				this.finishEntry(entry);
			});
	}
}

const schedulers = new WeakMap<ExchangeClient, ExchangeRequestScheduler>();

export function captureExchangeRequestGeneration(
	env: HyperliquidEnv,
	clientKey: string,
	sessionMode: SessionMode,
	proof: ExchangeRequestGenerationProof = {},
): ExchangeRequestGeneration {
	const signer = proof.signer ?? "user";
	const identityKey = getIdentityKey(env, clientKey, sessionMode, signer);
	const current = identityGenerations.get(identityKey);
	if (current && hasSameGenerationProof(current, proof)) return current;

	const generation = {
		env,
		clientKey: clientKey.toLowerCase(),
		sessionMode,
		signer,
		registrationEpoch: proof.registrationEpoch,
		agentPublicKey: proof.agentPublicKey?.toLowerCase(),
		activeOwnerActivationEpoch: proof.activeOwnerActivationEpoch,
		lifecycle: proof.lifecycle,
		generation: Symbol(identityKey),
	} satisfies ExchangeRequestGeneration;
	identityGenerations.set(identityKey, generation);
	if (current) invalidateStaleSchedulerEntries();
	return generation;
}

/**
 * Retires the generations of one owner. Without `signer` every signer of that owner is retired
 * (the session itself ended); with `"agent"` only Agent-signed requests are retired, which is what
 * an Agent key replacement or removal means for a wallet session whose owner keeps signing.
 */
export function invalidateExchangeRequestIdentity(
	env: HyperliquidEnv,
	clientKey: string,
	sessionMode?: SessionMode,
	signer?: ExchangeRequestSigner,
): void {
	const normalizedClientKey = clientKey.toLowerCase();
	for (const [identityKey, generation] of identityGenerations) {
		if (
			generation.env === env &&
			generation.clientKey === normalizedClientKey &&
			(sessionMode === undefined || generation.sessionMode === sessionMode) &&
			(signer === undefined || generation.signer === signer)
		) {
			identityGenerations.delete(identityKey);
		}
	}
	invalidateStaleSchedulerEntries();
}

export function invalidateAllExchangeRequestIdentities(): void {
	identityGenerations.clear();
	invalidateStaleSchedulerEntries();
}

export function invalidateExchangeProviderLifecycle(lifecycle: ExchangeProviderLifecycleLease): void {
	for (const [identityKey, generation] of identityGenerations) {
		if (generation.lifecycle === lifecycle) identityGenerations.delete(identityKey);
	}
	invalidateStaleSchedulerEntries();
}

export function invalidateExchangeClientRequests(client: ExchangeClient): void {
	schedulers.get(client)?.invalidatePendingRequests();
}

function containsOnlyReduceOnlyOrders(params: unknown, field: "modifies" | "orders"): boolean {
	if (!params || typeof params !== "object") return false;
	const entries = (params as Record<string, unknown>)[field];
	if (!Array.isArray(entries) || entries.length === 0) return false;

	return entries.every((entry) => {
		if (!entry || typeof entry !== "object") return false;
		const order = field === "modifies" ? (entry as Record<string, unknown>).order : entry;
		return !!order && typeof order === "object" && (order as Record<string, unknown>).r === true;
	});
}

export function getExchangeRequestPriority(method: ExchangeMethod, params: unknown): ExchangeRequestPriority {
	if (method === "cancel" || method === "cancelByCloid" || method === "twapCancel") return "urgent";
	if (method === "order" && containsOnlyReduceOnlyOrders(params, "orders")) return "urgent";
	if (method === "batchModify" && containsOnlyReduceOnlyOrders(params, "modifies")) return "urgent";
	if (method === "twapOrder" && params && typeof params === "object") {
		const twap = (params as Record<string, unknown>).twap;
		if (twap && typeof twap === "object" && (twap as Record<string, unknown>).r === true) return "urgent";
	}
	return "normal";
}

export function scheduleExchangeRequest<T>(
	client: ExchangeClient,
	priority: ExchangeRequestPriority,
	run: () => Promise<T>,
	generation?: ExchangeRequestGeneration,
	startGate?: ExchangeRequestStartGate,
	deadlineMs?: number,
): Promise<T> {
	let scheduler = schedulers.get(client);
	if (!scheduler) {
		scheduler = new ExchangeRequestScheduler(signingDeadlineSlots.get(client));
		schedulers.set(client, scheduler);
	}
	return scheduler.schedule(priority, run, generation, startGate, deadlineMs);
}
