import { describe, expect, it } from "vitest";
import { convertFeeToPercentageString } from "../../../../../packages/hl-react/src/signing/agent-utils";

describe("builder fee conversion", () => {
	it("converts tenths of a basis point to an approval percentage", () => {
		expect(convertFeeToPercentageString(1)).toBe("0.001%");
		expect(convertFeeToPercentageString(10)).toBe("0.01%");
	});
});
