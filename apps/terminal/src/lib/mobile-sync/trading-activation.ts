import { isBuilderFeeApproved } from "@sairn/hl-react";
import type { BuilderConfig } from "@/lib/hyperliquid";

export const TRADING_ACTIVATION_CHECK_TIMEOUT_MS = 10_000;

export type TradingActivation = "activated" | "notActivated";

interface MaxBuilderFeeReader {
	maxBuilderFee: (params: { user: `0x${string}`; builder: `0x${string}` }, signal?: AbortSignal) => Promise<number>;
}

/**
 * Link mobile device signs a Mobile Agent only for an owner whose builder fee is already approved
 * (trading activated). The check is a direct request rather than a cached query refetch, so it
 * cannot reuse a request that was already in flight before the click. It throws when Hyperliquid
 * does not answer within the timeout or answers with something that is not a fee.
 */
export async function readTradingActivation(
	info: MaxBuilderFeeReader,
	owner: `0x${string}`,
	builderConfig: BuilderConfig,
	signal: AbortSignal,
): Promise<TradingActivation> {
	if (!builderConfig?.b || builderConfig.f === undefined) return "activated";
	const request = new AbortController();
	const abort = () => request.abort();
	const timeoutId = setTimeout(abort, TRADING_ACTIVATION_CHECK_TIMEOUT_MS);
	signal.addEventListener("abort", abort, { once: true });
	try {
		const maxBuilderFee = await info.maxBuilderFee(
			{ user: owner, builder: builderConfig.b as `0x${string}` },
			request.signal,
		);
		if (typeof maxBuilderFee !== "number" || !Number.isFinite(maxBuilderFee)) {
			throw new Error("Unexpected maxBuilderFee response");
		}
		return isBuilderFeeApproved(maxBuilderFee, builderConfig.f) ? "activated" : "notActivated";
	} finally {
		clearTimeout(timeoutId);
		signal.removeEventListener("abort", abort);
	}
}
