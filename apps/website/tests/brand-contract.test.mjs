import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEBSITE_STYLES = readFileSync(resolve(WEBSITE_ROOT, "src/styles/global.css"), "utf8");
const WEBSITE_HERO = readFileSync(resolve(WEBSITE_ROOT, "src/components/Hero.astro"), "utf8");
const WEBSITE_MARKETS = readFileSync(resolve(WEBSITE_ROOT, "src/components/Markets.astro"), "utf8");
const BRAND = JSON.parse(readFileSync(resolve(WEBSITE_ROOT, "../../brand/brand.json"), "utf8"));
const MARKETING_COMPONENTS = ["Hero", "Markets", "Faq", "Trust", "AccountExecution", "Features"].map((name) => ({
	name,
	source: readFileSync(resolve(WEBSITE_ROOT, `src/components/${name}.astro`), "utf8"),
}));

// The light theme is the default (:root); the dark theme is the ?theme=dark comparison and every product window
// (.surface-dark). Both blocks carry the same roles from brand/brand.json.
const LIGHT = ":root";
const DARK = ':root[data-theme="dark"]';
const THEMES = [
	[LIGHT, "light"],
	[DARK, "dark"],
];
const WEBSITE_FEATURES = readFileSync(resolve(WEBSITE_ROOT, "src/components/Features.astro"), "utf8");
const WEBSITE_LOGO = readFileSync(resolve(WEBSITE_ROOT, "src/components/Logo.astro"), "utf8");
const BRAND_TOKENS = JSON.parse(readFileSync(resolve(WEBSITE_ROOT, "../../brand/tokens/sairn.tokens.json"), "utf8"));
// Text roles and the surfaces they sit on in each theme; every pair must be WCAG AA (4.5:1).
const TEXT_ROLES = ["--text-strong", "--text-weak", "--text-muted", "--text-faint", "--signal", "--marketing-accent", "--text-success", "--text-error"];
const SURFACES = {
	light: ["--bg-base", "--bg-raised", "--bg-panel", "--bg-overlay", "--bg-band", "--bg-sunken", "--bg-alternate"],
	dark: ["--bg-base", "--bg-raised", "--bg-panel", "--bg-overlay", "--bg-band", "--bg-window"],
};

test("website uses the brand action, signal and focus roles in both themes", () => {
	for (const [selector, theme] of THEMES) {
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--action"), BRAND.colors[theme].action);
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--on-action"), BRAND.colors[theme].onAction);
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--signal"), BRAND.colors[theme].signal);
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--focus"), "var(--signal)");
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--live"), "var(--signal)");
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--text-brand"), "var(--signal)");
	}
	assert.match(cssRule(WEBSITE_STYLES, "::selection"), /background:\s*var\(--signal\)/);
	// Filled buttons take the neutral action role (the shared pill in tests/button-contract.test.mjs).
	assert.match(cssRule(WEBSITE_STYLES, ".btn-primary"), /background-color:\s*var\(--action\);\s*color:\s*var\(--on-action\);/);
	assert.match(WEBSITE_HERO, /<ButtonLink href=\{startUrl\} variant="primary"/);
});

// ADR 0043: marketing emphasis uses the website-only amber accent (the logo's choice colour); --signal is kept
// for focus, selection, links, the live indicator and the logo, and never marks marketing emphasis.
test("website marketing emphasis uses the marketing accent, never the signal (ADR 0043)", () => {
	for (const [selector, theme] of THEMES) {
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--marketing-accent"), BRAND.websiteColors[theme].marketingAccent);
	}
	assert.match(WEBSITE_STYLES, /--color-marketing-accent:\s*var\(--marketing-accent\);/);
	assert.match(WEBSITE_HERO, /class="reel text-marketing-accent"/, "the hero reel");
	assert.match(WEBSITE_MARKETS, /<span class="text-marketing-accent">one account<\/span>/, "the markets heading");
	for (const { name, source } of MARKETING_COMPONENTS) {
		assert.doesNotMatch(source, /text-signal|var\(--signal\)/, `${name}.astro must not use the signal for marketing emphasis`);
	}
	assert.match(cssRule(WEBSITE_STYLES, '.feature-tab[aria-selected="true"] .feature-tab-icon'), /color:\s*var\(--marketing-accent\)/);
	for (const selector of ['.feature-tab[aria-selected="true"] .feature-tab-icon', '[role="tab"][aria-selected="true"]']) {
		const before = WEBSITE_STYLES.slice(0, WEBSITE_STYLES.indexOf(`${selector} {`));
		const depth = (before.match(/{/g) ?? []).length - (before.match(/}/g) ?? []).length;
		assert.equal(depth, 0, `${selector} must stay outside @layer, or the tab's text utilities override the selected colour`);
	}
	const ambient = cssRule(WEBSITE_STYLES, ".hero-ambient");
	assert.match(ambient, /var\(--glow-accent\)/);
	assert.match(ambient, /var\(--glow-accent-faint\)/);
	// The glows are tints of the accent itself (color-mix with transparent), never a second copy of its channels.
	// The darker light-theme amber is mixed at lower strengths, so the wash on paper stays clean.
	for (const [selector, strong, faint, neutral] of [
		[LIGHT, 7, 3, "color-mix(in oklab, var(--bg-raised) 90%, transparent)"],
		[DARK, 10, 5, "color-mix(in oklab, var(--action) 7%, transparent)"],
	]) {
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--glow-accent"), `color-mix(in oklab, var(--marketing-accent) ${strong}%, transparent)`);
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--glow-accent-faint"), `color-mix(in oklab, var(--marketing-accent) ${faint}%, transparent)`);
		assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--glow-neutral"), neutral);
	}
	assert.doesNotMatch(WEBSITE_STYLES, /rgb\(230 183 102\b|rgb\(153 98 31\b/, "no hard-coded copy of the accent's channels");
	const flow = WEBSITE_STYLES.slice(WEBSITE_STYLES.indexOf("/* Fig. 1 connectors"), WEBSITE_STYLES.indexOf("/* Motion."));
	assert.equal((flow.match(/var\(--marketing-accent\)/g) ?? []).length, 3, "both connector lines and the arrow head");
	assert.doesNotMatch(flow, /var\(--signal\)/);
});

test("the website shows no warning colour while the amber accent marks marketing emphasis (ADR 0043)", () => {
	// --text-warning is close to the accent in both themes (dark ΔE76 6.5): a warning would read as emphasis. A website
	// warning needs its own design decision first.
	const offenders = listSourceFiles(resolve(WEBSITE_ROOT, "src"))
		.filter((file) => !file.endsWith("styles/global.css"))
		.filter((file) => /\b(?:text|bg|border|fill|stroke)-warning\b|var\(--text-warning\)/.test(readFileSync(file, "utf8")));
	assert.deepEqual(offenders, []);
	const styleUses = WEBSITE_STYLES.match(/var\(--text-warning\)/g) ?? [];
	assert.equal(styleUses.length, 1, "global.css only maps the --color-warning theme token");
});

test("the marketing accent stays readable and away from Hyperliquid's brand colours in both themes (ADR 0043)", () => {
	for (const [selector, theme] of THEMES) {
		const accent = readCssVariable(WEBSITE_STYLES, selector, "--marketing-accent");
		for (const surfaceVariable of SURFACES[theme]) {
			const surface = readCssVariable(WEBSITE_STYLES, selector, surfaceVariable);
			const ratio = contrastRatio(parseHex(accent).slice(0, 3), surface);
			assert.ok(ratio >= 4.5, `${theme}: the marketing accent on ${surfaceVariable} (${surface}) is ${ratio.toFixed(2)}:1`);
		}
		for (const color of HYPERLIQUID_COLORS) {
			const distance = deltaE76(toLab(parseHex(accent).slice(0, 3)), toLab(parseHex(color).slice(0, 3)));
			assert.ok(distance >= MIN_DELTA_E, `${theme}: the marketing accent is ΔE76 ${distance.toFixed(1)} from ${color}`);
		}
	}
});

test("website does not restore legacy blue gradients or glow treatments", () => {
	const sources = `${WEBSITE_STYLES}\n${WEBSITE_HERO}\n${WEBSITE_MARKETS}`.toLowerCase();
	for (const legacyTreatment of ["#26d2ec", "#46f0de", "#2e86f5", "glow-radial", "text-brand-gradient"]) {
		assert.equal(sources.includes(legacyTreatment), false, `found legacy treatment: ${legacyTreatment}`);
	}
});

test("the light theme is the logo kit's paper and ink; product windows stay in the terminal's dark window colour", () => {
	const paper = BRAND_TOKENS.color.primitive;
	assert.equal(readCssVariable(WEBSITE_STYLES, LIGHT, "--bg-base"), paper["paper-50"].toLowerCase());
	assert.equal(readCssVariable(WEBSITE_STYLES, LIGHT, "--bg-band"), paper["paper-100"].toLowerCase());
	assert.equal(readCssVariable(WEBSITE_STYLES, LIGHT, "--bg-sunken"), paper["paper-200"].toLowerCase());
	assert.equal(readCssVariable(WEBSITE_STYLES, LIGHT, "--bg-raised"), paper.white.toLowerCase());
	assert.equal(readCssVariable(WEBSITE_STYLES, LIGHT, "--text-strong"), BRAND.logo.light.wordmark);
	assert.equal(readCssVariable(WEBSITE_STYLES, LIGHT, "--text-success"), "#067a57", "the terminal's light --market-up");
	assert.equal(readCssVariable(WEBSITE_STYLES, LIGHT, "--text-error"), "#c73a3a", "the terminal's light --market-down");
	for (const selector of [LIGHT, DARK]) assert.equal(readCssVariable(WEBSITE_STYLES, selector, "--bg-window"), "#0f1a1f");
	// The dark block is the previous dark-only palette, kept for comparison: graphite canvas, window, raised overlay.
	assert.equal(readCssVariable(WEBSITE_STYLES, DARK, "--bg-base"), "#12131a");
	assert.equal(readCssVariable(WEBSITE_STYLES, DARK, "--bg-overlay"), "#212d33");
	assert.match(WEBSITE_STYLES, /\.surface-dark,\s*:root\[data-theme="dark"\] \{/, "product windows take the dark token block");
	assert.match(WEBSITE_HERO, /class="surface-dark edge [^"]*" data-tabs data-preview>/, "the hero preview (screenshot and Open Book) is a dark window");
	assert.match(WEBSITE_HERO, /bg-window/, "the hero screenshot sits in the terminal's window colour");
	assert.match(WEBSITE_FEATURES, /surface-dark edge relative isolate aspect-\[16\/10\][^`]*bg-window/, "every feature screenshot is a dark window");
});

test("every text role is WCAG AA on every surface of its theme", () => {
	for (const [selector, theme] of THEMES) {
		for (const role of TEXT_ROLES) {
			const foreground = readCssVariable(WEBSITE_STYLES, selector, role);
			for (const surfaceVariable of SURFACES[theme]) {
				const surface = readCssVariable(WEBSITE_STYLES, selector, surfaceVariable);
				const ratio = contrastRatio(compositeHex(foreground, surface), surface);
				assert.ok(ratio >= 4.5, `${theme}: ${role} (${foreground}) on ${surfaceVariable} (${surface}) is ${ratio.toFixed(2)}:1`);
			}
		}
	}
});

// Plan §6 anti-impersonation rule: every site colour token stays at least ΔE76 15 away from Hyperliquid's
// brand colours. Near-black neutrals (L* ≤ 25 and chroma ≤ 10 after compositing over the theme's --bg-base) are
// exempt, as the plan allows. A pending exception waits for an operator decision and must still be below the limit,
// so a fixed or renamed token fails until it is removed from the list.
const HYPERLIQUID_COLORS = ["#97fce3", "#03211c", "#23524c"];
const MIN_DELTA_E = 15;
const PENDING_DELTA_E_EXCEPTIONS = {
	light: {
		"--signal": "brand.json light accent #176b64 (ADR 0028), shared with the terminal; ΔE 12.1 from #23524c. Used only for focus, selection, prose links and the live indicator",
		"--signal-hover": "hover step of the same brand accent #0f524d; ΔE 3.9 from #23524c",
		"--text-strong": "the logo's wordmark ink #08262e (brand.json logo.light.wordmark), the heading colour the operator chose for the light site; ΔE 10.4 from #03211c, which Hyperliquid uses as a dark canvas, never as text on paper",
	},
	dark: {
		"--signal": "brand.json accent (ADR 0028), shared with the terminal; ΔE 8.5 from #97fce3. Since ADR 0043 the website uses it only for focus, selection, prose links, the live indicator and the logo, never for marketing emphasis; changing the shared value is a brand decision",
		"--signal-hover": "hover step of the same brand accent; ΔE 11.7 from #97fce3",
	},
};

test("website colour tokens keep their distance from Hyperliquid's brand colours in both themes (plan §6)", () => {
	for (const [selector, theme] of THEMES) {
		const base = parseHex(readCssVariable(WEBSITE_STYLES, selector, "--bg-base"));
		const tokens = readColorTokens(WEBSITE_STYLES, selector);
		assert.ok(tokens.length >= 25, `expected the site's ${theme} colour tokens, found ${tokens.length}`);
		const tooClose = [];
		for (const { name, channels } of tokens) {
			const composited = channels.slice(0, 3).map((channel, index) => channel * channels[3] + base[index] * (1 - channels[3]));
			const lab = toLab(composited);
			if (lab[0] <= 25 && Math.hypot(lab[1], lab[2]) <= 10) continue;
			const nearest = Math.min(...HYPERLIQUID_COLORS.map((color) => deltaE76(lab, toLab(parseHex(color).slice(0, 3)))));
			if (nearest < MIN_DELTA_E) tooClose.push(name);
		}
		assert.deepEqual(tooClose.sort(), Object.keys(PENDING_DELTA_E_EXCEPTIONS[theme]).sort(), `${theme} theme`);
	}
	assert.ok(deltaE76(toLab([0x86, 0xe5, 0xd3]), toLab([0x97, 0xfc, 0xe3])) < MIN_DELTA_E, "the check measures what the plan means");
});

test("website renders the logo kit's lockup and mark for each theme from brand/ instead of public copies", () => {
	const base = readFileSync(resolve(WEBSITE_ROOT, "src/layouts/Base.astro"), "utf8");
	const seo = readFileSync(resolve(WEBSITE_ROOT, "src/config/seo.ts"), "utf8");

	for (const background of ["light", "dark"]) {
		assert.match(WEBSITE_LOGO, new RegExp(`from "\\.\\./\\.\\./\\.\\./\\.\\./brand/svg/lockup/sairn-lockup-on-${background}\\.svg\\?url"`));
		assert.match(WEBSITE_LOGO, new RegExp(`from "\\.\\./\\.\\./\\.\\./\\.\\./brand/svg/mark/sairn-mark-on-${background}\\.svg\\?url"`));
	}
	assert.match(WEBSITE_LOGO, /\{ theme: "light", src: withWordmark \? lockupOnLightUrl : markOnLightUrl \}/);
	assert.match(WEBSITE_LOGO, /\{ theme: "dark", src: withWordmark \? lockupOnDarkUrl : markOnDarkUrl \}/);
	assert.match(
		WEBSITE_STYLES,
		/:root:not\(\[data-theme="dark"\]\) \[data-logo-theme="dark"\],\s*:root\[data-theme="dark"\] \[data-logo-theme="light"\] \{\s*display: none;/,
		"only the artwork for the active theme is shown",
	);
	assert.match(base, /from "\.\.\/\.\.\/\.\.\/\.\.\/brand\/web\/favicon\.svg\?url"/);
	assert.match(seo, /from "\.\.\/\.\.\/\.\.\/\.\.\/brand\/social\/sairn-avatar-light-1024\.png\?url"/);
	for (const retired of ["logo.svg", "logo-mark.svg", "gatu-logo-1024.png", "favicon.svg"]) {
		assert.equal(existsSync(resolve(WEBSITE_ROOT, "public", retired)), false, `public/${retired} must not shadow the brand source`);
	}
});

test("website ships its declared large social card", () => {
	const image = readFileSync(resolve(WEBSITE_ROOT, "public/og-website-1200x630.png"));
	assert.equal(image.toString("ascii", 12, 16), "IHDR");
	assert.equal(image.readUInt32BE(16), 1200);
	assert.equal(image.readUInt32BE(20), 630);
});

function readCssVariable(source, selector, variable) {
	const selectorStart = source.indexOf(`${selector} {`);
	assert.notEqual(selectorStart, -1, `missing selector: ${selector}`);

	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	assert.notEqual(blockStart, -1, `missing block start: ${selector}`);
	assert.notEqual(blockEnd, -1, `missing block end: ${selector}`);

	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	assert.ok(declaration?.[1], `missing variable: ${selector} ${variable}`);
	return declaration[1].trim();
}

function listSourceFiles(directory) {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(?:astro|ts|js|mjs|css|md)$/.test(entry.name))
		.map((entry) => resolve(entry.parentPath ?? entry.path, entry.name));
}

function cssRule(source, selector) {
	const start = source.indexOf(`${selector} {`);
	assert.notEqual(start, -1, `missing rule: ${selector}`);
	return source.slice(start, source.indexOf("}", start));
}

function readColorTokens(source, selector) {
	const start = source.indexOf(`${selector} {`);
	assert.notEqual(start, -1, `missing selector: ${selector}`);
	const block = source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
	const tokens = [];
	const declared = new Map([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]));
	for (const [name, value] of declared) {
		if (value.startsWith("var(")) continue;
		const rgb = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(value);
		// A tint of another token: mixing with transparent keeps the source's channels at the given alpha.
		const mix = /^color-mix\(in oklab, var\((--[\w-]+)\) (\d+)%, transparent\)$/.exec(value);
		if (mix) {
			const source = declared.get(mix[1]);
			assert.ok(source && /^#[0-9a-f]{6}$/i.test(source), `${name} mixes ${mix[1]}, which must be an opaque hex token`);
			tokens.push({ name, channels: [...parseHex(source).slice(0, 3), Number(mix[2]) / 100] });
		} else if (rgb) tokens.push({ name, channels: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4]) / 100] });
		else if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) tokens.push({ name, channels: parseHex(value) });
		else assert.fail(`${name}: ${value} is a colour form the distance check cannot read`);
	}
	return tokens;
}

function toLab(channels) {
	const [red, green, blue] = channels.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
	const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
	const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
	const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
	return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE76(a, b) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function compositeHex(foreground, background) {
	const foregroundChannels = parseHex(foreground);
	const backgroundChannels = parseHex(background);
	const alpha = foregroundChannels[3];
	return foregroundChannels.slice(0, 3).map((channel, index) =>
		Math.round(channel * alpha + backgroundChannels[index] * (1 - alpha)),
	);
}

function contrastRatio(foreground, background) {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(parseHex(background).slice(0, 3));
	return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function parseHex(hex) {
	assert.match(hex, /^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
	const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
	return [...channels, hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1];
}

function relativeLuminance(channels) {
	const [red, green, blue] = channels.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
