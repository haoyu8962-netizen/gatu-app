import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createJsonPostHeaders, PAYLOAD_HASH_HEADER, sha256Hex } from "@/lib/api/payload-hash";

function nodeSha256(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("payload hash for CloudFront-signed Lambda requests", () => {
	it("matches the published SHA-256 vectors", () => {
		expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
		expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
		expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
			"248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
		);
	});

	it("hashes UTF-8 bytes across block boundaries exactly like node", () => {
		for (const length of [55, 56, 63, 64, 65, 119, 120, 1_000]) {
			const text = "é中🙂".repeat(length).slice(0, length);
			expect(sha256Hex(text), `length ${length}`).toBe(nodeSha256(text));
		}
		const report = JSON.stringify({ schema: 1, kind: "react_boundary", frames: ["asset:10:2"] });
		expect(sha256Hex(report)).toBe(nodeSha256(report));
	});

	it("builds JSON post headers that carry the body hash next to the caller's headers", () => {
		const body = JSON.stringify({ override: null });
		expect(createJsonPostHeaders(body, { accept: "application/json" })).toEqual({
			accept: "application/json",
			"content-type": "application/json",
			[PAYLOAD_HASH_HEADER]: nodeSha256(body),
		});
	});

	it("sends the hash from the referral geo request", async () => {
		const decision = { checkedAt: 1_000, country: "GB", status: "allowed", ttlMs: 60_000 };
		const fetchMock = vi.fn().mockResolvedValue(Response.json(decision));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const { getReferralActionGeo } = await import("@/lib/geo/get-referral-action-geo");
			await expect(getReferralActionGeo({ data: { override: "GB" } })).resolves.toEqual(decision);
			const [, init] = fetchMock.mock.calls[0] ?? [];
			const body = String(init?.body);
			expect(JSON.parse(body)).toEqual({ override: "GB" });
			expect(init?.headers).toMatchObject({ [PAYLOAD_HASH_HEADER]: nodeSha256(body) });
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
