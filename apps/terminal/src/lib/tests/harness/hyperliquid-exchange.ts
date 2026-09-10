import { ExchangeClient, type IRequestTransport } from "@nktkas/hyperliquid";
import { vi } from "vitest";

export function createExchangeHarness(isTestnet = true) {
	const signTypedData = vi.fn(async (_typedData: unknown) => `0x${"11".repeat(64)}1b` as const);
	const request = vi.fn(async (_endpoint: string, payload: unknown) => {
		const { action } = payload as {
			action: { type: string; orders?: unknown[]; modifies?: unknown[]; cancels?: unknown[] };
		};
		if (action.type === "twapOrder") {
			return { status: "ok", response: { type: "twapOrder", data: { status: { running: { twapId: 1 } } } } };
		}
		if (action.type === "order" || action.type === "modify" || action.type === "batchModify") {
			const count = action.orders?.length ?? action.modifies?.length ?? 1;
			return {
				status: "ok",
				response: {
					type: "order",
					data: { statuses: Array.from({ length: count }, (_, index) => ({ resting: { oid: index + 1 } })) },
				},
			};
		}
		if (action.type === "cancel") {
			return {
				status: "ok",
				response: { type: "cancel", data: { statuses: action.cancels?.map(() => "success") ?? [] } },
			};
		}
		if (action.type === "updateLeverage") return { status: "ok", response: { type: "default" } };
		throw new Error(`Unexpected SDK exchange action: ${action.type}`);
	});
	const client = new ExchangeClient({
		transport: { isTestnet, request } as IRequestTransport,
		wallet: { address: "0x1111111111111111111111111111111111111111", signTypedData },
		nonceManager: () => 1_722_000_000_000,
	});

	function getAction(index = 0): Record<string, unknown> {
		const payload = request.mock.calls[index]?.[1];
		if (!payload || typeof payload !== "object" || !("action" in payload)) {
			throw new Error("Expected a captured SDK exchange request");
		}
		return payload.action as Record<string, unknown>;
	}

	return { client, request, signTypedData, getAction };
}
