import type { MotionPaint } from "@/lib/brand/status-glyph.gen";

export const MOTION_PAINT: Record<MotionPaint, string> = {
	tone: "var(--status-tone, currentColor)",
	on: "var(--status-on, Canvas)",
	none: "none",
	current: "currentColor",
};
