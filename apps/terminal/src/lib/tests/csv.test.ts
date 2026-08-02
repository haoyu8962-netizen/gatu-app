import { describe, expect, it } from "vitest";
import { serializeCsv } from "@/lib/csv";

describe("serializeCsv", () => {
	it("escapes delimiters and spreadsheet formulas", () => {
		const csv = serializeCsv([
			["normal", "with,comma", 'with"quote'],
			["=SUM(A1:A2)", "+cmd", "-5 USDC", "@name"],
		]);

		expect(csv).toBe('normal,"with,comma","with""quote"\n\'=SUM(A1:A2),\'+cmd,\'-5 USDC,\'@name');
	});
});
