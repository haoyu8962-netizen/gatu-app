import type { Messages } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { compactLinguiCatalogModule } from "../../../vite.config";
import { expandCatalogMessages, hashCatalogMessageIds, type LoadableCatalogModule } from "../i18n-catalog";

const sourceMessages = {
	alpha: ["Alpha"],
	beta: ["Beta"],
} satisfies Messages;

function readCompactedModule(code: string): LoadableCatalogModule {
	const match = code.match(
		/^\/\*eslint-disable\*\/export const messages=JSON\.parse\((.+)\);export const messageIdsHash=(\d+);$/s,
	);
	if (!match?.[1] || !match[2]) throw new Error("Unexpected compact catalog module");
	return {
		messages: JSON.parse(JSON.parse(match[1]) as string),
		messageIdsHash: Number(match[2]),
	};
}

describe("compact Lingui catalogs", () => {
	it("removes repeated message ids and restores the Lingui message map", () => {
		const compiledModule = `/*eslint-disable*/export const messages=JSON.parse(${JSON.stringify(
			JSON.stringify(sourceMessages),
		)});`;
		const compactedModule = compactLinguiCatalogModule(compiledModule);

		expect(compactedModule).not.toContain('"alpha"');
		expect(expandCatalogMessages(sourceMessages, readCompactedModule(compactedModule))).toEqual(sourceMessages);
	});

	it("accepts ordinary catalog objects in test and non-Vite runtimes", () => {
		expect(expandCatalogMessages(sourceMessages, { messages: sourceMessages })).toBe(sourceMessages);
	});

	it("fails closed when compact values do not match the source catalog", () => {
		expect(() =>
			expandCatalogMessages(sourceMessages, {
				messages: [["Uno"], ["Dos"]],
				messageIdsHash: hashCatalogMessageIds(["beta", "alpha"]),
			}),
		).toThrow("does not match the source catalog");
		expect(() =>
			expandCatalogMessages(sourceMessages, {
				messages: [["Uno"]],
				messageIdsHash: hashCatalogMessageIds(Object.keys(sourceMessages)),
			}),
		).toThrow("does not match the source catalog");
	});
});
