import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function useCopyToClipboard(resetDelay = 5000) {
	const [copiedValue, setCopiedValue] = useState<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedValue(text);
			toast.success(t`Copied to clipboard`);

			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			timeoutRef.current = setTimeout(() => {
				setCopiedValue(null);
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

	return { copied: copiedValue !== null, copiedValue, copy };
}
