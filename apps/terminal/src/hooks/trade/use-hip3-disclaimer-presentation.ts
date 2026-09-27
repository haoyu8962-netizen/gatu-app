import { getHip3DeployerDocumentationUrl } from "@/config/hip3-deployers";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import type { Hip3DisclaimerRequirement } from "./use-hip3-disclaimer";

export type Hip3DisclaimerExit = "cancel" | "leave-market";

export interface Hip3DisclaimerPresentation {
	open: boolean;
	dex: string;
	exit: Hip3DisclaimerExit;
	documentationUrl: string | undefined;
}

/**
 * Keeps the disclaimer mounted, closed and with the same way out, for `exitMs` after it stops being
 * required so its exit transition can run. `open` follows the live requirement.
 */
export function useHip3DisclaimerPresentation(
	requirement: Hip3DisclaimerRequirement,
	exit: Hip3DisclaimerExit,
	exitMs: number,
): Hip3DisclaimerPresentation | null {
	const requiredDex = requirement.isRequired ? (requirement.dex ?? null) : null;
	const displayedDex = useLingeringValue(requiredDex, exitMs);
	const displayedExit = useLingeringValue(requiredDex === null ? null : exit, exitMs);
	if (displayedDex === null) return null;
	return {
		open: requiredDex !== null,
		dex: displayedDex,
		exit: displayedExit ?? exit,
		documentationUrl: getHip3DeployerDocumentationUrl(displayedDex),
	};
}
