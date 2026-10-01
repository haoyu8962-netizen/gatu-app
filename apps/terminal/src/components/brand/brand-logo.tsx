import type { SVGProps } from "react";
import { BRAND_LOGO_FILL } from "./brand-logo-fill";
import { BRAND_LOGO_GEOMETRY } from "./brand-logo-geometry.gen";

export type BrandLogoVariant = keyof typeof BRAND_LOGO_GEOMETRY;

interface Props extends Omit<SVGProps<SVGSVGElement>, "children" | "viewBox"> {
	variant?: BrandLogoVariant;
}

export function BrandLogo({ variant = "lockup", ...props }: Props) {
	const geometry = BRAND_LOGO_GEOMETRY[variant];
	return (
		<svg aria-hidden="true" data-brand-logo={variant} focusable="false" viewBox={geometry.viewBox} {...props}>
			{geometry.paths.map((path) => (
				<path key={path.part} d={path.d} fill={BRAND_LOGO_FILL[path.part]} />
			))}
		</svg>
	);
}
