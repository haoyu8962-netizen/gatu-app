import { describe, expect, it, vi } from "vitest";
import { reconcileApiWalletAction } from "@/components/api-wallet/api-wallet-reconciliation";
import {
	createApiWalletApproval,
	createApiWalletRemoval,
	type ExtraAgent,
} from "@/components/api-wallet/api-wallet-state";

const NOW_MS = 1_786_579_200_000;
const ADDRESS = "0x2222222222222222222222222222222222222222";
const OTHER_ADDRESS = "0x3333333333333333333333333333333333333333";

describe("API wallet reconciliation", () => {
	it("accepts authorization only from a fresh exact tuple", async () => {
		const approval = createApiWalletApproval("grid-bot", ADDRESS, 30, NOW_MS);
		const loadSnapshot = vi.fn().mockResolvedValue({
			data: [{ name: approval.baseName, address: approval.address, validUntil: approval.validUntil }],
			error: null,
		});

		await expect(
			reconcileApiWalletAction({
				target: { kind: "authorize", approval },
				loadSnapshot,
				signal: new AbortController().signal,
			}),
		).resolves.toEqual({ status: "success" });
		expect(loadSnapshot).toHaveBeenCalledOnce();
	});

	it("never treats missing or errored snapshots as success", async () => {
		const approval = createApiWalletApproval("grid-bot", ADDRESS, 30, NOW_MS);
		const loadSnapshot = vi.fn().mockResolvedValue({ data: undefined, error: new Error("offline") });

		await expect(
			reconcileApiWalletAction({
				target: { kind: "authorize", approval },
				loadSnapshot,
				signal: new AbortController().signal,
				attempts: 2,
				wait: async () => undefined,
			}),
		).resolves.toEqual({ status: "unknown", reason: "unavailable" });
		expect(loadSnapshot).toHaveBeenCalledTimes(2);
	});

	it("never treats a malformed snapshot as success", async () => {
		const approval = createApiWalletApproval("grid-bot", ADDRESS, 30, NOW_MS);
		const loadSnapshot = vi.fn().mockResolvedValue({
			data: [{ name: approval.baseName, address: approval.address, validUntil: Number.NaN }],
			error: null,
		});

		await expect(
			reconcileApiWalletAction({
				target: { kind: "authorize", approval },
				loadSnapshot,
				signal: new AbortController().signal,
				attempts: 1,
			}),
		).resolves.toEqual({ status: "unknown", reason: "unavailable" });
	});

	it("reports a concurrent exact-name replacement instead of removal success", async () => {
		const target: ExtraAgent = { name: "grid-bot", address: ADDRESS, validUntil: NOW_MS };
		const removal = createApiWalletRemoval(target);

		await expect(
			reconcileApiWalletAction({
				target: { kind: "remove", removal },
				loadSnapshot: async () => ({
					data: [{ ...target, address: OTHER_ADDRESS }],
					error: null,
				}),
				signal: new AbortController().signal,
			}),
		).resolves.toEqual({ status: "unknown", reason: "conflict" });
	});

	it("aborts before reading another snapshot", async () => {
		const approval = createApiWalletApproval("grid-bot", ADDRESS, 30, NOW_MS);
		const controller = new AbortController();
		const loadSnapshot = vi.fn();
		controller.abort();

		await expect(
			reconcileApiWalletAction({
				target: { kind: "authorize", approval },
				loadSnapshot,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(loadSnapshot).not.toHaveBeenCalled();
	});
});
