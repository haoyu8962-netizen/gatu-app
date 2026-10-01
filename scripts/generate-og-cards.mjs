import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const TEMPLATE_PATH = resolve(REPOSITORY_ROOT, "designs/og-cards/cards.html");
const FONT_DIRECTORY = resolve(REPOSITORY_ROOT, "designs/og-cards/fonts");
const FONT_SOURCES_PATH = resolve(REPOSITORY_ROOT, "designs/og-cards/font-sources.json");
const OUTPUT_MANIFEST_PATH = resolve(REPOSITORY_ROOT, "designs/og-cards/output-manifest.json");
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WIDTH = 1200;
const HEIGHT = 630;
const DEFAULT_MAX_MEAN_CHANNEL_DELTA = 2;
// The Website card's large display copy accumulates more CoreText/FreeType
// rasterization variance. Keep the independent material-pixel cap as a second
// guard against localized drift.
const WEBSITE_MAX_MEAN_CHANNEL_DELTA = 3.5;
const MAX_CHANGED_PIXEL_RATIO = 0.03;
const MATERIAL_CHANNEL_DELTA = 16;

const CARDS = [
	{
		name: "terminal",
		output: resolve(REPOSITORY_ROOT, "apps/terminal/public/og-terminal-1200x630.png"),
	},
	{
		name: "website",
		output: resolve(REPOSITORY_ROOT, "apps/website/public/og-website-1200x630.png"),
		maxMeanChannelDelta: WEBSITE_MAX_MEAN_CHANNEL_DELTA,
	},
];

const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter((arg) => arg !== "--check" && arg !== "--generate" && arg !== "--help");

if (args.has("--help")) {
	console.log(`Usage: node scripts/generate-og-cards.mjs [--generate | --check]

With --generate (or no flag), renders and atomically updates the two deployed OG card PNGs and manifest.
With --check, renders into a temporary directory and compares without writing.`);
	process.exit(0);
}

if (unknownArgs.length > 0) {
	throw new Error(`Unknown argument${unknownArgs.length === 1 ? "" : "s"}: ${unknownArgs.join(", ")}`);
}

if (args.has("--check") && args.has("--generate")) {
	throw new Error("Choose either --generate or --check, not both.");
}

const checkOnly = args.has("--check");
const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "og-cards-"));

try {
	const fontFileNames = await verifyVendoredFonts();
	const sourceSha256 = await calculateSourceFingerprint(fontFileNames);
	if (checkOnly) await verifyOutputManifest(sourceSha256);

	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({
			offline: true,
			viewport: { width: WIDTH, height: HEIGHT },
		});
		await context.route(/^https?:/, (route) => route.abort("blockedbyclient"));

		const page = await context.newPage();
		const generatedCards = [];
		for (const card of CARDS) {
			const generatedPath = resolve(temporaryDirectory, `${card.name}.png`);
			await renderCard(page, card.name, generatedPath);

			const generated = await readFile(generatedPath);
			const generatedAnalysis = await analyzePng(page, generated);
			assertValidPng(card.name, "generated", generatedAnalysis);

			let deployed;
			try {
				deployed = await readFile(card.output);
			} catch (error) {
				if (checkOnly || error?.code !== "ENOENT") throw error;
			}

			if (deployed) {
				const deployedAnalysis = await analyzePng(page, deployed);
				assertValidPng(card.name, "deployed", deployedAnalysis);

				const difference = await comparePngs(page, deployed, generated);
				assertSafeDifference(card, difference);
				generatedCards.push({ card, deployed, difference, generated, generatedPath });
			} else {
				generatedCards.push({ card, deployed, generated, generatedPath });
			}
		}

		if (!checkOnly) await writeGeneratedOutputs(generatedCards, sourceSha256);
		for (const result of generatedCards) console.log(formatResult(result, checkOnly));

		await context.close();
	} finally {
		await browser.close();
	}
} finally {
	await rm(temporaryDirectory, { force: true, recursive: true });
}

async function verifyVendoredFonts() {
	const fontSources = JSON.parse(await readFile(FONT_SOURCES_PATH, "utf8"));
	const fileNames = Object.keys(fontSources).sort();
	for (const fileName of fileNames) {
		const metadata = fontSources[fileName];
		const font = await readFile(resolve(FONT_DIRECTORY, fileName));
		const actualHash = sha256(font);
		if (actualHash !== metadata.sha256) {
			throw new Error(`Vendored font hash mismatch for ${fileName}: expected ${metadata.sha256}, got ${actualHash}`);
		}
	}
	return fileNames;
}

async function calculateSourceFingerprint(fontFileNames) {
	const sourceFiles = [SCRIPT_PATH, TEMPLATE_PATH, FONT_SOURCES_PATH, ...fontFileNames.map((name) => resolve(FONT_DIRECTORY, name))];
	const hash = createHash("sha256");
	for (const path of sourceFiles) {
		const contents = await readFile(path);
		hash.update(relativePath(path));
		hash.update("\0");
		hash.update(String(contents.length));
		hash.update("\0");
		hash.update(contents);
		hash.update("\0");
	}
	return hash.digest("hex");
}

async function verifyOutputManifest(sourceSha256) {
	let manifest;
	try {
		manifest = JSON.parse(await readFile(OUTPUT_MANIFEST_PATH, "utf8"));
	} catch (error) {
		throw new Error("OG output manifest is missing or invalid. Run the generator with --generate.", { cause: error });
	}

	if (manifest.schemaVersion !== 1 || manifest.sourceSha256 !== sourceSha256) {
		throw new Error(
			`OG source fingerprint is stale: manifest=${manifest.sourceSha256 ?? "missing"}, current=${sourceSha256}. ` +
				"Run the generator with --generate.",
		);
	}

	for (const card of CARDS) {
		const deployed = await readFile(card.output);
		const expected = manifest.outputs?.[card.name];
		const actualHash = sha256(deployed);
		if (expected?.path !== relativePath(card.output) || expected?.sha256 !== actualHash) {
			throw new Error(
				`${card.name} deployed output does not match the manifest: expected=${expected?.sha256 ?? "missing"}, ` +
					`actual=${actualHash}. Run the generator with --generate.`,
			);
		}
	}
}

async function renderCard(page, name, outputPath) {
	const templateUrl = new URL(pathToFileURL(TEMPLATE_PATH));
	templateUrl.searchParams.set("card", name);
	await page.goto(templateUrl.href, { waitUntil: "load" });
	await page.evaluate(async () => {
		await Promise.all([
			document.fonts.load('400 16px "OG Barlow"', "Perpetuals"),
			document.fonts.load('400 16px "OG Barlow Condensed"', "SAIRN.AI"),
			document.fonts.load('600 16px "OG Barlow Condensed"', "Decide"),
			document.fonts.load('400 16px "OG Noto Sans SC"', "永续现货交易终端"),
		]);
		await document.fonts.ready;
	});

	const state = await page.evaluate((cardName) => {
		const card = document.querySelector(`[data-og-card="${cardName}"]`);
		const rectangle = card?.getBoundingClientRect();
		return {
			card: document.documentElement.dataset.card,
			fontsLoaded: [
				document.fonts.check('400 16px "OG Barlow"', "Perpetuals"),
				document.fonts.check('400 16px "OG Barlow Condensed"', "SAIRN.AI"),
				document.fonts.check('600 16px "OG Barlow Condensed"', "Decide"),
				document.fonts.check('400 16px "OG Noto Sans SC"', "永续现货交易终端"),
			].every(Boolean),
			rectangle: rectangle
				? { height: rectangle.height, width: rectangle.width, x: rectangle.x, y: rectangle.y }
				: null,
			remoteResources: performance
				.getEntriesByType("resource")
				.map((entry) => entry.name)
				.filter((url) => url.startsWith("http://") || url.startsWith("https://")),
		};
	}, name);

	if (state.card !== name || !state.fontsLoaded || state.remoteResources.length > 0) {
		throw new Error(`Invalid offline template state for ${name}: ${JSON.stringify(state)}`);
	}
	if (
		!state.rectangle ||
		state.rectangle.x !== 0 ||
		state.rectangle.y !== 0 ||
		state.rectangle.width !== WIDTH ||
		state.rectangle.height !== HEIGHT
	) {
		throw new Error(`Invalid card geometry for ${name}: ${JSON.stringify(state.rectangle)}`);
	}

	await page.screenshot({
		animations: "disabled",
		fullPage: false,
		omitBackground: false,
		path: outputPath,
		type: "png",
	});
}

async function analyzePng(page, png) {
	return page.evaluate(async (source) => {
		const image = new Image();
		image.src = `data:image/png;base64,${source}`;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let nonOpaquePixels = 0;
		for (let index = 3; index < pixels.length; index += 4) {
			if (pixels[index] !== 255) nonOpaquePixels += 1;
		}
		return { height: image.naturalHeight, nonOpaquePixels, width: image.naturalWidth };
	}, png.toString("base64"));
}

async function comparePngs(page, deployed, generated) {
	return page.evaluate(
		async ({ deployedSource, generatedSource, materialDelta }) => {
			async function pixels(source) {
				const image = new Image();
				image.src = `data:image/png;base64,${source}`;
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = image.naturalWidth;
				canvas.height = image.naturalHeight;
				const context = canvas.getContext("2d", { willReadFrequently: true });
				context.drawImage(image, 0, 0);
				return context.getImageData(0, 0, canvas.width, canvas.height).data;
			}

			const deployedPixels = await pixels(deployedSource);
			const generatedPixels = await pixels(generatedSource);
			let absoluteChannelDelta = 0;
			let materiallyChangedPixels = 0;
			let maximumChannelDelta = 0;

			for (let index = 0; index < deployedPixels.length; index += 4) {
				let pixelDelta = 0;
				for (let channel = 0; channel < 3; channel += 1) {
					const delta = Math.abs(deployedPixels[index + channel] - generatedPixels[index + channel]);
					absoluteChannelDelta += delta;
					pixelDelta = Math.max(pixelDelta, delta);
					maximumChannelDelta = Math.max(maximumChannelDelta, delta);
				}
				if (pixelDelta > materialDelta) materiallyChangedPixels += 1;
			}

			const pixelCount = deployedPixels.length / 4;
			return {
				changedPixelRatio: materiallyChangedPixels / pixelCount,
				maximumChannelDelta,
				meanChannelDelta: absoluteChannelDelta / (pixelCount * 3),
			};
		},
		{
			deployedSource: deployed.toString("base64"),
			generatedSource: generated.toString("base64"),
			materialDelta: MATERIAL_CHANNEL_DELTA,
		},
	);
}

function assertValidPng(cardName, kind, analysis) {
	if (analysis.width !== WIDTH || analysis.height !== HEIGHT) {
		throw new Error(`${cardName} ${kind} image is ${analysis.width}×${analysis.height}; expected ${WIDTH}×${HEIGHT}`);
	}
	if (analysis.nonOpaquePixels !== 0) {
		throw new Error(`${cardName} ${kind} image contains ${analysis.nonOpaquePixels} non-opaque pixels`);
	}
}

function assertSafeDifference(card, difference) {
	const maxMeanChannelDelta = card.maxMeanChannelDelta ?? DEFAULT_MAX_MEAN_CHANNEL_DELTA;
	if (
		difference.meanChannelDelta > maxMeanChannelDelta ||
		difference.changedPixelRatio > MAX_CHANGED_PIXEL_RATIO
	) {
		throw new Error(
			`${card.name} render differs materially from the deployed card: ${formatDifference(difference)}. ` +
				"Review the source and output before replacing the deployed image.",
		);
	}
}

async function writeGeneratedOutputs(results, sourceSha256) {
	const stagedOutputs = [];
	const stagedManifest = `${OUTPUT_MANIFEST_PATH}.tmp-${process.pid}`;
	try {
		for (const result of results) {
			if (result.deployed?.equals(result.generated)) continue;
			const stagedOutput = `${result.card.output}.tmp-${process.pid}`;
			await copyFile(result.generatedPath, stagedOutput);
			stagedOutputs.push({ destination: result.card.output, stagedOutput });
		}

		const manifest = {
			schemaVersion: 1,
			sourceSha256,
			dimensions: { height: HEIGHT, width: WIDTH },
			outputs: Object.fromEntries(
				results.map((result) => [
					result.card.name,
					{ path: relativePath(result.card.output), sha256: sha256(result.generated) },
				]),
			),
		};
		await writeFile(stagedManifest, `${JSON.stringify(manifest, null, "\t")}\n`);

		for (const output of stagedOutputs) await rename(output.stagedOutput, output.destination);
		await rename(stagedManifest, OUTPUT_MANIFEST_PATH);
	} finally {
		await Promise.all([
			rm(stagedManifest, { force: true }),
			...stagedOutputs.map((output) => rm(output.stagedOutput, { force: true })),
		]);
	}
}

function formatResult(result, checking) {
	const { card, deployed, difference, generated } = result;
	const action = checking ? "verified" : !deployed ? "created" : deployed.equals(generated) ? "unchanged" : "updated";
	const hashes = `old=${deployed ? sha256(deployed) : "missing"} new=${sha256(generated)}`;
	const comparison = difference ? `; ${formatDifference(difference)}` : "";
	return `${card.name}: ${action} ${relativePath(card.output)}; ${hashes}${comparison}`;
}

function formatDifference(difference) {
	return [
		`mean channel delta=${difference.meanChannelDelta.toFixed(4)}`,
		`material pixel ratio=${(difference.changedPixelRatio * 100).toFixed(3)}%`,
		`max channel delta=${difference.maximumChannelDelta}`,
	].join(", ");
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function relativePath(path) {
	return path.slice(REPOSITORY_ROOT.length + 1);
}
