import { createElement } from "react";
import { BRAND_LOGO_GEOMETRY } from "@/lib/brand/logo-geometry.gen";
import type { MotionDrawing } from "@/lib/brand/status-motion.gen";
import { BRAND_LOGO_FILL } from "./brand-logo-fill";
import { MOTION_PAINT } from "./motion-paint";

interface Props {
	drawing: MotionDrawing;
}

export function MotionDrawingShapes({ drawing }: Props) {
	return (
		<>
			{drawing.markTransform !== undefined && (
				<g transform={drawing.markTransform}>
					{BRAND_LOGO_GEOMETRY.mark.paths.map((path) => (
						<path key={path.part} d={path.d} fill={BRAND_LOGO_FILL[path.part]} />
					))}
				</g>
			)}
			{drawing.shapes.map((shape, index) =>
				createElement(shape.tag, {
					key: `${shape.tag}-${index}`,
					...shape.attributes,
					className: shape.className,
					fill: shape.fill === undefined ? undefined : MOTION_PAINT[shape.fill],
					stroke: shape.stroke === undefined ? undefined : MOTION_PAINT[shape.stroke],
				}),
			)}
		</>
	);
}
