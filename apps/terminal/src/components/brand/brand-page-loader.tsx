import type { SVGProps } from "react";
import { BRAND_LOGO_FILL } from "./brand-logo-fill";
import { BRAND_LOADER_VIEW_BOX, BRAND_LOGO_GEOMETRY } from "./brand-logo-geometry.gen";

type Props = Omit<SVGProps<SVGSVGElement>, "aria-hidden" | "children" | "focusable" | "viewBox">;

export function BrandPageLoader({ className, ...props }: Props) {
	return (
		<svg
			{...props}
			aria-hidden="true"
			className={className}
			data-brand-loader="page-loading"
			focusable="false"
			viewBox={BRAND_LOADER_VIEW_BOX}
		>
			{BRAND_LOGO_GEOMETRY.mark.paths.map((path) => (
				<path
					key={path.part}
					className={`brand-page-loader__${path.part}`}
					d={path.d}
					fill={BRAND_LOGO_FILL[path.part]}
				/>
			))}
		</svg>
	);
}
