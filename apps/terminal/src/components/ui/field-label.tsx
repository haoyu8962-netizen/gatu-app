import type * as React from "react";
import { cn } from "@/lib/cn";

interface Props {
	htmlFor?: string;
	className?: string;
	children: React.ReactNode;
}

export function FieldLabel({ htmlFor, className, children }: Props) {
	const Tag = htmlFor ? "label" : "span";
	return (
		<Tag
			htmlFor={htmlFor}
			className={cn("text-3xs font-medium uppercase tracking-wide text-text-weak leading-none", className)}
		>
			{children}
		</Tag>
	);
}
