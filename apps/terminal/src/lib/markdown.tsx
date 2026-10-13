import { Fragment, type ReactNode } from "react";

const HEADING_CLASS: Record<number, string> = {
	1: "mt-0 mb-4 text-2xl font-bold text-fg",
	2: "mt-8 mb-3 text-lg font-semibold text-fg",
	3: "mt-6 mb-2 text-base font-semibold text-fg",
	4: "mt-4 mb-2 text-sm font-semibold text-fg",
	5: "mt-4 mb-2 text-sm font-semibold text-fg-muted",
	6: "mt-4 mb-2 text-xs font-semibold text-fg-muted",
};

function Heading({ level, id, children }: { level: number; id: string; children: ReactNode }) {
	const className = `${HEADING_CLASS[level] ?? HEADING_CLASS[6]} scroll-mt-[calc(var(--markdown-anchor-offset,0rem)+1rem)]`;
	const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
	return (
		<Tag id={id} className={className}>
			{children}
		</Tag>
	);
}

const INLINE_SOURCE =
	/\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(?<![\p{L}\p{N}_])_([^_\s\n](?:[^_\n]*[^_\s\n])?)_(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}*])\*([^*\s\n](?:[^*\n]*[^*\s\n])?)\*(?![\p{L}\p{N}*])/gu;

const LINK_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED_LINK_SCHEME_PATTERN = /^(?:https?|mailto):/i;

/**
 * A document link is either relative or uses a scheme the renderer vouches for. Anything else
 * (`javascript:`, `data:`, `vbscript:` or a scheme hidden behind whitespace) renders as text.
 */
export function isAllowedLinkHref(href: string): boolean {
	const trimmed = [...href].filter((char) => char.charCodeAt(0) > 0x1f && !/\s/.test(char)).join("");
	if (!LINK_SCHEME_PATTERN.test(trimmed)) return true;
	return ALLOWED_LINK_SCHEME_PATTERN.test(trimmed);
}

function renderInline(text: string): ReactNode[] {
	const inline = new RegExp(INLINE_SOURCE.source, INLINE_SOURCE.flags);
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	let key = 0;
	let match: RegExpExecArray | null;
	while (true) {
		match = inline.exec(text);
		if (match === null) break;
		if (match.index > lastIndex) {
			nodes.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
		}
		if (match[1] !== undefined) {
			const href = match[2];
			if (!isAllowedLinkHref(href)) {
				nodes.push(<Fragment key={key++}>{match[1]}</Fragment>);
			} else {
				const isExternal = /^https?:/i.test(href);
				nodes.push(
					<a
						key={key++}
						href={href}
						{...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
						className="text-signal underline underline-offset-2 hover:text-signal-hover focus-visible:rounded-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
					>
						{match[1]}
					</a>,
				);
			}
		} else if (match[3] !== undefined) {
			nodes.push(
				<strong key={key++} className="font-semibold text-fg">
					{match[3]}
				</strong>,
			);
		} else if (match[4] !== undefined) {
			nodes.push(
				<code key={key++} className="rounded-xs bg-fill-weak px-1 py-0.5 font-mono text-[0.9em]">
					{match[4]}
				</code>,
			);
		}
		if (match[5] !== undefined || match[6] !== undefined) {
			nodes.push(<em key={key++}>{renderInline(match[5] ?? match[6])}</em>);
		}
		lastIndex = inline.lastIndex;
	}
	if (lastIndex < text.length) nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
	return nodes;
}

function parseTableRow(row: string): string[] {
	return row
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function parseList(lines: string[], start: number): { node: ReactNode; next: number } {
	const first = LIST_ITEM.exec(lines[start]);
	if (!first) return { node: null, next: start + 1 };
	const indent = first[1].length;
	const ordered = /\d/.test(first[2]);
	const items: ReactNode[] = [];
	let next = start;
	while (next < lines.length) {
		const item = LIST_ITEM.exec(lines[next]);
		if (!item || item[1].length !== indent || /\d/.test(item[2]) !== ordered) break;
		next++;
		const children: ReactNode[] = [];
		while (next < lines.length) {
			const child = LIST_ITEM.exec(lines[next]);
			if (!child || child[1].length <= indent) break;
			const nested = parseList(lines, next);
			children.push(<Fragment key={children.length}>{nested.node}</Fragment>);
			next = nested.next;
		}
		items.push(
			<li key={items.length} className="my-1">
				{renderInline(item[3])}
				{children}
			</li>,
		);
	}
	const node = ordered ? (
		<ol className="my-3 list-decimal space-y-1 ps-6 text-sm text-fg-muted">{items}</ol>
	) : (
		<ul className="my-3 list-disc space-y-1 ps-6 text-sm text-fg-muted">{items}</ul>
	);
	return { node, next };
}

export function renderMarkdown(markdown: string): ReactNode[] {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const blocks: ReactNode[] = [];
	let i = 0;
	let key = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.trim() === "") {
			i++;
			continue;
		}

		if (line.startsWith("```")) {
			const buffer: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				buffer.push(lines[i]);
				i++;
			}
			i++;
			blocks.push(
				<pre key={key++} className="my-4 overflow-x-auto rounded-xs bg-sunken p-3 font-mono text-xs text-fg">
					<code>{buffer.join("\n")}</code>
				</pre>,
			);
			continue;
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			blocks.push(
				<Heading
					key={key++}
					level={heading[1].length}
					id={heading[2]
						.replace(
							new RegExp(INLINE_SOURCE.source, INLINE_SOURCE.flags),
							(_match, link, _href, strong, code, underscore, asterisk) =>
								link ?? strong ?? code ?? underscore ?? asterisk,
						)
						.toLowerCase()
						.replace(/[^\p{L}\p{N} _-]/gu, "")
						.replace(/ /g, "-")}
				>
					{renderInline(heading[2])}
				</Heading>,
			);
			i++;
			continue;
		}

		if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
			blocks.push(<hr key={key++} className="my-6 border-stroke-weak" />);
			i++;
			continue;
		}

		if (line.startsWith(">")) {
			const buffer: string[] = [];
			while (i < lines.length && lines[i].startsWith(">")) {
				buffer.push(lines[i].replace(/^>\s?/, ""));
				i++;
			}
			blocks.push(
				<blockquote
					key={key++}
					className="my-4 rounded-xs border-s-2 border-stroke-signal/40 bg-fill-weak px-4 py-2 text-sm text-fg-muted"
				>
					{renderInline(buffer.join(" "))}
				</blockquote>,
			);
			continue;
		}

		const isTableHeader =
			line.includes("|") &&
			i + 1 < lines.length &&
			lines[i + 1].includes("-") &&
			/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]);
		if (isTableHeader) {
			const header = parseTableRow(line);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
				rows.push(parseTableRow(lines[i]));
				i++;
			}
			const keyedHeader = withOccurrenceKeys(header, (cell) => cell);
			const keyedRows = withOccurrenceKeys(rows, (row) => JSON.stringify(row));
			blocks.push(
				<div key={key++} className="my-4 overflow-x-auto">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr>
								{keyedHeader.map(({ key: cellKey, value: cell }) => (
									<th
										key={cellKey}
										className="border border-stroke-weak bg-fill-weak px-3 py-2 text-start font-semibold text-fg"
									>
										{renderInline(cell)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{keyedRows.map(({ key: rowKey, value: row }) => (
								<tr key={rowKey}>
									{withOccurrenceKeys(row, (cell) => cell).map(({ key: cellKey, value: cell }) => (
										<td key={cellKey} className="border border-stroke-weak px-3 py-2 align-top text-fg-muted">
											{renderInline(cell)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>,
			);
			continue;
		}

		if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
			const list = parseList(lines, i);
			blocks.push(<Fragment key={key++}>{list.node}</Fragment>);
			i = list.next;
			continue;
		}

		const paragraph: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() !== "" &&
			!/^(#{1,6}\s|>|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]) &&
			!/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
		) {
			paragraph.push(lines[i]);
			i++;
		}
		blocks.push(
			<p key={key++} className="my-3 text-sm leading-relaxed text-fg-muted">
				{renderInline(paragraph.join(" "))}
			</p>,
		);
	}

	return blocks;
}

function withOccurrenceKeys<T>(values: readonly T[], serialize: (value: T) => string) {
	const occurrences = new Map<string, number>();
	return values.map((value) => {
		const serialized = serialize(value);
		const occurrence = occurrences.get(serialized) ?? 0;
		occurrences.set(serialized, occurrence + 1);
		return { key: `${serialized}\u0000${occurrence}`, value };
	});
}
