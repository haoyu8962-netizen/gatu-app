import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { BUILD_META_PATH } from "@/config/api-paths";
import { APP_NAME } from "@/config/app";
import { createBuildMeta } from "@/config/build-meta";
import { createBuildMetaForMode, createBuildMetaPlugin } from "../../../vite.config";

const terminalPackage = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8"),
) as {
	version: string;
};

describe("build metadata", () => {
	it("describes the build identity with the fail-closed pairing flags", () => {
		expect(
			createBuildMeta({
				version: "1.2.3",
				commit: "abc123",
				release: "release-1",
				builtAt: "2026-09-13T00:00:00.000Z",
				ticketApiVersion: 2,
				pairing: { createAndReveal: false, importFromQr: true },
			}),
		).toEqual({
			name: APP_NAME,
			version: "1.2.3",
			commit: "abc123",
			release: "release-1",
			builtAt: "2026-09-13T00:00:00.000Z",
			mobileSync: {
				ticketApiVersion: 2,
				legacyRegisterDisabled: true,
				store: "single-process",
				createAndReveal: false,
				importFromQr: true,
			},
		});
	});

	it("derives the static build metadata from the package and the mode environment", () => {
		const meta = createBuildMetaForMode("production");
		expect(meta.name).toBe(APP_NAME);
		expect(meta.version).toBe(terminalPackage.version);
		expect(meta.commit).not.toBe("");
		expect(meta.mobileSync.ticketApiVersion).toBe(2);
		expect(meta.mobileSync.store).toBe("single-process");
		if (meta.mobileSync.createAndReveal) expect(meta.mobileSync.importFromQr).toBe(true);
	});

	it("emits build-meta.json into the client output only", () => {
		const meta = createBuildMetaForMode("production");
		const plugin = createBuildMetaPlugin(meta);
		const applyToEnvironment = plugin.applyToEnvironment as (environment: { name: string }) => boolean;
		expect(applyToEnvironment({ name: "client" })).toBe(true);
		expect(applyToEnvironment({ name: "server" })).toBe(false);

		const emitFile = vi.fn();
		const generateBundle = plugin.generateBundle as unknown as (this: { emitFile: typeof emitFile }) => void;
		generateBundle.call({ emitFile });
		expect(emitFile).toHaveBeenCalledWith({
			type: "asset",
			fileName: BUILD_META_PATH.slice(1),
			source: `${JSON.stringify(meta)}\n`,
		});
	});
});
