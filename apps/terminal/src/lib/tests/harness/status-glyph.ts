import { expect } from "vitest";

/** Matches the `icon` option of a toast that reports an unknown outcome: the Sairn unknown glyph, never an error. */
export function unknownStatusToastIcon() {
	return expect.objectContaining({
		props: expect.objectContaining({ glyph: expect.objectContaining({ id: "unknown" }) }),
	});
}
