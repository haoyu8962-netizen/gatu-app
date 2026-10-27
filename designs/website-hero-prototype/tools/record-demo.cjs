// Records the product demo loops from the signed-out Sairn terminal.
// Usage (repository root): node designs/website-hero-prototype/tools/record-demo.cjs [desktop|mobile|all]
// Needs ffmpeg with libx264 and libsvtav1. Every recording runs in a fresh browser context with no
// stored session, which is what makes it signed out. The DOM guard (guard.cjs) checks the recorded
// area in two layers: in the page on every animation frame in which the DOM changed, a hover,
// focus, press, scroll or transition event fired, or an animation ran, and from Node after every
// step and every 400 ms; phone screenshots are kept only
// when a check before and after each passes. Any violation stops the run without writing a video.
// Frames and checks share the browser clock, and only frames before the last passing check are
// encoded. Videos are encoded and verified in a staging folder, then moved into media/ together.
// Before recording, the deployed build-meta.json is read and its build identification (name,
// version, commit, release, build time) is stored with each recording as terminalBuild, or null
// with the reason when it cannot be read. Steps live in demo-scenarios.cjs.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../..");
const { chromium } = require(require.resolve("@playwright/test", { paths: [path.join(root, "apps/terminal")] }));
const { accountTableTop, assertClean, loadGuardConfig, makeGuard, pageGuardSource, readTerminalBuild, recordedClip } = require("./guard.cjs");

const prototypeDir = path.resolve(__dirname, "..");
const outDir = path.join(prototypeDir, "media");
const reportFile = path.join(outDir, "demo-capture.json");
const BASE = "https://app.sairn.ai";
const GUARD_INTERVAL_MS = 400;
const FPS = 30;
const GUARD_CLOCKS = {
	screencast: "checks: performance.timeOrigin + performance.now() in the page; frames: the CDP Page.screencastFrame metadata timestamps, on the same page clock",
	screenshots: "checks: performance.timeOrigin + performance.now() in the page; frames: the midpoint of the Node checks read just before and just after each screenshot, on the same page clock",
};

const SCENARIOS = require("./demo-scenarios.cjs");

// A small ring drawn where a recorded click or tap lands, so viewers can follow the
// demo. The recorder positions it directly (the chart is an iframe, so page mouse events
// cannot drive it). It is a recording aid over the page, not product UI, and carries no
// text, so the DOM guard never reads it.
const POINTER_SCRIPT = `(() => {
	let ring = null;
	const ensure = () => {
		if (ring || !document.documentElement) return ring;
		ring = document.createElement("div");
		ring.id = "demo-pointer";
		ring.setAttribute("aria-hidden", "true");
		ring.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid rgba(237,238,242,0.9);background:rgba(237,238,242,0.14);pointer-events:none;z-index:2147483647;opacity:0;transition:opacity 160ms ease,scale 140ms ease;";
		document.documentElement.appendChild(ring);
		return ring;
	};
	window.__demoPointer = (x, y, state) => {
		const el = ensure();
		if (!el) return;
		el.style.translate = x + "px " + y + "px";
		el.style.opacity = state === "hide" ? "0" : "1";
		el.style.scale = state === "down" ? "0.7" : "1";
	};
})();`;

function helpers(page, scenario) {
	let at = scenario.park ?? { x: scenario.viewport.width / 2, y: scenario.viewport.height - 20 };
	const pointer = (x, y, state) => page.evaluate(([px, py, st]) => window.__demoPointer?.(px, py, st), [x, y, state]);
	const glide = async (x, y) => {
		const from = at;
		const steps = 14;
		for (let i = 1; i <= steps; i += 1) {
			const k = 1 - (1 - i / steps) ** 3;
			const px = from.x + (x - from.x) * k;
			const py = from.y + (y - from.y) * k;
			await page.mouse.move(px, py);
			await pointer(px, py, "move");
			await page.waitForTimeout(12);
		}
		at = { x, y };
	};
	const center = async (locator) => {
		await locator.waitFor({ state: "visible" });
		const box = await locator.boundingBox();
		if (!box) throw new Error("target has no box");
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	};
	return {
		hold: (ms) => page.waitForTimeout(ms),
		async click(locator, holdMs = 0) {
			const c = await center(locator);
			await glide(c.x, c.y);
			await pointer(c.x, c.y, "down");
			await page.mouse.down();
			await page.waitForTimeout(80);
			await page.mouse.up();
			await pointer(c.x, c.y, "move");
			if (holdMs) await page.waitForTimeout(holdMs);
		},
		async tap(locator, holdMs = 0) {
			const c = await center(locator);
			await pointer(c.x, c.y, "down");
			await locator.tap();
			await page.waitForTimeout(140);
			await pointer(c.x, c.y, "hide");
			if (holdMs) await page.waitForTimeout(holdMs);
		},
		async park(holdMs = 0) {
			const target = scenario.park ?? at;
			await glide(target.x, target.y);
			if (holdMs) await page.waitForTimeout(holdMs);
		},
	};
}

function run(command, args) {
	return String(execFileSync(command, args, { env: { ...process.env, SVT_LOG: "1" }, maxBuffer: 64 * 1024 * 1024 }));
}

function ffmpeg(args) {
	run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}

function probe(file) {
	const json = JSON.parse(
		run("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,pix_fmt,color_range,color_space,color_primaries,color_transfer,nb_read_packets:format=duration", "-of", "json", file]),
	);
	return { ...json.streams[0], duration: Number(json.format?.duration) };
}

// The AV1 codec string (av01.P.LLT.DD) from the sequence header the encoder wrote.
function av1Codec(file) {
	const traced = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-c", "copy", "-bsf:v", "trace_headers", "-frames:v", "1", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	if (traced.status !== 0) throw new Error(`${path.basename(file)}: ffmpeg could not trace the AV1 headers\n${traced.stderr}`);
	const field = (name) => {
		const match = new RegExp(`\\s${name.replace(/[[\]]/g, "\\$&")}\\s+[01]+ = (\\d+)`).exec(traced.stderr);
		return match ? Number(match[1]) : null;
	};
	const profile = field("seq_profile");
	const level = field("seq_level_idx[0]");
	if (profile === null || level === null) throw new Error(`${path.basename(file)}: no AV1 sequence header found`);
	const tier = field("seq_tier[0]") ? "H" : "M";
	const depth = field("high_bitdepth") ? (field("twelve_bit") ? 12 : 10) : 8;
	return `av01.${profile}.${String(level).padStart(2, "0")}${tier}.${String(depth).padStart(2, "0")}`;
}

// The page must declare what the files are: main.js lists the AV1 codec string and pixel size of
// each recording, styles.css reserves the same aspect ratio, and the poster element in index.html
// (the <picture> shown before and without JavaScript) gives the poster the same size.
function assertPageDeclares(name, codecs, pixels) {
	const main = fs.readFileSync(path.join(prototypeDir, "main.js"), "utf8");
	const styles = fs.readFileSync(path.join(prototypeDir, "styles.css"), "utf8");
	const html = fs.readFileSync(path.join(prototypeDir, "index.html"), "utf8");
	const entry = new RegExp(`\\b${name}: \\{[^}]*codecs: "([^"]+)"[^}]*width: (\\d+), height: (\\d+)`).exec(main);
	const problems = [];
	if (!entry) problems.push(`main.js has no DEMO_SOURCES entry for ${name}`);
	else {
		if (entry[1] !== codecs) problems.push(`main.js declares codecs "${entry[1]}" for ${name}, the file is "${codecs}"`);
		if (Number(entry[2]) !== pixels.w || Number(entry[3]) !== pixels.h) problems.push(`main.js declares ${entry[2]}×${entry[3]} for ${name}, the file is ${pixels.w}×${pixels.h}`);
	}
	if (!styles.includes(`aspect-ratio: ${pixels.w} / ${pixels.h}`)) problems.push(`styles.css has no "aspect-ratio: ${pixels.w} / ${pixels.h}" for ${name}`);
	const poster = new RegExp(`<(?:source|img)\\b[^>]*\\./media/demo-${name}\\.jpg"[^>]*>`).exec(html)?.[0];
	const size = poster && [/\bwidth="(\d+)"/.exec(poster)?.[1], /\bheight="(\d+)"/.exec(poster)?.[1]].map(Number);
	if (!poster) problems.push(`index.html has no poster <source> or <img> for ./media/demo-${name}.jpg`);
	else if (size[0] !== pixels.w || size[1] !== pixels.h) problems.push(`index.html gives the ${name} poster ${size[0]}×${size[1]}, the file is ${pixels.w}×${pixels.h}`);
	if (problems.length) throw new Error(`${name}: the page would describe the new files wrongly; update it and record again\n${problems.join("\n")}`);
}

function sha256(file) {
	return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Resamples the captured frames onto a constant 30 fps grid (each tick shows the latest frame
// captured by then) and encodes MP4, AV1 WebM and the poster directly from that sequence, in
// TV range with BT.709 tags. Outputs land in stageDir and are verified before anything moves.
function encode(frames, t0, stopAt, scenario, cssHeight, workDir, stageDir) {
	const sources = frames.map((frame, i) => {
		const file = path.join(workDir, `src${String(i).padStart(5, "0")}.jpg`);
		fs.writeFileSync(file, Buffer.from(frame.data, "base64"));
		return file;
	});
	// Screencast frames are not always at device pixels (mobile emulation sends CSS
	// pixels), so the crop is computed from the first frame's real size.
	const [imgW] = run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", sources[0]])
		.trim()
		.split(",")
		.map(Number);
	const even = (v) => Math.floor(v / 2) * 2;
	const pixels = { w: even(imgW), h: even(cssHeight * (imgW / scenario.viewport.width)) };
	const ticks = Math.floor(((stopAt - t0) / 1000) * FPS);
	if (ticks < FPS) throw new Error(`${scenario.name}: only ${ticks} frames before the last passing check`);
	let src = 0;
	for (let k = 0; k < ticks; k += 1) {
		const t = t0 + (k * 1000) / FPS;
		while (src + 1 < frames.length && frames[src + 1].ts <= t) src += 1;
		fs.linkSync(sources[src], path.join(workDir, `seq${String(k).padStart(5, "0")}.jpg`));
	}
	const seq = path.join(workDir, "seq%05d.jpg");
	const crop = `crop=${pixels.w}:${pixels.h}:0:0`;
	const vf = `${crop},scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709`;
	const tags = ["-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];
	const files = {
		mp4: path.join(stageDir, `demo-${scenario.name}.mp4`),
		webm: path.join(stageDir, `demo-${scenario.name}.webm`),
		poster: path.join(stageDir, `demo-${scenario.name}.jpg`),
	};
	ffmpeg(["-framerate", String(FPS), "-i", seq, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "24", ...tags, "-movflags", "+faststart", files.mp4]);
	ffmpeg(["-framerate", String(FPS), "-i", seq, "-vf", vf, "-an", "-c:v", "libsvtav1", "-preset", "5", "-crf", "44", ...tags, files.webm]);
	ffmpeg(["-i", path.join(workDir, "seq00000.jpg"), "-vf", crop, "-frames:v", "1", "-q:v", "3", files.poster]);

	const problems = [];
	for (const [kind, codec] of [
		["mp4", "h264"],
		["webm", "av1"],
	]) {
		const info = probe(files[kind]);
		const expect = { codec_name: codec, width: pixels.w, height: pixels.h, pix_fmt: "yuv420p", color_range: "tv", color_space: "bt709", color_primaries: "bt709", color_transfer: "bt709", nb_read_packets: String(ticks) };
		for (const [key, value] of Object.entries(expect)) if (String(info[key]) !== String(value)) problems.push(`${kind} ${key}: ${info[key]}, expected ${value}`);
		if (Math.abs(info.duration - ticks / FPS) > 1.5 / FPS) problems.push(`${kind} duration ${info.duration}, expected ${(ticks / FPS).toFixed(3)}`);
	}
	const poster = probe(files.poster);
	if (poster.width !== pixels.w || poster.height !== pixels.h) problems.push(`poster ${poster.width}×${poster.height}, expected ${pixels.w}×${pixels.h}`);
	if (problems.length) throw new Error(`${scenario.name}: encoded files failed verification\n${problems.join("\n")}`);
	const codecs = { webm: av1Codec(files.webm), mp4: "h264" };
	return { files, pixels, ticks, codecs };
}

async function record(browser, scenario, config) {
	const context = await browser.newContext({
		viewport: scenario.viewport,
		deviceScaleFactor: scenario.dpr,
		isMobile: scenario.isMobile ?? scenario.mobile,
		hasTouch: scenario.mobile,
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "dark",
	});
	try {
		await context.addInitScript(POINTER_SCRIPT);
		const page = await context.newPage();
		await page.goto(`${BASE}${scenario.route}`, { waitUntil: "domcontentloaded" });
		await scenario.ready(page);
		const h = helpers(page, scenario);
		if (scenario.park) await page.mouse.move(scenario.park.x, scenario.park.y);
		const bottom = await accountTableTop(page);
		if (!bottom) throw new Error(`${scenario.name}: account table not found, crop cannot be placed`);
		const clip = recordedClip(scenario.viewport.width, bottom);
		const start = await assertClean(page, clip, config, `${scenario.name} start`);
		await page.evaluate(pageGuardSource(clip, config));
		await page.waitForFunction(() => window.__sairnGuard?.read().checks > 0);

		const checkTimes = [];
		const unchecked = new Set(start.frames.filter((f) => !f.checked).map((f) => f.src));
		const inflight = new Set();
		let guardError = null;
		let stopping = false;
		const check = (label) => {
			const pending = assertClean(page, clip, config, label).then((result) => {
				if (!stopping) checkTimes.push(result.at);
				for (const frame of result.frames) if (!frame.checked) unchecked.add(frame.src);
				return result;
			});
			inflight.add(pending);
			pending.catch((error) => {
				guardError ??= error;
			});
			pending.finally(() => inflight.delete(pending)).catch(() => {});
			return pending;
		};
		const pollPageGuard = async () => {
			const state = await page.evaluate(() => window.__sairnGuard.read());
			if (state.violations.length) {
				const first = state.violations[0];
				guardError ??= new Error(`${scenario.name}: in-page guard rejected a frame at ${new Date(first.at).toISOString()}\n${first.hits.join("\n")}`);
			}
			return state;
		};

		const frames = [];
		let stopCapture;
		if (scenario.capture === "screenshots") {
			// Headless Chrome's screencast sends CSS pixels, so phone recordings take repeated
			// device-pixel screenshots instead, each kept only when the checks on both sides pass.
			let capturing = true;
			const loop = (async () => {
				let before = await check(`${scenario.name} frame`);
				while (capturing && !guardError) {
					const buf = await page.screenshot({ type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: scenario.viewport.width, height: bottom } });
					const after = await check(`${scenario.name} frame`);
					frames.push({ data: buf.toString("base64"), ts: (before.at + after.at) / 2 });
					before = after;
				}
			})().catch((error) => {
				guardError ??= error;
			});
			stopCapture = async () => {
				capturing = false;
				await loop;
			};
		} else {
			const cdp = await context.newCDPSession(page);
			cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
				if (typeof metadata.timestamp === "number") frames.push({ data, ts: metadata.timestamp * 1000 });
				else guardError ??= new Error(`${scenario.name}: screencast frame without a timestamp`);
				cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
			});
			const width = scenario.viewport.width * scenario.dpr;
			const height = scenario.viewport.height * scenario.dpr;
			await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
			stopCapture = () => cdp.send("Page.stopScreencast").catch(() => {});
		}

		const guardTimer = setInterval(() => {
			check(`${scenario.name} during`).catch(() => {});
			pollPageGuard().catch((error) => {
				guardError ??= error;
			});
		}, GUARD_INTERVAL_MS);
		try {
			for (const [i, step] of scenario.steps.entries()) {
				await step.run(page, h);
				await check(`${scenario.name} step ${i + 1} (${step.label})`);
				if (guardError) throw guardError;
			}
		} finally {
			clearInterval(guardTimer);
			stopping = true;
			await stopCapture();
			while (inflight.size) await Promise.allSettled([...inflight]);
		}
		if (guardError) throw guardError;
		const final = await assertClean(page, clip, config, `${scenario.name} after stop`);
		// Let the in-page guard tick after the last Node check before reading it; without a
		// frame in between, its last tick can trail that check by a few milliseconds.
		await page.evaluate(() => Promise.race([new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise((resolve) => setTimeout(resolve, 1000))]));
		const pageGuard = await pollPageGuard();
		await page.evaluate(() => window.__sairnGuard.stop());
		if (guardError) throw guardError;

		frames.sort((a, b) => a.ts - b.ts);
		if (frames.length < 10) throw new Error(`${scenario.name}: only ${frames.length} frames captured`);
		const t0 = frames[0].ts;
		const stopAt = Math.max(...checkTimes);
		if (start.at > t0 || pageGuard.firstAt > t0) throw new Error(`${scenario.name}: the first frame precedes the first check`);
		if (pageGuard.lastFrameAt < stopAt) throw new Error(`${scenario.name}: the in-page guard stopped before the last passing check`);
		if (stopAt <= t0) throw new Error(`${scenario.name}: no passing check after the first frame`);
		const used = frames.filter((frame) => frame.ts < stopAt);
		const rel = (at) => Math.round(at - t0);
		return {
			frames: used,
			t0,
			stopAt,
			clip,
			report: {
				name: scenario.name,
				route: scenario.route,
				viewport: scenario.viewport,
				dpr: scenario.dpr,
				recordedArea: { cssWidth: scenario.viewport.width, cssHeight: bottom },
				capture: scenario.capture ?? "screencast",
				startedAt: new Date(t0).toISOString(),
				seconds: Number(((stopAt - t0) / 1000).toFixed(2)),
				framesCaptured: frames.length,
				framesUsed: used.length,
				guard: {
					clock: scenario.capture === "screenshots" ? GUARD_CLOCKS.screenshots : GUARD_CLOCKS.screencast,
					nodeChecks: { count: checkTimes.length, firstMs: rel(Math.min(...checkTimes)), lastMs: rel(stopAt), offsetsMs: checkTimes.map(rel).sort((a, b) => a - b) },
					pageChecks: { count: pageGuard.checks, animationFrames: pageGuard.frames, firstMs: rel(pageGuard.firstAt), lastMs: rel(pageGuard.lastAt), maxCheckMs: Number(pageGuard.maxCheckMs.toFixed(1)) },
					startCheckMs: rel(start.at),
					finalCheckMs: rel(final.at),
					entriesAtStart: start.entries,
					uncheckedIframes: [...new Set([...unchecked, ...pageGuard.uncheckedFrames])],
				},
				steps: scenario.steps.map((s) => s.label),
			},
		};
	} finally {
		await context.close();
	}
}

function writeReport(update) {
	const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : {};
	const next = { ...report, ...update, recordings: { ...(report.recordings ?? {}), ...(update.recordings ?? {}) } };
	const tmp = `${reportFile}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(next, null, "\t")}\n`);
	fs.renameSync(tmp, reportFile);
}

async function main() {
	const which = process.argv[2] ?? "all";
	const scenarios = SCENARIOS.filter((s) => which === "all" || s.name === which);
	if (!scenarios.length) throw new Error(`unknown scenario "${which}"`);
	fs.mkdirSync(outDir, { recursive: true });
	const browser = await chromium.launch();
	try {
		const config = await loadGuardConfig(browser);
		const rules = makeGuard(config).rules;
		const build = await readTerminalBuild(browser, BASE);
		if (!build.terminalBuild) console.warn(`terminal build unknown, recording anyway: ${build.terminalBuildError}`);
		for (const scenario of scenarios) {
			const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `sairn-demo-${scenario.name}-`));
			const stageDir = fs.mkdtempSync(path.join(outDir, `.staging-${scenario.name}-`));
			try {
				const take = await record(browser, scenario, config);
				const encoded = encode(take.frames, take.t0, take.stopAt, scenario, take.clip.bottom, workDir, stageDir);
				assertPageDeclares(scenario.name, encoded.codecs.webm, encoded.pixels);
				const files = {};
				for (const [kind, file] of Object.entries(encoded.files)) {
					files[kind] = { file: path.basename(file), bytes: fs.statSync(file).size, sha256: sha256(file) };
				}
				for (const file of Object.values(encoded.files)) fs.renameSync(file, path.join(outDir, path.basename(file)));
				const result = { recordedAt: new Date().toISOString(), ...build, ...take.report, pixels: encoded.pixels, fps: FPS, videoFrames: encoded.ticks, codecs: encoded.codecs, files };
				writeReport({ source: BASE, guard: { checks: "tools/guard.cjs: in the page on every changed animation frame, from Node after every step and every 400 ms, and for screenshot captures before and after every screenshot", dexNames: config.dexNames, perpNames: config.perpNames, rules }, recordings: { [scenario.name]: result } });
				console.log(JSON.stringify({ name: scenario.name, seconds: result.seconds, framesUsed: result.framesUsed, nodeChecks: result.guard.nodeChecks.count, pageChecks: result.guard.pageChecks.count, codecs: result.codecs, bytes: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.bytes])) }));
			} finally {
				fs.rmSync(workDir, { recursive: true, force: true });
				fs.rmSync(stageDir, { recursive: true, force: true });
			}
		}
	} finally {
		await browser.close();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error.message);
		process.exit(1);
	});
}

module.exports = { encode, av1Codec, assertPageDeclares };
