import { infoQueryOptions, useHyperliquid } from "@sairn/hl-react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type AccountAbstraction, isSupportedAccountAbstraction } from "@/hooks/trade/use-account-balances";

export class AccountAbstractionExecutionError extends Error {
	readonly reason: "changed" | "unavailable";

	constructor(reason: "changed" | "unavailable") {
		super(
			reason === "changed"
				? "Account mode changed before the request was submitted. Review balances and try again."
				: "Unable to verify the current account mode. Request was not submitted.",
		);
		this.name = "AccountAbstractionExecutionError";
		this.reason = reason;
	}
}

export async function fetchFreshAccountAbstraction(
	queryClient: QueryClient,
	info: ReturnType<typeof useHyperliquid>["info"],
	env: ReturnType<typeof useHyperliquid>["env"],
	user: `0x${string}`,
	signal?: AbortSignal,
): Promise<AccountAbstraction> {
	const params = { user };
	const options = infoQueryOptions(info, "userAbstraction", params, env);
	signal?.throwIfAborted();
	await queryClient.cancelQueries({ exact: true, queryKey: options.queryKey });
	signal?.throwIfAborted();
	const abstraction = await info.userAbstraction(params, signal);
	signal?.throwIfAborted();
	await queryClient.cancelQueries({ exact: true, queryKey: options.queryKey });
	signal?.throwIfAborted();
	queryClient.setQueryData(options.queryKey, abstraction);
	return abstraction;
}

export async function assertFreshAccountAbstraction(
	expected: AccountAbstraction,
	user: `0x${string}` | undefined,
	fetchFresh: (user: `0x${string}`, signal?: AbortSignal) => Promise<AccountAbstraction>,
	signal?: AbortSignal,
): Promise<void> {
	if (!user || !isSupportedAccountAbstraction(expected)) {
		throw new AccountAbstractionExecutionError("unavailable");
	}

	let current: AccountAbstraction;
	try {
		current = await fetchFresh(user, signal);
	} catch (error) {
		if (signal?.aborted) throw signal.reason ?? error;
		throw new AccountAbstractionExecutionError("unavailable");
	}
	if (!isSupportedAccountAbstraction(current)) {
		throw new AccountAbstractionExecutionError("unavailable");
	}
	if (current !== expected) {
		throw new AccountAbstractionExecutionError("changed");
	}
}

/**
 * Returns a queue-boundary guard for actions whose SDK method or source account
 * depends on the account mode observed by the UI.
 */
export function useAccountAbstractionPreExecutionGuard(expected: AccountAbstraction, user: `0x${string}` | undefined) {
	const queryClient = useQueryClient();
	const { env, info } = useHyperliquid();
	const fetchFresh = useCallback(
		(address: `0x${string}`, signal?: AbortSignal) =>
			fetchFreshAccountAbstraction(queryClient, info, env, address, signal),
		[env, info, queryClient],
	);

	return useCallback(
		(signal?: AbortSignal) => assertFreshAccountAbstraction(expected, user, fetchFresh, signal),
		[expected, fetchFresh, user],
	);
}
