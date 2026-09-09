import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo, useRef } from "react";
import type { Address } from "viem";
import {
	ExchangeRequestInvalidatedError,
	invalidateExchangeRequestIdentity,
} from "../internal/exchange/request-scheduler";
import { useHyperliquid } from "../provider";

export interface HyperliquidOwnerSigner {
	ownerAddress: Address | undefined;
	wallet: AbstractViemJsonRpcAccount | null;
	assertCurrent: () => void;
}

const OwnerSignerContext = createContext<HyperliquidOwnerSigner | null>(null);

interface Props {
	children?: ReactNode;
	value: HyperliquidOwnerSigner | null;
}

export function HyperliquidOwnerSignerProvider({ children, value }: Props) {
	const { clientKey, env, sessionMode } = useHyperliquid();
	const currentBinding = useRef<HyperliquidOwnerSigner | null>(null);
	const currentEnv = useRef(env);
	currentEnv.current = env;
	const active = useRef(true);
	const ownerAddress = value?.ownerAddress;
	const wallet = value?.wallet;
	const assertCurrent = value?.assertCurrent;
	const binding = useMemo<HyperliquidOwnerSigner | null>(() => {
		if (!assertCurrent) return null;
		const next: HyperliquidOwnerSigner = {
			ownerAddress:
				sessionMode === "wallet" && ownerAddress?.toLowerCase() === clientKey.toLowerCase() ? ownerAddress : undefined,
			wallet: wallet ?? null,
			assertCurrent() {
				if (
					!active.current ||
					currentBinding.current !== next ||
					currentEnv.current !== env ||
					sessionMode !== "wallet" ||
					!ownerAddress ||
					ownerAddress.toLowerCase() !== clientKey.toLowerCase()
				) {
					throw new ExchangeRequestInvalidatedError();
				}
				assertCurrent();
			},
		};
		return next;
	}, [assertCurrent, clientKey, env, ownerAddress, sessionMode, wallet]);
	currentBinding.current = binding;
	const previous = useRef<{
		binding: HyperliquidOwnerSigner | null;
		clientKey: string;
		env: typeof env;
		sessionMode: typeof sessionMode;
	} | null>(null);

	useLayoutEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
			invalidateExchangeRequestIdentity(env, clientKey, sessionMode);
		};
	}, [clientKey, env, sessionMode]);

	useLayoutEffect(() => {
		const prior = previous.current;
		if (prior && prior.binding !== binding) {
			invalidateExchangeRequestIdentity(prior.env, prior.clientKey, prior.sessionMode);
		}
		previous.current = { binding, clientKey, env, sessionMode };
	}, [binding, clientKey, env, sessionMode]);

	return <OwnerSignerContext.Provider value={binding}>{children}</OwnerSignerContext.Provider>;
}

export function useHyperliquidOwnerSigner(): HyperliquidOwnerSigner | null {
	return useContext(OwnerSignerContext);
}
