// The site's one button style (operator decision 2026-10-26, "style 4"): a pill with a round arrow chip on its right.
// ButtonLink.astro renders links and Button.astro renders <button> elements and pressed toggles from these classes;
// the styles live unlayered in src/styles/global.css, so no utility on a call site can override them.

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "lg" | "md" | "sm";
export type ButtonIcon = "external" | "down" | "right" | "none";

interface ButtonClassOptions {
	variant: ButtonVariant | "toggle";
	size: ButtonSize;
	icon: ButtonIcon;
}

/** `btn btn-<variant> btn-<size>`, plus `btn-plain` when the button has no arrow chip. */
export function buttonClasses({ variant, size, icon }: ButtonClassOptions): string {
	return ["btn", `btn-${variant}`, `btn-${size}`, ...(icon === "none" ? ["btn-plain"] : [])].join(" ");
}
