import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { renderMarkdown } from "@/lib/markdown";

interface Props {
	content: string;
}

export function LegalDocPage({ content }: Props) {
	return (
		<div className="min-h-dvh overflow-y-auto bg-background">
			<div className="mx-auto max-w-3xl px-5 py-12">
				<Link
					to="/"
					className="mb-8 inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				>
					<ArrowLeftIcon className="size-3.5" />
					<span className="font-bold tracking-tight">
						<span className="text-brand">ga</span>
						<span className="text-fg">tu</span>
					</span>
				</Link>
				<article>{renderMarkdown(content)}</article>
			</div>
		</div>
	);
}
