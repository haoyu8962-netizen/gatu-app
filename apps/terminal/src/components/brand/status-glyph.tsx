import type { SVGProps } from "react";
import type { StatusGlyphDefinition } from "@/lib/brand/status-glyph.gen";
import { cn } from "@/lib/cn";
import { MotionDrawingShapes } from "./motion-drawing-shapes";

const GRID_16_MAX_SIZE_PX = 18;

interface Props extends Omit<SVGProps<SVGSVGElement>, "aria-hidden" | "aria-label" | "children" | "role" | "viewBox"> {
	glyph: StatusGlyphDefinition;
	size?: number;
	label?: string;
}

export function StatusGlyph({ glyph, size = 16, label, className, ...props }: Props) {
	const drawing = size <= GRID_16_MAX_SIZE_PX ? glyph.grid16 : glyph.grid24;
	return (
		<svg
			{...props}
			aria-hidden={label ? undefined : true}
			aria-label={label}
			className={cn("srm shrink-0", glyph.className, className)}
			data-loading-indicator={glyph.loop ? "" : undefined}
			data-status-glyph={glyph.id}
			data-tone={glyph.tone}
			focusable="false"
			height={size}
			role={label ? "img" : undefined}
			viewBox={drawing.viewBox}
			width={size}
		>
			<MotionDrawingShapes drawing={drawing} />
		</svg>
	);
}
