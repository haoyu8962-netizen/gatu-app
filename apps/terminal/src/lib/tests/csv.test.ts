import { describe, expect, it } from "vitest";
import { buildCsvRows, serializeCsv } from "@/lib/csv";

describe("serializeCsv", () => {
	it("escapes delimiters and spreadsheet formulas", () => {
		const csv = serializeCsv([
			["normal", "with,comma", 'with"quote'],
			["=SUM(A1:A2)", "+cmd", "-5 USDC", "@name"],
		]);

		expect(csv).toBe('normal,"with,comma","with""quote"\n\'=SUM(A1:A2),\'+cmd,\'-5 USDC,\'@name');
	});

	it("leaves plain numbers unprefixed so negative amounts stay numeric in spreadsheets", () => {
		expect(serializeCsv([["-12.5", "+3", "-0.00001234", "-1e-7", "-5 USDC", "-1+1"]])).toBe(
			"-12.5,+3,-0.00001234,'-1e-7,'-5 USDC,'-1+1",
		);
	});
});

describe("buildCsvRows", () => {
	it("maps localized headers and the currently loaded records in column order", () => {
		const rows = buildCsvRows(
			[
				{ asset: "BTC", value: "1,234.50" },
				{ asset: "ETH", value: "987.60" },
			],
			[
				{ header: "Asset", getValue: (row) => row.asset },
				{ header: "Value", getValue: (row) => row.value },
			],
		);

		expect(rows).toEqual([
			["Asset", "Value"],
			["BTC", "1,234.50"],
			["ETH", "987.60"],
		]);
	});
});
