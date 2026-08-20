export const CHART_HISTORY_RECOVERY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

interface Options {
	canRetry: () => boolean;
	onExhausted: () => void;
	onRetry: () => void;
	delaysMs?: readonly number[];
}

export interface HistoryRecoveryController {
	destroy: () => void;
	flush: () => void;
	handleFailure: () => void;
	handleSuccess: () => void;
	reset: () => void;
}

export function createHistoryRecoveryController({
	canRetry,
	onExhausted,
	onRetry,
	delaysMs = CHART_HISTORY_RECOVERY_DELAYS_MS,
}: Options): HistoryRecoveryController {
	let attempt = 0;
	let awaitingResult = false;
	let destroyed = false;
	let exhaustionNotified = false;
	let pending = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const clearTimer = () => {
		if (timer === null) return;
		clearTimeout(timer);
		timer = null;
	};

	const notifyExhausted = () => {
		if (exhaustionNotified) return;
		exhaustionNotified = true;
		onExhausted();
	};

	const run = () => {
		if (destroyed || !pending || awaitingResult || !canRetry()) return;
		if (attempt >= delaysMs.length) {
			notifyExhausted();
			return;
		}

		pending = false;
		awaitingResult = true;
		exhaustionNotified = false;
		attempt += 1;
		onRetry();
	};

	const schedule = () => {
		if (destroyed || timer !== null || !pending || awaitingResult) return;
		const delayMs = delaysMs[attempt];
		if (delayMs === undefined) {
			notifyExhausted();
			return;
		}
		if (!canRetry()) return;

		timer = setTimeout(() => {
			timer = null;
			run();
		}, delayMs);
	};

	const reset = () => {
		clearTimer();
		attempt = 0;
		awaitingResult = false;
		exhaustionNotified = false;
		pending = false;
	};

	return {
		destroy: () => {
			destroyed = true;
			reset();
		},
		flush: () => {
			if (destroyed || !pending || awaitingResult || !canRetry()) return;
			clearTimer();
			run();
		},
		handleFailure: () => {
			if (destroyed) return;
			awaitingResult = false;
			pending = true;
			schedule();
		},
		handleSuccess: () => {
			if (destroyed || (pending && !awaitingResult && attempt < delaysMs.length)) return;
			reset();
		},
		reset,
	};
}
