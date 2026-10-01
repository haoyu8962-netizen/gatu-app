import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One module per loading tier, so that a surface only ships the drawings it renders: notifications and the
// trade panel are in the startup closure, the status illustrations only in lazily loaded dialogs.
export const STATUS_GLYPH_OUTPUT = "apps/terminal/src/lib/brand/status-glyph.gen.ts";
export const BUTTON_LOADING_OUTPUT = "apps/terminal/src/lib/brand/button-loading.gen.ts";
export const BRAND_MOTION_OUTPUT = "apps/terminal/src/lib/brand/brand-motion.gen.ts";
export const STATUS_MOTION_CSS_OUTPUT = "apps/terminal/src/lib/brand/status-motion.gen.css";

// Status glyphs and the tone each one paints. Tones are the terminal's semantic roles, not kit colours:
// the kit's pending colour is the attention role, and the kit has no info colour (the supplement draws
// info with neutral). The generator checks that every painted colour equals the kit colour of `kitTone`
// (default: the tone itself). In-flight states never paint the success tone, because a looping indicator in
// the success colour reads as done (.claude/rules/design-tokens.md); `submitting` is drawn by the kit in its
// success colour and rendered neutral here. A glyph comes from brand/loader when the library ships it, otherwise
// from brand/loader-supplement.
const GLYPHS = {
	success: { tone: "success" },
	error: { tone: "error" },
	cancelled: { tone: "neutral" },
	unknown: { tone: "attention" },
	pending: { tone: "attention" },
	wallet: { tone: "attention" },
	submitting: { tone: "neutral", kitTone: "success" },
	partial: { tone: "success" },
	info: { tone: "info" },
	warning: { tone: "attention" },
};
const GLYPH_SOURCES = ["brand/loader", "brand/loader-supplement"];

// Motions the terminal renders. Status illustrations put a badge under the brand mark; button-loading is the
// mono 16px button indicator and copy-feedback the 16px copy confirmation.
const MOTIONS = {
	"wallet-awaiting": { tone: "attention", appearance: "on-light" },
	"awaiting-result": { tone: "attention", appearance: "on-light" },
	submitting: { tone: "neutral", kitTone: "success", appearance: "on-light" },
	success: { tone: "success", appearance: "on-light" },
	error: { tone: "error", appearance: "on-light" },
	unknown: { tone: "attention", appearance: "on-light" },
	cancelled: { tone: "neutral", appearance: "on-light" },
	"copy-feedback": { tone: "success", appearance: "on-light" },
	"button-loading": { tone: null, appearance: "mono" },
};

const TONE_PALETTE_ROLES = { success: "success", error: "error", attention: "pending", neutral: "neutral", info: "neutral" };
const ATTRIBUTE_NAMES = {
	cx: "cx",
	cy: "cy",
	r: "r",
	d: "d",
	x: "x",
	y: "y",
	width: "width",
	height: "height",
	rx: "rx",
	pathLength: "pathLength",
	"stroke-width": "strokeWidth",
	"stroke-linecap": "strokeLinecap",
	"stroke-linejoin": "strokeLinejoin",
};
const SHAPE_TAGS = new Set(["circle", "path", "rect"]);
const MARK_PATH_ATTRIBUTES = new Set(["class", "data-part", "d", "fill"]);
const SHAPE_ATTRIBUTES = new Set([...Object.keys(ATTRIBUTE_NAMES), "class", "fill", "stroke"]);
// Root attributes the components replace (size, accessibility, motion state, theme, the contrast floor) or read
// (viewBox, class). Any other root attribute would change the drawing without ever reaching the terminal.
const ROOT_ATTRIBUTES = new Set([
	"xmlns",
	"width",
	"height",
	"viewBox",
	"class",
	"style",
	"role",
	"focusable",
	"aria-label",
	"aria-valuenow",
	"aria-valuemin",
	"aria-valuemax",
	"data-motion",
	"data-theme",
	"data-paused",
	"data-reduced",
	"color-interpolation",
]);
const ROOT_STYLE = /^--srm-floor:\s*[0-9.]+;?$/;

/** Renders the status motion module and its stylesheet from the exported motion library files. */
export function renderStatusMotion(markGeometry) {
	const tokens = readJson("brand/loader/sairn-motion.tokens.json");
	const palette = tokens.themes["on-light"];
	const darkPalette = tokens.themes["on-dark"];
	const css = new MotionCss();

	const glyphs = {};
	for (const [id, { tone, kitTone }] of Object.entries(GLYPHS)) {
		const source = GLYPH_SOURCES.find((directory) => existsSync(resolve(REPOSITORY_ROOT, directory, "glyphs/on-light", `${id}.svg`)));
		if (!source) throw new Error(`No exported glyph ${id} in ${GLYPH_SOURCES.join(" or ")}`);
		const grids = {};
		let className;
		let motionCss;
		for (const [grid, prefix] of [
			["grid24", ""],
			["grid16", "16/"],
		]) {
			const path = `${source}/glyphs/on-light/${prefix}${id}.svg`;
			const parsed = parseMotionSvg(path);
			const dark = parseMotionSvg(`${source}/glyphs/on-dark/${prefix}${id}.svg`);
			const drawing = toDrawing(parsed, { tone, kitTone, palette, path, markGeometry });
			const darkDrawing = toDrawing(dark, {
				tone,
				kitTone,
				palette: darkPalette,
				path: path.replace("on-light", "on-dark"),
				markGeometry,
			});
			if (JSON.stringify(drawing) !== JSON.stringify(darkDrawing)) {
				throw new Error(`${path} and its on-dark version do not share geometry and paint roles`);
			}
			const motionClass = parsed.classes.find((name) => name.startsWith("srm-g-"));
			if (motionClass !== `srm-g-${id}`) throw new Error(`${path} has class ${parsed.classes.join(" ")}, expected srm-g-${id}`);
			if (motionCss !== undefined && parsed.motionCss !== motionCss) {
				throw new Error(`${path} animates differently from its 24-grid version`);
			}
			className = motionClass;
			motionCss = parsed.motionCss;
			css.add(motionClass, parsed, path);
			grids[grid] = drawing;
		}
		const loop = motionCss.includes("infinite");
		glyphs[id] = { id, tone, className, loop, grid16: grids.grid16, grid24: grids.grid24 };
	}

	const motions = {};
	for (const [id, { tone, kitTone, appearance }] of Object.entries(MOTIONS)) {
		const path = `brand/loader/svg/${appearance}/${id}.svg`;
		const parsed = parseMotionSvg(path);
		const drawing = toDrawing(parsed, { tone, kitTone, palette: tokens.themes[appearance], path, markGeometry });
		if (appearance !== "mono") {
			const darkPath = `brand/loader/svg/on-dark/${id}.svg`;
			const darkDrawing = toDrawing(parseMotionSvg(darkPath), {
				tone,
				kitTone,
				palette: darkPalette,
				path: darkPath,
				markGeometry,
			});
			if (JSON.stringify(drawing) !== JSON.stringify(darkDrawing)) {
				throw new Error(`${path} and ${darkPath} do not share geometry and paint roles`);
			}
		}
		const className = `srm-${id}`;
		if (!parsed.classes.includes(className)) throw new Error(`${path} has class ${parsed.classes.join(" ")}, expected ${className}`);
		css.add(className, parsed, path);
		motions[id] = { id, tone, className, loop: parsed.motionCss.includes("infinite"), drawing };
	}

	const { "button-loading": buttonLoading, ...illustrations } = motions;
	return {
		modules: {
			[STATUS_GLYPH_OUTPUT]: renderGlyphModule(glyphs, motions),
			[BUTTON_LOADING_OUTPUT]: renderMotionModule({ "button-loading": buttonLoading }),
			[BRAND_MOTION_OUTPUT]: renderMotionModule(illustrations),
		},
		css: css.render(),
	};
}

function toDrawing(parsed, { tone, kitTone, palette, path, markGeometry }) {
	const paletteTone = kitTone ?? tone;
	const toneColor = paletteTone ? palette[TONE_PALETTE_ROLES[paletteTone]].toLowerCase() : null;
	const paintOf = (value, attribute) => {
		if (value === undefined) return undefined;
		const color = value.toLowerCase();
		if (color === "none") return "none";
		if (color === "currentcolor") return "current";
		if (toneColor && color === toneColor) return "tone";
		if (color === palette.onBadge.toLowerCase()) return "on";
		throw new Error(`${path} paints ${attribute}="${value}", which is neither its ${paletteTone} kit colour nor the badge colour`);
	};
	const shapes = parsed.shapes.map((shape) => {
		const attributes = {};
		for (const [name, value] of Object.entries(shape.attributes)) {
			if (name === "fill" || name === "stroke" || name === "class") continue;
			const reactName = ATTRIBUTE_NAMES[name];
			if (!reactName) throw new Error(`${path} uses the unsupported attribute ${name} on <${shape.tag}>`);
			attributes[reactName] = value;
		}
		const className = shape.attributes.class?.trim();
		return {
			tag: shape.tag,
			...(className ? { className } : {}),
			...(shape.attributes.fill !== undefined ? { fill: paintOf(shape.attributes.fill, "fill") } : {}),
			...(shape.attributes.stroke !== undefined ? { stroke: paintOf(shape.attributes.stroke, "stroke") } : {}),
			attributes,
		};
	});
	if (parsed.mark) {
		const expected = markGeometry.paths.map((part) => part.d).join("|");
		if (parsed.mark.paths.join("|") !== expected) throw new Error(`${path} no longer draws the brand mark geometry`);
	}
	return { viewBox: parsed.viewBox, ...(parsed.mark ? { markTransform: parsed.mark.transform } : {}), shapes };
}

function parseMotionSvg(path) {
	return parseMotionSvgSource(readFileSync(resolve(REPOSITORY_ROOT, path), "utf8"), path);
}

/** Parses one exported motion SVG; anything the terminal components would not reproduce is an error. */
export function parseMotionSvgSource(source, path) {
	const root = /^<svg\b([^>]*)>/.exec(source);
	if (!root) throw new Error(`${path} does not start with <svg>`);
	const rootAttributes = parseAttributes(root[1], path);
	const unsupportedRoot = Object.keys(rootAttributes).filter((name) => !ROOT_ATTRIBUTES.has(name));
	if (unsupportedRoot.length > 0) throw new Error(`${path} sets unsupported root attributes: ${unsupportedRoot.join(", ")}`);
	if (rootAttributes.style !== undefined && !ROOT_STYLE.test(rootAttributes.style)) {
		throw new Error(`${path} sets a root style the terminal does not reproduce: ${rootAttributes.style}`);
	}
	const style = /<style>(.*?)<\/style>/s.exec(source)?.[1] ?? "";
	const { shared, motionCss } = splitStyle(style, path);
	const body = source.slice(root[0].length).replace(/<title>.*?<\/title>/s, "").replace(/<style>.*?<\/style>/s, "");
	const tagPattern = /<(\/?)([A-Za-z][\w:-]*)\b([^>]*?)(\/?)>/g;
	if (body.replace(tagPattern, "").trim() !== "") throw new Error(`${path} has content outside the supported elements`);

	const shapes = [];
	let mark = null;
	const groups = [];
	for (const token of body.matchAll(tagPattern)) {
		const [, closing, tag, attributeText, selfClosing] = token;
		if (tag === "svg" && closing) break;
		if (tag === "g") {
			if (closing) groups.pop();
			else groups.push(parseGroup(parseAttributes(attributeText, path), groups, path));
			continue;
		}
		if (!SHAPE_TAGS.has(tag) || closing || !selfClosing) throw new Error(`${path} has an unsupported <${closing}${tag}> element`);
		const attributes = parseAttributes(attributeText, path);
		if (groups.length > 0) {
			const markGroup = groups.find((group) => group.class === "srm-mark");
			const transformGroup = groups.find((group) => group.transform);
			if (!markGroup || tag !== "path" || !["signal", "choice"].includes(attributes["data-part"])) {
				throw new Error(`${path} nests a shape outside the brand mark`);
			}
			const extra = Object.keys(attributes).filter((name) => !MARK_PATH_ATTRIBUTES.has(name));
			if (extra.length > 0 || (attributes.class ?? "") !== "") throw new Error(`${path} styles a brand mark path (${extra.join(", ") || "class"})`);
			mark ??= { transform: transformGroup?.transform, paths: [] };
			mark.paths.push(attributes.d);
			continue;
		}
		const unsupported = Object.keys(attributes).filter((name) => !SHAPE_ATTRIBUTES.has(name));
		if (unsupported.length > 0) throw new Error(`${path} uses unsupported attributes on <${tag}>: ${unsupported.join(", ")}`);
		shapes.push({ tag, attributes });
	}
	return {
		viewBox: rootAttributes.viewBox,
		classes: rootAttributes.class.split(/\s+/),
		shared,
		motionCss,
		mark,
		shapes,
	};
}

function parseGroup(attributes, openGroups, path) {
	const names = Object.keys(attributes);
	const isTransform = names.length === 1 && names[0] === "transform" && openGroups.length === 0;
	const isMark = names.length === 1 && names[0] === "class" && attributes.class === "srm-mark" && openGroups.length === 1;
	if (!isTransform && !isMark) throw new Error(`${path} has an unsupported <g ${names.join(" ")}> group`);
	return attributes;
}

function parseAttributes(text, path) {
	const attributes = {};
	const unread = text.replace(/\s*([\w:-]+)="([^"]*)"/g, (_, name, value) => {
		attributes[name] = value;
		return "";
	});
	if (unread.trim() !== "") throw new Error(`${path} has attribute syntax the generator does not read: ${unread.trim()}`);
	return attributes;
}

function splitStyle(style, path) {
	if (!style) return { shared: null, motionCss: "" };
	const marker = "@media (prefers-reduced-motion:reduce){";
	const start = style.indexOf(marker);
	if (start === -1) throw new Error(`${path} has no reduced-motion rule`);
	const end = closingBrace(style, start + marker.length - 1);
	return { shared: style.slice(0, end + 1), motionCss: style.slice(end + 1) };
}

function closingBrace(text, openIndex) {
	let depth = 0;
	for (let index = openIndex; index < text.length; index += 1) {
		if (text[index] === "{") depth += 1;
		else if (text[index] === "}") {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	throw new Error("Unbalanced CSS braces in a motion stylesheet");
}

function topLevelRules(css) {
	const rules = [];
	let index = 0;
	while (index < css.length) {
		const open = css.indexOf("{", index);
		if (open === -1) break;
		const close = closingBrace(css, open);
		rules.push(css.slice(index, close + 1));
		index = close + 1;
	}
	return rules;
}

class MotionCss {
	shared = null;
	byClass = new Map();
	keyframes = new Map();

	add(className, parsed, path) {
		if (!parsed.motionCss) return;
		if (this.shared !== null && parsed.shared !== this.shared) throw new Error(`${path} ships different shared motion rules`);
		this.shared = parsed.shared;
		const previous = this.byClass.get(className);
		if (previous !== undefined && previous !== parsed.motionCss) throw new Error(`${path} redefines the ${className} rules`);
		this.byClass.set(className, parsed.motionCss);
		for (const rule of topLevelRules(parsed.motionCss)) {
			if (!rule.startsWith("@keyframes")) {
				if (!rule.startsWith(`.${className} `)) throw new Error(`${path} has a rule outside .${className}: ${rule}`);
				continue;
			}
			const name = /^@keyframes ([\w-]+)/.exec(rule)[1];
			const known = this.keyframes.get(name);
			if (known !== undefined && known !== rule) throw new Error(`${path} redefines @keyframes ${name}`);
			this.keyframes.set(name, rule);
		}
	}

	render() {
		const motionRules = [...this.byClass.values()].flatMap(topLevelRules).filter((rule) => !rule.startsWith("@keyframes"));
		const animationNames = new Set(motionRules.flatMap((rule) => [...rule.matchAll(/animation:(srm13-[\w-]+)/g)].map((match) => match[1])));
		const shared = topLevelRules(this.shared);
		const keep = [];
		for (const rule of shared) {
			if (rule === ".srm{overflow:visible}" || rule.startsWith(".srm .srm-anim{")) keep.push(rule);
			else if (rule.startsWith("@keyframes")) {
				const name = /^@keyframes ([\w-]+)/.exec(rule)[1];
				if (animationNames.has(name)) keep.push(rule);
			} else if (rule.startsWith("@media (prefers-reduced-motion:reduce)")) {
				if (!rule.includes(".srm .srm-anim{animation:none!important}")) throw new Error("The shared reduced-motion rule changed");
				keep.push("@media (prefers-reduced-motion:reduce){.srm .srm-anim{animation:none!important}}");
			}
		}
		for (const name of animationNames) {
			if (!this.keyframes.has(name) && !keep.some((rule) => rule.startsWith(`@keyframes ${name}{`))) {
				throw new Error(`No @keyframes ${name} in the exported motion files`);
			}
		}
		const lines = [
			"/* Generated by `pnpm brand:sync` from brand/loader and brand/loader-supplement (motion library v1.3). Do not edit by hand. */",
			"/* Colours and the darkest loop frame (--srm-floor) are mapped to terminal tokens in styles.css. */",
			...keep,
			...this.keyframes.values(),
			...motionRules,
			"",
		];
		return lines.join("\n");
	}
}

const GENERATED_HEADER =
	"// Generated by `pnpm brand:sync` from brand/loader and brand/loader-supplement (motion library v1.3). Do not edit by hand.";

function constantName(prefix, id) {
	return `${prefix}_${id.toUpperCase().replaceAll("-", "_")}`;
}

function renderGlyphModule(glyphs, motions) {
	const union = (ids) => ids.map((id) => JSON.stringify(id)).join(" | ");
	const lines = [
		GENERATED_HEADER,
		"",
		'export type StatusTone = "success" | "error" | "attention" | "neutral" | "info";',
		'export type MotionPaint = "tone" | "on" | "none" | "current";',
		"",
		"export interface MotionShape {",
		'\ttag: "circle" | "path" | "rect";',
		"\tclassName?: string;",
		"\tfill?: MotionPaint;",
		"\tstroke?: MotionPaint;",
		"\tattributes: Readonly<Record<string, string>>;",
		"}",
		"",
		"export interface MotionDrawing {",
		"\tviewBox: string;",
		"\tmarkTransform?: string;",
		"\tshapes: readonly MotionShape[];",
		"}",
		"",
		`export type StatusGlyphId = ${union(Object.keys(glyphs))};`,
		"",
		"export interface StatusGlyphDefinition {",
		"\tid: StatusGlyphId;",
		"\ttone: StatusTone;",
		"\tclassName: string;",
		"\tloop: boolean;",
		"\tgrid16: MotionDrawing;",
		"\tgrid24: MotionDrawing;",
		"}",
		"",
		`export type BrandMotionId = ${union(Object.keys(motions))};`,
		"",
		"export interface BrandMotionDefinition {",
		"\tid: BrandMotionId;",
		"\ttone: StatusTone | null;",
		"\tclassName: string;",
		"\tloop: boolean;",
		"\tdrawing: MotionDrawing;",
		"}",
		"",
	];
	for (const glyph of Object.values(glyphs)) {
		lines.push(`export const ${constantName("STATUS_GLYPH", glyph.id)}: StatusGlyphDefinition = ${JSON.stringify(glyph)};`, "");
	}
	return lines.join("\n");
}

function renderMotionModule(motions) {
	const lines = [GENERATED_HEADER, "", 'import type { BrandMotionDefinition } from "./status-glyph.gen";', ""];
	for (const motion of Object.values(motions)) {
		lines.push(`export const ${constantName("BRAND_MOTION", motion.id)}: BrandMotionDefinition = ${JSON.stringify(motion)};`, "");
	}
	return lines.join("\n");
}

function readJson(path) {
	return JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, path), "utf8"));
}
