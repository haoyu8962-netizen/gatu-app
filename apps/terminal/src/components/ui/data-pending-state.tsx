import { cn } from "@/lib/cn";

interface Props {
	className?: string;
	loading?: boolean;
}

export function DataPendingState({ className, loading = true }: Props) {
	return <div data-slot="data-pending" aria-busy={loading} className={cn("min-h-44 flex-1", className)} />;
}
