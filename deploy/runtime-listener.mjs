import assert from "node:assert/strict";

export function validateListener(values, { port = 3000, requireHost = true } = {}) {
	assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535, "invalid expected listener port");
	if (requireHost) assert.equal(values.HOST, "127.0.0.1", "HOST=127.0.0.1 is required");
	for (const [name, expected] of [
		["HOST", "127.0.0.1"],
		["NITRO_HOST", "127.0.0.1"],
		["PORT", String(port)],
		["NITRO_PORT", String(port)],
	]) {
		assert.ok([undefined, "", expected].includes(values[name]), `${name} must be absent, empty or ${expected}`);
	}
}
