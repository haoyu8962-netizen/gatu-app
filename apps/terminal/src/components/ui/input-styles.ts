import { cn } from "@/lib/cn";

type InputSize = "sm" | "default" | "lg" | "xl";

const inputBaseStyles = [
	"placeholder:text-fg-muted selection:bg-signal-soft selection:text-fg",
	"border-stroke-weak min-w-0 rounded-8 border bg-transparent px-2 py-1",
	"transition-[color,box-shadow,border-color] outline-none",
	"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
	"focus-visible:border-stroke-focus focus-visible:ring-stroke-focus/20 focus-visible:ring-[2px]",
	"aria-invalid:ring-stroke-error-strong/20 dark:aria-invalid:ring-stroke-error-strong/40 aria-invalid:border-stroke-error-strong",
].join(" ");

const inputSizeStyles: Record<InputSize, string> = {
	sm: "h-6 text-xs px-1.5",
	default: "h-7 text-xs",
	lg: "h-9 text-sm px-3",
	xl: "h-12 text-base px-3",
};

const mobileSafeInputStyles = "max-[1000px]:text-base max-[1000px]:leading-5";

function getInputClassName(inputSize: InputSize, className?: string, mobileSafe = false) {
	return cn(inputBaseStyles, inputSizeStyles[inputSize], mobileSafe && mobileSafeInputStyles, className);
}

export { inputBaseStyles, inputSizeStyles, mobileSafeInputStyles, getInputClassName };
export type { InputSize };
