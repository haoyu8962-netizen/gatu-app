import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	expanded: boolean;
	label: string;
	onToggle: () => void;
	children: ReactNode;
	className?: string;
	controls?: string;
}

export function MobileDisclosureHeader({ expanded, label, onToggle, children, className, controls }: Props) {
	return (
		<div className={cn("relative grid min-h-11 w-full items-center bg-market-close-card text-start", className)}>
			<button
				type="button"
				aria-expanded={expanded}
				aria-label={label}
				aria-controls={controls}
				onClick={onToggle}
				className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-focus"
			/>
			<div className="contents pointer-events-none">{children}</div>
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				fill="none"
				className={cn(
					"pointer-events-none relative z-10 size-4 shrink-0 text-market-close-subtle transition-transform duration-200",
					"[transition-timing-function:cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
					expanded && "rotate-90",
				)}
			>
				<path
					d="M5.5 3.5 10 8l-4.5 4.5"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</div>
	);
}
