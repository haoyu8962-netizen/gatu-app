import { i18n } from "@lingui/core";
import { useLayoutEffect, useRef, useState } from "react";
import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";
import { MobileTradeSizeControl } from "@/components/trade/mobile/mobile-trade-size-control";
import { LeverageSlider } from "@/components/trade/tradebox/leverage-slider";
import { getSizeForPercent, getSliderValue } from "@/domain/trade/order/size";
import { useSizeSliderInteraction } from "@/hooks/trade/use-size-slider-interaction";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages } from "@/locales/en/messages.po";
import "./trade-slider.css";

interface PerformanceAuditState {
	callbackDurations: number[];
	previewTimes: number[];
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
	previewTimes: [],
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
		previewIntervals: audit.previewTimes.slice(1).map((time, i) => time - audit.previewTimes[i]),
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
			audit.previewTimes = [];
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
	const precision = new URLSearchParams(window.location.search).has("precision");
	const [value, setValue] = useState(25);
	const valueRef = useRef(value);
	const [leverage, setLeverage] = useState(1);
	const [size, setSize] = useState(precision ? "0.001" : "0.24");
	const [interacting, setInteracting] = useState(false);
	const gallery = new URLSearchParams(window.location.search).has("gallery");
	const sliderValue = precision ? getSliderValue(Number(size), 0.003) : value;

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
		if (precision)
			setSize(
				getSizeForPercent({
					pct: nextValue,
					isSpotMarket: false,
					side: "buy",
					sizeMode: "base",
					price: 1380,
					maxSize: 0.003,
					spotBalance: { baseAvailable: 0, quoteAvailable: 0, baseName: "SKHX", quoteName: "USDC" },
					szDecimals: 3,
				}),
			);
		if (audit.observing) audit.callbackDurations.push(performance.now() - startedAt);
	}

	const interaction = useSizeSliderInteraction({
		applyPercent: applyValue,
		interactionIdentity: "fixture:precision",
		setSizeInput: setSize,
		sizeInput: size,
		onInteractionChange: setInteracting,
	});

	function handlePreview(nextValue: number) {
		if (audit.observing) {
			audit.previewCallbacks += 1;
			audit.previewTimes.push(performance.now());
		}
		applyValue(nextValue);
	}

	function handleCommit(nextValue: number) {
		if (audit.observing) audit.commitCallbacks += 1;
		if (precision) interaction.onPercentCommit(nextValue);
		else applyValue(nextValue);
	}

	return (
		<main className="min-h-screen bg-modal p-6 text-market-close-fg">
			<section className="mx-auto w-full max-w-[640px] rounded-[16px] bg-modal p-4">
				<TradeSizeSlider
					value={sliderValue}
					onPercentChange={handlePreview}
					onPercentCancel={precision ? interaction.onPercentCancel : handlePreview}
					onPercentCommit={handleCommit}
					onPercentInteractionStart={precision ? interaction.onPercentInteractionStart : undefined}
					onPercentInteractionEnd={precision ? interaction.onPercentInteractionEnd : undefined}
					ariaLabel="Size percentage"
				/>
				<output data-slider-value className="mt-8 block text-sm tabular-nums">
					{sliderValue}%
				</output>
				{precision && (
					<output data-slider-size data-slider-interacting={interacting} className="block text-sm tabular-nums">
						{size}
					</output>
				)}
			</section>
			{gallery && (
				<section data-gallery className="mx-auto mt-8 grid w-full max-w-[1000px] gap-8 min-[1001px]:grid-cols-3">
					<div>
						<h2>Leverage</h2>
						<LeverageSlider
							value={leverage}
							max={10}
							onChange={setLeverage}
							onCommit={setLeverage}
							onCancel={() => setLeverage(1)}
						/>
					</div>
					<div>
						<h2>Mobile buy</h2>
						<MobileTradeSizeControl
							canUsePercent
							disabled={false}
							interactionIdentity="fixture:buy"
							maxAllowedDecimals={2}
							onPercentChange={setValue}
							onPercentCommit={setValue}
							onPercentCancel={setValue}
							onSizeChange={(e) => setSize(e.target.value)}
							onSizeModeToggle={() => undefined}
							percentAriaLabel="Buy size percent"
							side="buy"
							sizeAriaLabel="Buy size"
							sizeInput={size}
							sizeLabel="Size"
							sizeModeLabel="HYPE"
							sliderValue={value}
						/>
					</div>
					<div>
						<h2>Mobile sell</h2>
						<MobileTradeSizeControl
							canUsePercent
							disabled={false}
							interactionIdentity="fixture:sell"
							maxAllowedDecimals={2}
							onPercentChange={setValue}
							onPercentCommit={setValue}
							onPercentCancel={setValue}
							onSizeChange={(e) => setSize(e.target.value)}
							onSizeModeToggle={() => undefined}
							percentAriaLabel="Sell size percent"
							side="sell"
							sizeAriaLabel="Sell size"
							sizeInput={size}
							sizeLabel="Size"
							sizeModeLabel="HYPE"
							sliderValue={value}
						/>
					</div>
				</section>
			)}
		</main>
	);
}

const root = document.querySelector("#root");
if (!(root instanceof HTMLElement)) throw new Error("Fixture root is missing");
i18n.loadAndActivate({ locale: "en", messages });
createI18nRoot(root).render(<SliderPerformanceFixture />);
