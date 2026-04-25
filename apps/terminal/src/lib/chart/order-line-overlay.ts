import { createLineOverlay } from "./create-line-overlay";

export const ORDER_LINE_NAME = "orderLine";

export const registerOrderLineOverlay = createLineOverlay({
	name: ORDER_LINE_NAME,
	style: { lineAlpha: 0.35, borderAlpha: 0.7 },
	resolve: ({ extendData }) => {
		const data = extendData as { side?: "B" | "A"; label?: string } | undefined;
		return {
			label: data?.label ?? "",
			isBuy: data?.side === "B",
		};
	},
});
