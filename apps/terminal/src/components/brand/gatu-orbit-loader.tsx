import type { SVGProps } from "react";

import { GATU_MARK_PATH } from "./gatu-logo";

type Props = Omit<SVGProps<SVGSVGElement>, "aria-hidden" | "children" | "focusable">;

export function GatuOrbitLoader({ className, ...props }: Props) {
	return (
		<svg
			{...props}
			aria-hidden="true"
			className={className}
			data-gatu-loader="orbit"
			fill="none"
			focusable="false"
			viewBox="0 0 48 48"
		>
			<path
				className="gatu-orbit-loader__track"
				d={GATU_MARK_PATH}
				stroke="var(--logo-ink, currentColor)"
				strokeLinecap="butt"
				strokeWidth="5"
			/>
			<path
				className="gatu-orbit-loader__segment"
				d={GATU_MARK_PATH}
				pathLength="100"
				stroke="var(--signal, currentColor)"
				strokeDasharray="16 84"
				strokeLinecap="butt"
				strokeWidth="5"
			/>
			<rect
				className="gatu-orbit-loader__static-node"
				fill="var(--logo-node, currentColor)"
				height="8"
				width="8"
				x="18"
				y="20"
			/>
		</svg>
	);
}
