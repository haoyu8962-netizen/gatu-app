import { create } from "zustand";

interface TradingOnboardingState {
	dismissedAgentPrompts: ReadonlySet<string>;
	dismissAgentPrompt: (identity: string) => void;
	clearAgentPromptDismissal: (identity: string) => void;
}

const useTradingOnboardingStore = create<TradingOnboardingState>((set) => ({
	dismissedAgentPrompts: new Set(),
	dismissAgentPrompt: (identity) =>
		set((state) => {
			if (state.dismissedAgentPrompts.has(identity)) return state;
			return {
				dismissedAgentPrompts: new Set([...state.dismissedAgentPrompts, identity]),
			};
		}),
	clearAgentPromptDismissal: (identity) =>
		set((state) => {
			if (!state.dismissedAgentPrompts.has(identity)) return state;
			const dismissedAgentPrompts = new Set(state.dismissedAgentPrompts);
			dismissedAgentPrompts.delete(identity);
			return { dismissedAgentPrompts };
		}),
}));

export function useAgentPromptDismissed(identity: string | null): boolean {
	return useTradingOnboardingStore((state) => !!identity && state.dismissedAgentPrompts.has(identity));
}

export function useDismissAgentPrompt(): (identity: string) => void {
	return useTradingOnboardingStore((state) => state.dismissAgentPrompt);
}

export function useClearAgentPromptDismissal(): (identity: string) => void {
	return useTradingOnboardingStore((state) => state.clearAgentPromptDismissal);
}

/** @internal — exported only for deterministic route-remount tests. */
export function resetTradingOnboardingStore(): void {
	useTradingOnboardingStore.setState({ dismissedAgentPrompts: new Set() });
}
