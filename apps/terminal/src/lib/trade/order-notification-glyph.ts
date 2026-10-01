import {
	STATUS_GLYPH_CANCELLED,
	STATUS_GLYPH_ERROR,
	STATUS_GLYPH_PARTIAL,
	STATUS_GLYPH_PENDING,
	STATUS_GLYPH_SUBMITTING,
	STATUS_GLYPH_SUCCESS,
	STATUS_GLYPH_UNKNOWN,
	type StatusGlyphDefinition,
} from "@/lib/brand/status-glyph.gen";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

/**
 * Status glyph of an order notification (docs/trading-notifications.md). An unconfirmed result is unknown, never
 * an error; accepted and filled orders share the success glyph and differ in their copy.
 */
export function getOrderNotificationGlyph(status: OrderQueueItem["status"]): StatusGlyphDefinition {
	switch (status) {
		case "pending":
			return STATUS_GLYPH_SUBMITTING;
		case "confirming":
			return STATUS_GLYPH_PENDING;
		case "unconfirmed":
			return STATUS_GLYPH_UNKNOWN;
		case "partial":
			return STATUS_GLYPH_PARTIAL;
		case "success":
			return STATUS_GLYPH_SUCCESS;
		case "canceled":
			return STATUS_GLYPH_CANCELLED;
		case "failed":
			return STATUS_GLYPH_ERROR;
	}
}
