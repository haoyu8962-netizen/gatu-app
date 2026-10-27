// A small HTML tree builder for the dist tests. Astro emits well-formed markup, so this handles what
// the build produces (void and raw-text elements, quoted attributes, comments) and nothing more; it
// keeps the website free of a parser dependency.

const VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text) {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
		if (body[0] === "#") {
			const code = body[1].toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
			return String.fromCodePoint(code);
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
	});
}

export function parseHtml(source) {
	const root = { type: "element", name: "#document", attrs: {}, children: [], parent: null };
	let current = root;
	let index = 0;

	function append(node) {
		node.parent = current;
		current.children.push(node);
	}

	while (index < source.length) {
		const open = source.indexOf("<", index);
		if (open < 0) {
			append({ type: "text", value: decodeEntities(source.slice(index)) });
			break;
		}
		if (open > index) append({ type: "text", value: decodeEntities(source.slice(index, open)) });

		if (source.startsWith("<!--", open)) {
			const end = source.indexOf("-->", open + 4);
			index = end < 0 ? source.length : end + 3;
			continue;
		}
		if (source[open + 1] === "!" || source[open + 1] === "?") {
			index = source.indexOf(">", open) + 1;
			continue;
		}
		if (source[open + 1] === "/") {
			const end = source.indexOf(">", open);
			const name = source.slice(open + 2, end).trim().toLowerCase();
			let element = current;
			while (element && element.name !== name) element = element.parent;
			if (element?.parent) current = element.parent;
			index = end + 1;
			continue;
		}

		const tag = readStartTag(source, open);
		if (!tag) {
			append({ type: "text", value: "<" });
			index = open + 1;
			continue;
		}
		const element = { type: "element", name: tag.name, attrs: tag.attrs, children: [], parent: null };
		append(element);
		index = tag.end;
		if (RAW_TEXT_ELEMENTS.has(tag.name) && !tag.selfClosing) {
			const close = source.toLowerCase().indexOf(`</${tag.name}`, index);
			const end = close < 0 ? source.length : close;
			const raw = source.slice(index, end);
			element.children.push({
				type: "text",
				value: tag.name === "script" || tag.name === "style" ? raw : decodeEntities(raw),
				parent: element,
			});
			index = close < 0 ? source.length : source.indexOf(">", close) + 1;
			continue;
		}
		if (!VOID_ELEMENTS.has(tag.name) && !tag.selfClosing) current = element;
	}
	return root;
}

function readStartTag(source, open) {
	const nameMatch = /^<([a-zA-Z][\w:-]*)/.exec(source.slice(open, open + 64));
	if (!nameMatch) return null;
	const attrs = {};
	let index = open + nameMatch[0].length;
	while (index < source.length) {
		while (/\s/.test(source[index])) index += 1;
		if (source[index] === ">") return { name: nameMatch[1].toLowerCase(), attrs, end: index + 1, selfClosing: false };
		if (source.startsWith("/>", index)) {
			return { name: nameMatch[1].toLowerCase(), attrs, end: index + 2, selfClosing: true };
		}
		if (source[index] === "/") {
			index += 1;
			continue;
		}
		const start = index;
		while (index < source.length && !/[\s=/>]/.test(source[index])) index += 1;
		const name = source.slice(start, index).toLowerCase();
		while (/\s/.test(source[index])) index += 1;
		if (source[index] !== "=") {
			attrs[name] = "";
			continue;
		}
		index += 1;
		while (/\s/.test(source[index])) index += 1;
		const quote = source[index];
		if (quote === '"' || quote === "'") {
			const end = source.indexOf(quote, index + 1);
			attrs[name] = decodeEntities(source.slice(index + 1, end));
			index = end + 1;
		} else {
			const valueStart = index;
			while (index < source.length && !/[\s>]/.test(source[index])) index += 1;
			attrs[name] = decodeEntities(source.slice(valueStart, index));
		}
	}
	return null;
}

export function walk(node, visit) {
	for (const child of node.children ?? []) {
		visit(child);
		walk(child, visit);
	}
}

export function findAll(node, predicate) {
	const found = [];
	walk(node, (child) => {
		if (child.type === "element" && predicate(child)) found.push(child);
	});
	return found;
}

export function byName(name) {
	return (element) => element.name === name;
}

export function closest(node, predicate) {
	let current = node.parent;
	while (current) {
		if (current.type === "element" && predicate(current)) return current;
		current = current.parent;
	}
	return null;
}

export function hasAttr(name) {
	return (element) => Object.hasOwn(element.attrs, name);
}

export function elementChildren(element) {
	return element.children.filter((child) => child.type === "element");
}

const BLOCK_ELEMENTS = new Set([
	"article",
	"br",
	"details",
	"div",
	"figcaption",
	"figure",
	"footer",
	"h1",
	"h2",
	"h3",
	"h4",
	"header",
	"li",
	"main",
	"nav",
	"ol",
	"p",
	"section",
	"summary",
	"ul",
]);

/** Text a reader sees: script and style bodies are left out, block elements are separated by a space. */
export function textOf(node) {
	if (node.type === "text") return node.value;
	if (node.name === "script" || node.name === "style" || node.name === "template") return "";
	const text = node.children.map(textOf).join("");
	return BLOCK_ELEMENTS.has(node.name) ? ` ${text} ` : text;
}

export function normalizedText(node) {
	return textOf(node).replace(/\s+/g, " ").trim();
}

export function contains(ancestor, node) {
	let current = node;
	while (current) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
}
