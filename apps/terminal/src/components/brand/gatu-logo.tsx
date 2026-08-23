import type { SVGProps } from "react";

type GatuLogoVariant = "lockup" | "mark" | "wordmark";

interface Props extends Omit<SVGProps<SVGSVGElement>, "children"> {
	micro?: boolean;
	variant?: GatuLogoVariant;
}

const ink = "var(--logo-ink, currentColor)";
const node = "var(--logo-node, currentColor)";

export const GATU_MARK_PATH = "M42.5 8 H8 V40 H40 V24 H26";

export function GatuLogo({ micro = false, variant = "lockup", ...props }: Props) {
	if (variant === "mark") {
		return (
			<svg aria-hidden="true" data-gatu-logo="mark" focusable="false" viewBox="0 0 48 48" fill="none" {...props}>
				<path d={GATU_MARK_PATH} stroke={ink} strokeWidth={micro ? 6.5 : 5} strokeLinecap="butt" />
				<rect x={micro ? 17.5 : 18} y={micro ? 19.5 : 20} width={micro ? 9 : 8} height={micro ? 9 : 8} fill={node} />
			</svg>
		);
	}

	if (variant === "wordmark") {
		return (
			<svg aria-hidden="true" data-gatu-logo="wordmark" focusable="false" viewBox="0 0 151 37" fill="none" {...props}>
				{renderWordmarkRects(true)}
			</svg>
		);
	}

	return (
		<svg aria-hidden="true" data-gatu-logo="lockup" focusable="false" viewBox="0 0 225.95 49.95" fill="none" {...props}>
			<g transform="scale(1.35) translate(-5.5,-5.5)">
				<path d={GATU_MARK_PATH} stroke={ink} strokeWidth="5" strokeLinecap="butt" />
				<rect x="18" y="20" width="8" height="8" fill={node} />
			</g>
			<g transform="translate(74.95 6.48)">{renderWordmarkRects()}</g>
		</svg>
	);
}

function renderWordmarkRects(includeNode = false) {
	return (
		<>
			<rect width="37" height="5" fill={ink} />
			<rect width="5" height="37" fill={ink} />
			<rect y="32" width="37" height="5" fill={ink} />
			<rect x="32" y="16" width="5" height="21" fill={ink} />
			<rect x="20.5" y="16" width="16.5" height="5" fill={ink} />
			{includeNode ? <rect x="12.5" y="14.5" width="8" height="8" fill={node} /> : null}
			<rect x="45" width="30" height="5" fill={ink} />
			<rect x="70" width="5" height="37" fill={ink} />
			<rect x="45" y="16" width="30" height="5" fill={ink} />
			<rect x="45" y="16" width="5" height="21" fill={ink} />
			<rect x="83" width="30" height="5" fill={ink} />
			<rect x="95.5" width="5" height="37" fill={ink} />
			<rect x="121" width="5" height="37" fill={ink} />
			<rect x="146" width="5" height="37" fill={ink} />
			<rect x="121" y="32" width="30" height="5" fill={ink} />
		</>
	);
}
