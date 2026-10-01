import type { SVGProps } from "react";
import type { BrandMotionDefinition } from "@/lib/brand/status-motion.gen";
import { cn } from "@/lib/cn";
import { MotionDrawingShapes } from "./motion-drawing-shapes";

interface Props extends Omit<SVGProps<SVGSVGElement>, "aria-hidden" | "aria-label" | "children" | "role" | "viewBox"> {
	motion: BrandMotionDefinition;
	size: number;
	label?: string;
}

export function BrandMotion({ motion, size, label, className, ...props }: Props) {
	return (
		<svg
			{...props}
			aria-hidden={label ? undefined : true}
			aria-label={label}
			className={cn("srm shrink-0", motion.className, className)}
			data-appearance={motion.tone === null ? "mono" : undefined}
			data-brand-motion={motion.id}
			data-loading-indicator={motion.loop ? "" : undefined}
			data-tone={motion.tone ?? undefined}
			focusable="false"
			height={size}
			role={label ? "img" : undefined}
			viewBox={motion.drawing.viewBox}
			width={size}
		>
			<MotionDrawingShapes drawing={motion.drawing} />
		</svg>
	);
}
