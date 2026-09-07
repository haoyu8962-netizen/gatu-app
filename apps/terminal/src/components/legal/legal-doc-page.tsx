import { renderMarkdown } from "@/lib/markdown";
import { DocumentChrome } from "./document-chrome";

interface Props {
	content: string;
}

export function LegalDocPage({ content }: Props) {
	return (
		<DocumentChrome>
			<main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 min-[1001px]:py-12">
				<article lang="en" dir="ltr">
					{renderMarkdown(content)}
				</article>
			</main>
		</DocumentChrome>
	);
}
