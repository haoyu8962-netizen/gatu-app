import { Profiler, type ProfilerOnRenderCallback, type ReactNode, useLayoutEffect, useRef } from "react";

type RenderPhase = "mount" | "update" | "nested-update" | "commit";
type RenderSample = {
	id: string;
	phase: RenderPhase;
	actualDuration: number;
	baseDuration?: number;
	startTime?: number;
	commitTime: number;
	timeSincePreviousCommit?: number;
	source: "profiler" | "commit-probe";
};
type RenderTrackSummary = {
	id: string;
	commits: number;
	totalDuration: number;
	averageDuration: number;
	maxDuration: number;
	slowCommits: number;
	lastCommitTime: number;
	lastDuration: number;
	recent: RenderSample[];
};
type RenderProfileSnapshot = {
	enabled: boolean;
	capturedAt: string;
	thresholdMs: number;
	tracks: Record<string, RenderTrackSummary>;
};

declare global {
	interface Window {
		__terminal_render_profile?: () => RenderProfileSnapshot;
		__terminal_render_profile_reset?: () => void;
	}
}

const QUERY_PARAM = "terminal_perf";
const STORAGE_KEY = "terminal-perf-enabled";
const SLOW_COMMIT_THRESHOLD_MS = 16.7;
const MAX_RECENT_SAMPLES = 30;

const tracks = new Map<string, RenderTrackSummary>();
let cachedEnabled: boolean | undefined;

function canUseBrowserApis() {
	return typeof window !== "undefined" && typeof performance !== "undefined";
}

export function isRenderProfilingEnabled() {
	cachedEnabled ??= readRenderProfilingEnabled();
	return cachedEnabled;
}

function readRenderProfilingEnabled() {
	if (!canUseBrowserApis()) return false;
	try {
		const params = new URLSearchParams(window.location.search);
		const queryValue = params.get(QUERY_PARAM);
		if (queryValue === "1" || queryValue === "true") {
			return true;
		}
		if (queryValue === "0" || queryValue === "false") {
			return false;
		}
		return window.localStorage.getItem(STORAGE_KEY) === "1" || import.meta.env.VITE_PERF_ENABLED === "true";
	} catch {
		return import.meta.env.VITE_PERF_ENABLED === "true";
	}
}

function createEmptyTrack(id: string): RenderTrackSummary {
	return {
		id,
		commits: 0,
		totalDuration: 0,
		averageDuration: 0,
		maxDuration: 0,
		slowCommits: 0,
		lastCommitTime: 0,
		lastDuration: 0,
		recent: [],
	};
}

function getTrack(id: string) {
	const existing = tracks.get(id);
	if (existing) return existing;
	const created = createEmptyTrack(id);
	tracks.set(id, created);
	return created;
}

function snapshot(): RenderProfileSnapshot {
	return {
		enabled: isRenderProfilingEnabled(),
		capturedAt: new Date().toISOString(),
		thresholdMs: SLOW_COMMIT_THRESHOLD_MS,
		tracks: Object.fromEntries(
			[...tracks.entries()].map(([id, track]) => [
				id,
				{
					...track,
					totalDuration: round(track.totalDuration),
					averageDuration: round(track.averageDuration),
					maxDuration: round(track.maxDuration),
					lastDuration: round(track.lastDuration),
					recent: track.recent.map((sample) => ({
						...sample,
						actualDuration: round(sample.actualDuration),
						baseDuration: sample.baseDuration === undefined ? undefined : round(sample.baseDuration),
						startTime: sample.startTime === undefined ? undefined : round(sample.startTime),
						commitTime: round(sample.commitTime),
						timeSincePreviousCommit:
							sample.timeSincePreviousCommit === undefined ? undefined : round(sample.timeSincePreviousCommit),
					})),
				},
			]),
		),
	};
}

function reset() {
	tracks.clear();
}

if (typeof window !== "undefined") {
	window.__terminal_render_profile = snapshot;
	window.__terminal_render_profile_reset = reset;
}

function round(value: number) {
	return Math.round(value * 100) / 100;
}

function recordSample(sample: RenderSample) {
	const track = getTrack(sample.id);
	track.commits += 1;
	track.totalDuration += sample.actualDuration;
	track.averageDuration = track.totalDuration / track.commits;
	track.maxDuration = Math.max(track.maxDuration, sample.actualDuration);
	track.lastDuration = sample.actualDuration;
	track.lastCommitTime = sample.commitTime;
	if (sample.actualDuration > SLOW_COMMIT_THRESHOLD_MS) track.slowCommits += 1;
	track.recent.push(sample);
	if (track.recent.length > MAX_RECENT_SAMPLES) track.recent.shift();
}

const handleRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
	recordSample({
		id,
		phase,
		actualDuration,
		baseDuration,
		startTime,
		commitTime,
		source: "profiler",
	});
};

function CommitProbe({ id }: { id: string }) {
	const renderStartedAt = useRef(canUseBrowserApis() ? performance.now() : 0);

	useLayoutEffect(() => {
		if (!isRenderProfilingEnabled() || !canUseBrowserApis()) return;
		const commitTime = performance.now();
		recordSample({
			id,
			phase: "commit",
			actualDuration: commitTime - renderStartedAt.current,
			commitTime,
			source: "commit-probe",
		});
		renderStartedAt.current = performance.now();
	});

	return null;
}

export function RenderTrack({ id, children }: { id: string; children: ReactNode }) {
	if (!isRenderProfilingEnabled()) return <>{children}</>;

	return (
		<Profiler id={id} onRender={handleRender}>
			<CommitProbe id={`${id}:commit`} />
			{children}
		</Profiler>
	);
}

export function useRenderCommitTrack(id: string) {
	useLayoutEffect(() => {
		if (!isRenderProfilingEnabled() || !canUseBrowserApis()) return;
		const commitTime = performance.now();
		const previousCommitTime = tracks.get(id)?.lastCommitTime;
		recordSample({
			id,
			phase: "commit",
			actualDuration: 0,
			commitTime,
			timeSincePreviousCommit:
				previousCommitTime === undefined || previousCommitTime === 0 ? undefined : commitTime - previousCommitTime,
			source: "commit-probe",
		});
	});
}
