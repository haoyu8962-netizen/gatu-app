import type { ReactNode } from "react";

/**
 * What the lazily loaded deposit dialog asks its host to show. The host owns the one
 * `FundsModalShell` instance, so the shell, its backdrop and its enter transition are mounted once
 * while the chunk loads and are kept when the body arrives; a status screen is a separate dialog of
 * the same flow and replaces the shell, as it did before the split.
 */
export type DepositModalSurface =
	| {
			kind: "shell";
			tab: "deposit" | "withdraw" | "bridge";
			isPending: boolean;
			backButton: { disabled: boolean; onClick: () => void } | null;
			onOpenChange: (open: boolean) => void;
			content: ReactNode;
	  }
	| { kind: "status"; screen: ReactNode };
