import { describe, expect, it } from "vitest";
import { APP_HEADER_HEIGHT_CLASS, APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";

describe("application header layout contract", () => {
	it("keeps desktop content offsets aligned with the 56px header", () => {
		expect({
			header: APP_HEADER_HEIGHT_CLASS,
			headerAndBannerOffset: APP_HEADER_PLUS_BANNER_OFFSET_CLASS,
			headerOffset: APP_HEADER_OFFSET_CLASS,
		}).toEqual({
			header: "h-14",
			headerAndBannerOffset: "pt-[5.5rem]",
			headerOffset: "pt-14",
		});
	});
});
