import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function useCopyToClipboard(resetDelay = 5000) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			toast.success(t`Copied to clipboard`);

			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			timeoutRef.current = setTimeout(() => {
				setCopied(false);
			}, resetDelay);
		} catch {
			toast.error(t`Failed to copy`);
		}
	}

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	return { copied, copy };
}
