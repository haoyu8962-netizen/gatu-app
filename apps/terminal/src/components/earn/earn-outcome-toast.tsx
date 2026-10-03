import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { type NumberFormatters, useNumberFormat } from "@/lib/format";
import { useHyperliquid } from "@/lib/hyperliquid";

export interface EarnToastIdentity {
	toastId: string;
	env: string;
	clientKey: string;
}

interface Props extends EarnToastIdentity {
	render: (translate: (descriptor: MessageDescriptor) => string, numberFormat: NumberFormatters) => ReactNode;
}

export function EarnOutcomeToastContent({ toastId, env, clientKey, render }: Props) {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const current = useHyperliquid();
	const mismatch = current.env !== env || current.clientKey.toLowerCase() !== clientKey.toLowerCase();

	useEffect(() => {
		if (mismatch) toast.dismiss(toastId);
	}, [mismatch, toastId]);

	if (mismatch) return null;
	return <>{render((descriptor) => t(descriptor), numberFormat)}</>;
}
