/**
 * Bare controlled input for the trade UI.
 *
 * This wraps `@base-ui/react/input` rather than `TextInput` from `@sairn/ui`
 * because `TextInput` is a full form field (wraps the input in `Field.Root` with
 * label/hint/error slots). The trade UI needs a stripped-down input whose class
 * string composes directly with `cn()` at the callsite, with a tighter `sm` size
 * and tabular-num spacing for price/size entry. Do not replace with `TextInput`.
 */
import { Input as BaseInput } from "@base-ui/react/input";
import type * as React from "react";
import { cn } from "@/lib/cn";
import { getInputClassName, type InputSize } from "./input-styles";

export type { InputSize } from "./input-styles";
export { getInputClassName, inputBaseStyles, inputSizeStyles, mobileSafeInputStyles } from "./input-styles";

type InputProps = Omit<React.ComponentProps<typeof BaseInput>, "className"> & {
	className?: string;
	inputSize?: InputSize;
	mobileSafe?: boolean;
};

function Input({ className, type, inputSize = "default", mobileSafe, ...props }: InputProps) {
	return (
		<BaseInput
			type={type}
			data-slot="input"
			data-size={inputSize}
			className={cn("w-full", getInputClassName(inputSize, className, mobileSafe))}
			{...props}
		/>
	);
}

export { Input };
