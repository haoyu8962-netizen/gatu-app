import {
	STATUS_GLYPH_CANCELLED,
	STATUS_GLYPH_ERROR,
	STATUS_GLYPH_PARTIAL,
	STATUS_GLYPH_PENDING,
	STATUS_GLYPH_SUBMITTING,
	STATUS_GLYPH_SUCCESS,
	STATUS_GLYPH_UNKNOWN,
	STATUS_GLYPH_WARNING,
	type StatusGlyphDefinition,
} from "@/lib/brand/status-glyph.gen";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

/**
 * Status glyph of an order notification (docs/trading-notifications.md). An unconfirmed result is unknown, never
 * an error; accepted and filled orders share the success glyph and differ in their copy. The half-filled partial
 * glyph means a verified partial fill; a partial batch that was only accepted, or that carries a rejection,
 * cancellation or unknown child, is a warning.
 */
export function getOrderNotificationGlyph(
	order: Pick<OrderQueueItem, "status" | "error" | "execution" | "countMode">,
): StatusGlyphDefinition {
	switch (order.status) {
		case "pending":
			return STATUS_GLYPH_SUBMITTING;
		case "confirming":
			return STATUS_GLYPH_PENDING;
		case "unconfirmed":
			return STATUS_GLYPH_UNKNOWN;
		case "partial":
			return isVerifiedPartialFill(order) ? STATUS_GLYPH_PARTIAL : STATUS_GLYPH_WARNING;
		case "success":
			return STATUS_GLYPH_SUCCESS;
		case "canceled":
			return STATUS_GLYPH_CANCELLED;
		case "failed":
			return STATUS_GLYPH_ERROR;
	}
}

function isVerifiedPartialFill(order: Pick<OrderQueueItem, "error" | "execution" | "countMode">): boolean {
	if (order.error) return false;
	return order.execution?.completeness === "partial" || order.countMode === "filled";
}
