function escapeCsvCell(value: string): string {
	const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	if (!/[",\r\n]/.test(safeValue)) return safeValue;
	return `"${safeValue.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows: readonly (readonly string[])[]): string {
	return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function downloadCsv(filename: string, rows: readonly (readonly string[])[]): void {
	const blob = new Blob(["\uFEFF", serializeCsv(rows)], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
