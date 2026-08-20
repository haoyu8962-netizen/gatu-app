import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";
import "../../src/styles.css";

interface PerformanceAuditState {
	callbackDurations: number[];
	commitCallbacks: number;
	commitLatencies: number[];
	commitsByFrame: Record<number, number>;
	frameId: number;
	observing: boolean;
	pendingCommitStarts: number[];
	pointerFirstAt: number;
	pointerLastAt: number;
	previewCallbacks: number;
	rawPointerMoves: number;
	startedFrame: number;
	startedAt: number;
}

const audit: PerformanceAuditState = {
	callbackDurations: [],
	commitCallbacks: 0,
	commitLatencies: [],
	commitsByFrame: {},
	frameId: 0,
	observing: false,
	pendingCommitStarts: [],
	pointerFirstAt: 0,
	pointerLastAt: 0,
	previewCallbacks: 0,
	rawPointerMoves: 0,
	startedFrame: 0,
	startedAt: 0,
};

function percentile(values: number[], quantile: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function snapshot() {
	const elapsedMs = Math.max(0, performance.now() - audit.startedAt);
	const commitsPerFrame = Object.values(audit.commitsByFrame);
	const pointerSpanMs = Math.max(0, audit.pointerLastAt - audit.pointerFirstAt);
	const renderedFrames = Math.max(0, audit.frameId - audit.startedFrame);
	return {
		callbackDurationMedianMs: percentile(audit.callbackDurations, 0.5),
		callbackDurationP95Ms: percentile(audit.callbackDurations, 0.95),
		commitCallbacks: audit.commitCallbacks,
		commitLatencyMedianMs: percentile(audit.commitLatencies, 0.5),
		commitLatencyP95Ms: percentile(audit.commitLatencies, 0.95),
		elapsedMs,
		maxParentCommitsPerFrame: Math.max(0, ...commitsPerFrame),
		multiCommitFrames: Object.entries(audit.commitsByFrame).filter(([, count]) => count > 1),
		parentCommits: commitsPerFrame.reduce((total, count) => total + count, 0),
		previewCallbackRateHz: elapsedMs > 0 ? (audit.previewCallbacks * 1000) / elapsedMs : 0,
		previewCallbacks: audit.previewCallbacks,
		rawPointerMoveRateHz: pointerSpanMs > 0 ? ((audit.rawPointerMoves - 1) * 1000) / pointerSpanMs : 0,
		rawPointerMoves: audit.rawPointerMoves,
		renderedFrames,
	};
}

Object.assign(window, {
	__gatuSliderPerf: {
		reset() {
			audit.callbackDurations = [];
			audit.commitCallbacks = 0;
			audit.commitLatencies = [];
			audit.commitsByFrame = {};
			audit.observing = true;
			audit.pendingCommitStarts = [];
			audit.pointerFirstAt = 0;
			audit.pointerLastAt = 0;
			audit.previewCallbacks = 0;
			audit.rawPointerMoves = 0;
			audit.startedFrame = audit.frameId;
			audit.startedAt = performance.now();
		},
		snapshot,
		stop() {
			audit.observing = false;
			return snapshot();
		},
	},
});

document.addEventListener("pointermove", (event) => {
	if (!audit.observing || event.buttons !== 1) return;
	const eventAt = performance.now();
	if (audit.rawPointerMoves === 0) audit.pointerFirstAt = eventAt;
	audit.pointerLastAt = eventAt;
	audit.rawPointerMoves += 1;
});

function frameLoop() {
	audit.frameId += 1;
	requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);

function SliderPerformanceFixture() {
	const [value, setValue] = useState(25);
	const valueRef = useRef(value);

	useLayoutEffect(() => {
		valueRef.current = value;
		if (!audit.observing) return;
		audit.commitsByFrame[audit.frameId] = (audit.commitsByFrame[audit.frameId] ?? 0) + 1;
		const committedAt = performance.now();
		for (const startedAt of audit.pendingCommitStarts) {
			audit.commitLatencies.push(committedAt - startedAt);
		}
		audit.pendingCommitStarts = [];
	}, [value]);

	function applyValue(nextValue: number) {
		const startedAt = performance.now();
		const changed = nextValue !== valueRef.current;
		if (changed && audit.observing) audit.pendingCommitStarts.push(startedAt);
		setValue(nextValue);
		if (audit.observing) audit.callbackDurations.push(performance.now() - startedAt);
	}

	function handlePreview(nextValue: number) {
		if (audit.observing) audit.previewCallbacks += 1;
		applyValue(nextValue);
	}

	function handleCommit(nextValue: number) {
		if (audit.observing) audit.commitCallbacks += 1;
		applyValue(nextValue);
	}

	return (
		<main className="min-h-screen bg-modal p-16 text-market-close-fg">
			<section className="mx-auto w-[640px] rounded-[16px] bg-modal p-8">
				<TradeSizeSlider
					value={value}
					onPercentChange={handlePreview}
					onPercentCancel={handlePreview}
					onPercentCommit={handleCommit}
					ariaLabel="Size percentage"
					thumbSize="lg"
				/>
				<output data-slider-value className="mt-8 block text-sm tabular-nums">
					{value}%
				</output>
			</section>
		</main>
	);
}

const root = document.querySelector("#root");
if (!(root instanceof HTMLElement)) throw new Error("Fixture root is missing");
createRoot(root).render(<SliderPerformanceFixture />);
