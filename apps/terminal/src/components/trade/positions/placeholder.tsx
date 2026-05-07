import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	children: ReactNode;
	variant?: "error";
}

export function Placeholder({ children, variant }: Props) {
	return (
		<div
			className={cn(
				"h-full w-full flex flex-col items-center justify-center px-2 py-6 text-xs",
				variant === "error" ? "text-error" : "text-fg-muted",
			)}
		>
			{children}
		</div>
	);
}
