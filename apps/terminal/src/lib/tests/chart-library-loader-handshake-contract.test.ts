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
const HELPER_DEFINITION = `${LISTEN_HELPER}=()=>this._innerWindow().${RAW_LISTENER},function(e,t){if(void 0===e)throw new Error(\`\${t} is undefined\`);return e}(this._innerWindowResolver,"_innerWindowResolver"),{once:!0})`;

function readCreateMethod(file: string) {
	const source = readFileSync(resolve(chartLibraryRoot, file), "utf8");
	const start = source.indexOf("async _create(){");
	expect(start, `${file} declares the widget _create method`).toBeGreaterThan(-1);
	const bodyStart = source.indexOf("{", start);
	let depth = 0;
	for (let index = bodyStart; index < source.length; index += 1) {
		const char = source[index];
		if (char === "{") depth += 1;
		if (char === "}") depth -= 1;
		if (depth === 0) return source.slice(start, index + 1);
	}
	throw new Error(`${file}: unbalanced _create method`);
}

describe("chart library loader handshake contract", () => {
	for (const file of LOADER_FILES) {
		it(`${file} registers the once-only innerWindowLoad listener between document.open and document.write`, () => {
			const create = readCreateMethod(file);
			const helper = create.indexOf(HELPER_DEFINITION);
			const sameOriginWait = create.indexOf('await this._innerWindowEvent("sameOriginLoad")');
			const injected = create.match(
				/n\?([a-zA-Z_$]+)\.contentWindow\?\(\1\.contentWindow\.document\.open\(\),_listenInnerWindowLoad\(\),\1\.contentWindow\.document\.write\(s\),\1\.contentWindow\.document\.close\(\)\):\(console\.warn\("[^"]+"\),_listenInnerWindowLoad\(\)\):_listenInnerWindowLoad\(\),/,
			);
			expect(helper, "the listener helper is defined once with {once:!0}").toBeGreaterThan(-1);
			expect(helper).toBeLessThan(sameOriginWait);
			expect(injected, "open → listen → write → close, warn → listen, blob → listen").not.toBeNull();
			expect((injected as RegExpMatchArray).index).toBeGreaterThan(sameOriginWait);
			expect(create.indexOf(RAW_LISTENER, helper + HELPER_DEFINITION.length), "no second raw registration").toBe(-1);
			expect(create.match(/document\.(open|write|close)\(/g)).toHaveLength(3);
			expect(create).toContain("this._innerWindowLoaded.then(");
			expect(create.endsWith("}")).toBe(true);
		});
	}
});
