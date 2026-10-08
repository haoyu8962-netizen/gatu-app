import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chartLibraryRoot = resolve(__dirname, "../../../public/charting_library");
const LOADER_FILES = [
	"charting_library.js",
	"charting_library.esm.js",
	"charting_library.cjs.js",
	"charting_library.standalone.js",
];
const LISTEN_HELPER = "_listenInnerWindowLoad";
const RAW_LISTENER = 'addEventListener("innerWindowLoad"';

function readCreateMethod(file: string) {
	const source = readFileSync(resolve(chartLibraryRoot, file), "utf8");
	const start = source.indexOf("async _create(){");
	const end = source.indexOf("this._innerWindowLoaded.then(", start);
	expect(start, `${file} declares the widget _create method`).toBeGreaterThan(-1);
	expect(end, `${file} waits for the inner window after _create`).toBeGreaterThan(start);
	return source.slice(start, end);
}

describe("charting library loader handshake contract", () => {
	for (const file of LOADER_FILES) {
		it(`${file} registers the innerWindowLoad listener between document.open and document.write`, () => {
			const create = readCreateMethod(file);
			const helperDefinition = `${LISTEN_HELPER}=()=>this._innerWindow().${RAW_LISTENER}`;
			const helper = create.indexOf(helperDefinition);
			const sameOriginWait = create.indexOf('await this._innerWindowEvent("sameOriginLoad")');
			const open = create.indexOf("document.open()");
			const write = create.indexOf("document.write(");
			const close = create.indexOf("document.close()");
			const injectedCall = create.indexOf(`document.open(),${LISTEN_HELPER}(),`);
			const blobCall = create.indexOf(`:${LISTEN_HELPER}(),`);
			expect(helper).toBeGreaterThan(-1);
			expect(helper).toBeLessThan(sameOriginWait);
			expect(open).toBeGreaterThan(sameOriginWait);
			expect(injectedCall).toBe(open);
			expect(write).toBeGreaterThan(injectedCall);
			expect(close).toBeGreaterThan(write);
			expect(blobCall).toBeGreaterThan(close);
			expect(create.indexOf(RAW_LISTENER, helper + helperDefinition.length)).toBe(-1);
		});
	}
});
