import { Fragment, type ReactNode } from "react";

const HEADING_CLASS: Record<number, string> = {
	1: "mt-0 mb-4 text-2xl font-bold text-fg",
	2: "mt-8 mb-3 text-lg font-semibold text-fg",
	3: "mt-6 mb-2 text-base font-semibold text-fg",
	4: "mt-4 mb-2 text-sm font-semibold text-fg",
	5: "mt-4 mb-2 text-sm font-semibold text-fg-muted",
	6: "mt-4 mb-2 text-xs font-semibold text-fg-muted",
};

function Heading({ level, children }: { level: number; children: ReactNode }) {
	const className = HEADING_CLASS[level] ?? HEADING_CLASS[6];
	if (level === 1) return <h1 className={className}>{children}</h1>;
	if (level === 2) return <h2 className={className}>{children}</h2>;
	if (level === 3) return <h3 className={className}>{children}</h3>;
	if (level === 4) return <h4 className={className}>{children}</h4>;
	if (level === 5) return <h5 className={className}>{children}</h5>;
	return <h6 className={className}>{children}</h6>;
}

const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

function renderInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	let key = 0;
	let match: RegExpExecArray | null;
	INLINE.lastIndex = 0;
	while (true) {
		match = INLINE.exec(text);
		if (match === null) break;
		if (match.index > lastIndex) {
			nodes.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
		}
		if (match[1] !== undefined) {
			const href = match[2];
			const isExternal = /^https?:/.test(href);
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
		lastIndex = INLINE.lastIndex;
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
				<Heading key={key++} level={heading[1].length}>
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
					className="my-4 rounded-xs border-l-2 border-stroke-signal/40 bg-fill-weak px-4 py-2 text-sm text-fg-muted"
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
										className="border border-stroke-weak bg-fill-weak px-3 py-2 text-left font-semibold text-fg"
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

		if (/^\s*[-*]\s+/.test(line)) {
			const items: ReactNode[] = [];
			while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
				items.push(
					<li key={items.length} className="my-1">
						{renderInline(lines[i].replace(/^\s*[-*]\s+/, ""))}
					</li>,
				);
				i++;
			}
			blocks.push(
				<ul key={key++} className="my-3 list-disc space-y-1 pl-6 text-sm text-fg-muted">
					{items}
				</ul>,
			);
			continue;
		}

		if (/^\s*\d+\.\s+/.test(line)) {
			const items: ReactNode[] = [];
			while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
				items.push(
					<li key={items.length} className="my-1">
						{renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}
					</li>,
				);
				i++;
			}
			blocks.push(
				<ol key={key++} className="my-3 list-decimal space-y-1 pl-6 text-sm text-fg-muted">
					{items}
				</ol>,
			);
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
