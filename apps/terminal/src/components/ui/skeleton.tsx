import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const PLACEHOLDER_ROW_KEYS = ["first", "second", "third", "fourth"] as const;

type SkeletonProps = ComponentProps<typeof BoneyardSkeleton>;

/**
 * Boneyard renders nothing while loading when no bones are registered for `name`
 * (the generated registry is opt-in and can lag behind new call sites), so every
 * skeleton in the app goes through this wrapper to guarantee a visible placeholder.
 */
export function Skeleton({ fallback, ...props }: SkeletonProps) {
	return <BoneyardSkeleton fallback={fallback ?? <SkeletonRows />} {...props} />;
}

export function SkeletonValue({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-block h-3.5 w-16 animate-pulse rounded-xs bg-fill-weak motion-reduce:animate-none",
				className,
			)}
		/>
	);
}

function SkeletonRows() {
	return (
		<div aria-hidden="true" className="flex flex-col gap-2 p-3.5">
			{PLACEHOLDER_ROW_KEYS.map((key) => (
				<div key={key} className="h-16 w-full animate-pulse rounded-xs bg-fill-weak motion-reduce:animate-none" />
			))}
		</div>
	);
}
