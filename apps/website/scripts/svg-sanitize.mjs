// Sanitizes a downloaded market icon before it is committed (scripts/market-icons.mjs) and checks committed icons
// (tests/market-icons.test.mjs). The icons are drawn through <img>, where an SVG can run no script and load nothing,
// but a committed file must stay safe wherever it is opened: an allowlist of drawing elements, no event handlers,
// references only to fragments of the same file or to an embedded raster, no stylesheet that imports or fetches.
// Editor metadata, comments, titles and whitespace between tags are dropped; paths and numbers are left as drawn.

import { JSDOM } from "jsdom";

export const MAX_SOURCE_BYTES = 256 * 1024;

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** Drawing elements a committed icon may contain. */
export const ALLOWED_ELEMENTS = new Set([
	"svg",
	"g",
	"defs",
	"symbol",
	"use",
	"path",
	"rect",
	"circle",
	"ellipse",
	"line",
	"polyline",
	"polygon",
	"linearGradient",
	"radialGradient",
	"stop",
	"clipPath",
	"mask",
	"pattern",
	"filter",
	"feGaussianBlur",
	"feOffset",
	"feFlood",
	"feComposite",
	"feBlend",
	"feColorMatrix",
	"feMerge",
	"feMergeNode",
	"image",
	"style",
]);

/** Removed without comment: text for people and editors, never drawn. */
const METADATA_ELEMENTS = new Set(["title", "desc", "metadata"]);

/** Removed and reported: anything that can run code, embed a document or animate a reference. */
const DANGEROUS_ELEMENTS = new Set(["script", "foreignObject", "iframe", "embed", "object", "a", "animate", "set", "animateTransform", "animateMotion", "handler", "listener"]);

const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/;
const FRAGMENT = /^#[A-Za-z0-9_.:-]+$/;
const URL_REFERENCE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

function isSafeHref(element, value) {
	if (FRAGMENT.test(value)) return true;
	return element.localName === "image" && RASTER_DATA_URL.test(value);
}

/** Problems with CSS text in a <style> element or a style/presentation attribute; empty when it only uses fragments. */
function cssProblems(text) {
	const problems = [];
	if (/@import/i.test(text)) problems.push("@import");
	if (/javascript:|expression\s*\(|behavior\s*:|-moz-binding/i.test(text)) problems.push("script in CSS");
	for (const [, , target] of text.matchAll(URL_REFERENCE)) {
		if (!FRAGMENT.test(target.trim())) problems.push(`url(${target.trim().slice(0, 40)})`);
	}
	return problems;
}

function parse(source) {
	if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) throw new Error(`larger than ${MAX_SOURCE_BYTES} bytes`);
	let dom;
	try {
		dom = new JSDOM(source, { contentType: "image/svg+xml" });
	} catch (error) {
		throw new Error(`not well-formed XML (${error instanceof Error ? error.message.split("\n")[0] : error})`);
	}
	const root = dom.window.document.documentElement;
	if (!root || root.namespaceURI !== SVG_NS || root.localName !== "svg") throw new Error("the root element is not <svg>");
	return { dom, root };
}

function elementsOf(root) {
	return [root, ...root.querySelectorAll("*")];
}

/**
 * Problems that make a file unsafe or outside the allowlist; empty for a committed icon. Checks the file as it is,
 * without cleaning it, so the test reads exactly what is served.
 */
export function findSvgProblems(source) {
	let parsed;
	try {
		parsed = parse(source);
	} catch (error) {
		return [error.message];
	}
	const problems = [];
	if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) problems.push("doctype, entity or stylesheet instruction");
	if (!parsed.root.hasAttribute("viewBox")) problems.push("no viewBox");
	for (const element of elementsOf(parsed.root)) {
		const name = element.localName;
		if (element.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(name)) {
			problems.push(`element <${element.tagName}>`);
			continue;
		}
		if (name === "style") problems.push(...cssProblems(element.textContent ?? "").map((problem) => `<style> ${problem}`));
		for (const attribute of element.attributes) {
			const label = `<${name} ${attribute.name}>`;
			if (/^on/i.test(attribute.localName)) problems.push(`${label} event handler`);
			else if (attribute.localName === "href") {
				if (!isSafeHref(element, attribute.value.trim())) problems.push(`${label} ${attribute.value.slice(0, 40)}`);
			} else if (attribute.namespaceURI && ![XLINK_NS, XML_NS, XMLNS_NS].includes(attribute.namespaceURI)) {
				problems.push(`${label} foreign namespace`);
			}
			if (attribute.localName !== "href") problems.push(...cssProblems(attribute.value).map((problem) => `${label} ${problem}`));
		}
	}
	return problems;
}

function addViewBox(root) {
	if (root.hasAttribute("viewBox")) return;
	const width = root.getAttribute("width") ?? "";
	const height = root.getAttribute("height") ?? "";
	const size = /^(\d+(?:\.\d+)?)(?:px)?$/;
	if (!size.test(width) || !size.test(height)) throw new Error("no viewBox and no pixel width and height to derive one");
	root.setAttribute("viewBox", `0 0 ${width.match(size)[1]} ${height.match(size)[1]}`);
}

function removeNonElements(node, document) {
	for (const child of [...node.childNodes]) {
		if (child.nodeType === document.ELEMENT_NODE) {
			if (child.localName !== "style") removeNonElements(child, document);
			continue;
		}
		const keepStyleText = node.localName === "style" && (child.nodeType === document.TEXT_NODE || child.nodeType === document.CDATA_SECTION_NODE);
		if (!keepStyleText) child.remove();
	}
}

/**
 * Returns `{ svg, removed }`: the cleaned file and what was removed for safety (empty for an ordinary icon).
 * Throws when the source is not an SVG document, contains an element outside the allowlist, or is still unsafe
 * after cleaning; the caller then falls back to the monogram.
 */
export function sanitizeSvg(source) {
	const { dom, root } = parse(source);
	const document = dom.window.document;
	const removed = [];

	for (const element of elementsOf(root).reverse()) {
		if (element === root) continue;
		const name = element.localName;
		if (element.namespaceURI !== SVG_NS) {
			element.remove();
			continue;
		}
		if (METADATA_ELEMENTS.has(name)) element.remove();
		else if (DANGEROUS_ELEMENTS.has(name)) {
			removed.push(`<${name}>`);
			element.remove();
		} else if (!ALLOWED_ELEMENTS.has(name)) throw new Error(`element <${name}> is outside the allowlist`);
	}

	for (const element of elementsOf(root)) {
		for (const attribute of [...element.attributes]) {
			const { localName, namespaceURI, name } = attribute;
			const value = attribute.value.trim();
			if (namespaceURI === XMLNS_NS) {
				if (!["xmlns", "xlink"].includes(localName)) element.removeAttributeNode(attribute);
				continue;
			}
			if (/^on/i.test(localName)) {
				removed.push(`${name} on <${element.localName}>`);
				element.removeAttributeNode(attribute);
			} else if (localName === "href") {
				if (!isSafeHref(element, value)) {
					removed.push(`${name}="${value.slice(0, 40)}" on <${element.localName}>`);
					element.removeAttributeNode(attribute);
				}
			} else if (localName.startsWith("data-") || (localName === "id" && element === root)) {
				element.removeAttributeNode(attribute);
			} else if (namespaceURI && ![XLINK_NS, XML_NS].includes(namespaceURI)) {
				element.removeAttributeNode(attribute);
			}
		}
	}

	removeNonElements(root, document);
	for (const style of root.querySelectorAll("style")) style.textContent = (style.textContent ?? "").trim();
	addViewBox(root);

	const svg = new dom.window.XMLSerializer().serializeToString(root);
	const problems = findSvgProblems(svg);
	if (problems.length > 0) throw new Error(`still unsafe after cleaning: ${problems.join("; ")}`);
	return { svg: `${svg}\n`, removed };
}
