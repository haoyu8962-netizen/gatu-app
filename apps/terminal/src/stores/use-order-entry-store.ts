import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/config/app";
import { type LimitTif, ORDER_TYPES, type OrderType, SCALE_SKEW_DEFAULT } from "@/config/trade";
import { createValidatedStorage } from "@/lib/storage/validated-storage";
import { isScaleOrderType, isTriggerOrderType } from "@/lib/trade/order-types";
import type { Side, SizeMode } from "@/lib/trade/types";

interface PersistedState {
	side: Side;
	orderType: OrderType;
	sizeMode: SizeMode;
}

interface FormState {
	size: string;
	limitPrice: string;
	triggerPrice: string;
	scaleStart: string;
	scaleEnd: string;
	scaleLevels: number;
	scaleSkew: string;
	twapMinutes: number;
	twapRandomize: boolean;
	twapTriggerPrice: string;
	twapStopPrice: string;
	reduceOnly: boolean;
	tpSlEnabled: boolean;
	tpPrice: string;
	slPrice: string;
	tpReturnInvalid: boolean;
	slReturnInvalid: boolean;
	tif: LimitTif;
}

export interface OrderEntryDraftResetToken {
	marketIdentity: string | null;
	draftRevision: number;
}

interface OrderEntryActions {
	setSide: (side: Side) => void;
	setOrderType: (orderType: OrderType) => void;
	setSizeMode: (mode: SizeMode) => void;
	toggleSizeMode: () => void;

	setSize: (size: string) => void;
	setLimitPrice: (price: string) => void;
	setLimitPriceFromPrefill: (identity: string, price: string) => void;
	setLimitPriceFromUser: (identity: string, price: string) => void;
	setTriggerPrice: (price: string) => void;
	setScaleStart: (price: string) => void;
	setScaleEnd: (price: string) => void;
	setScaleLevels: (levels: number) => void;
	setScaleSkew: (skew: string) => void;
	setTwapMinutes: (minutes: number) => void;
	setTwapRandomize: (randomize: boolean) => void;
	setTwapTriggerPrice: (price: string) => void;
	setTwapStopPrice: (price: string) => void;
	setReduceOnly: (reduceOnly: boolean) => void;
	setTpSlEnabled: (enabled: boolean) => void;
	setTpPrice: (price: string) => void;
	setSlPrice: (price: string) => void;
	setTpReturnInvalid: (invalid: boolean) => void;
	setSlReturnInvalid: (invalid: boolean) => void;
	setTif: (tif: LimitTif) => void;

	resetForm: () => void;
	markDraftEdited: () => void;
	resetFormForMarket: (identity: string) => void;
	resetFormIfCurrent: (token: OrderEntryDraftResetToken) => boolean;
	resetPrices: () => void;
}

interface OrderEntryFormStore extends FormState {
	marketIdentity: string | null;
	draftRevision: number;
	limitPricePrefillIdentity: string | null;
	actions: OrderEntryActions;
}

const DEFAULT_PERSISTED: PersistedState = {
	side: "buy",
	orderType: "market",
	sizeMode: "base",
};

const DEFAULT_FORM: FormState = {
	size: "",
	limitPrice: "",
	triggerPrice: "",
	scaleStart: "",
	scaleEnd: "",
	scaleLevels: 4,
	scaleSkew: String(SCALE_SKEW_DEFAULT),
	twapMinutes: 30,
	twapRandomize: true,
	twapTriggerPrice: "",
	twapStopPrice: "",
	reduceOnly: false,
	tpSlEnabled: false,
	tpPrice: "",
	slPrice: "",
	tpReturnInvalid: false,
	slReturnInvalid: false,
	tif: "Gtc",
};

const orderEntrySchema = z.object({
	state: z.object({
		side: z.enum(["buy", "sell"]).optional(),
		orderType: z.enum(ORDER_TYPES).optional(),
		sizeMode: z.enum(["base", "quote"]).optional(),
	}),
});

const validatedStorage = createValidatedStorage(orderEntrySchema, "order entry");

// Keep the persisted preferences in their own store. Zustand's persist middleware
// writes after every set(), even when partialize() drops the changed field. Keeping
// transient form input out of this store prevents pointer/input events from doing
// synchronous localStorage work while preserving the existing persisted payload.
const usePersistedOrderEntryStore = create<PersistedState>()(
	persist(() => ({ ...DEFAULT_PERSISTED }), {
		name: STORAGE_KEYS.ORDER_ENTRY,
		version: 2,
		storage: createJSONStorage(() => validatedStorage),
		partialize: (state) => ({
			side: state.side,
			orderType: state.orderType,
			sizeMode: state.sizeMode,
		}),
		merge: (persisted, current) => ({
			...current,
			...DEFAULT_PERSISTED,
			...(persisted as Partial<PersistedState>),
		}),
	}),
);

const useOrderEntryFormStore = create<OrderEntryFormStore>()((rawSet) => {
	type Patch = Partial<Omit<OrderEntryFormStore, "actions">>;
	function set(patch: Patch | ((state: OrderEntryFormStore) => Patch)) {
		rawSet((state) => {
			const next = typeof patch === "function" ? patch(state) : patch;
			if (!Object.entries(next).some(([key, value]) => !Object.is(state[key as keyof OrderEntryFormStore], value)))
				return state;
			return { ...next, draftRevision: state.draftRevision + 1 };
		});
	}
	function setPreferences(patch: Partial<PersistedState>) {
		const previous = usePersistedOrderEntryStore.getState();
		if (!Object.entries(patch).some(([key, value]) => previous[key as keyof PersistedState] !== value)) return;
		rawSet((state) => ({ draftRevision: state.draftRevision + 1 }));
		usePersistedOrderEntryStore.setState(patch);
	}
	return {
		...DEFAULT_FORM,
		marketIdentity: null,
		draftRevision: 0,
		limitPricePrefillIdentity: null,

		actions: {
			setSide: (side) => {
				set({ tpReturnInvalid: false, slReturnInvalid: false });
				setPreferences({ side });
			},

			setOrderType: (orderType) => {
				const isTrigger = isTriggerOrderType(orderType);
				const isScale = isScaleOrderType(orderType);
				const orderTypeChanged = usePersistedOrderEntryStore.getState().orderType !== orderType;

				set((state) => {
					const needsTifReset = isScale && state.tif === "Ioc";
					return {
						// Only an explicit type change starts another prefill opportunity;
						// surface visibility and remounts keep the current consumption.
						limitPricePrefillIdentity: orderTypeChanged ? null : state.limitPricePrefillIdentity,
						tpSlEnabled: isTrigger ? false : state.tpSlEnabled,
						tpReturnInvalid: isTrigger ? false : state.tpReturnInvalid,
						slReturnInvalid: isTrigger ? false : state.slReturnInvalid,
						tif: needsTifReset ? "Gtc" : state.tif,
					};
				});
				setPreferences({ orderType });
			},

			setSizeMode: (sizeMode) => setPreferences({ sizeMode }),

			toggleSizeMode: () => {
				const { sizeMode } = usePersistedOrderEntryStore.getState();
				setPreferences({ sizeMode: sizeMode === "base" ? "quote" : "base" });
			},

			setSize: (size) => set({ size }),
			setLimitPrice: (limitPrice) => set({ limitPrice }),
			setLimitPriceFromPrefill: (identity, limitPrice) =>
				set((state) => {
					if (state.limitPricePrefillIdentity === identity) return state;
					return {
						limitPrice: state.limitPrice === "" ? limitPrice : state.limitPrice,
						limitPricePrefillIdentity: identity,
					};
				}),
			setLimitPriceFromUser: (identity, limitPrice) =>
				set({
					limitPrice,
					limitPricePrefillIdentity: identity,
				}),
			setTriggerPrice: (triggerPrice) => set({ triggerPrice }),
			setScaleStart: (scaleStart) => set({ scaleStart }),
			setScaleEnd: (scaleEnd) => set({ scaleEnd }),
			setScaleLevels: (scaleLevels) => set({ scaleLevels }),
			setScaleSkew: (scaleSkew) => set({ scaleSkew }),
			setTwapMinutes: (twapMinutes) => set({ twapMinutes }),
			setTwapRandomize: (twapRandomize) => set({ twapRandomize }),
			setTwapTriggerPrice: (twapTriggerPrice) => set({ twapTriggerPrice }),
			setTwapStopPrice: (twapStopPrice) => set({ twapStopPrice }),
			setReduceOnly: (reduceOnly) => set({ reduceOnly }),
			setTpSlEnabled: (tpSlEnabled) =>
				set((state) => ({
					tpSlEnabled,
					tpReturnInvalid: tpSlEnabled ? state.tpReturnInvalid : false,
					slReturnInvalid: tpSlEnabled ? state.slReturnInvalid : false,
				})),
			setTpPrice: (tpPrice) => set({ tpPrice, tpReturnInvalid: false }),
			setSlPrice: (slPrice) => set({ slPrice, slReturnInvalid: false }),
			setTpReturnInvalid: (tpReturnInvalid) => set({ tpReturnInvalid }),
			setSlReturnInvalid: (slReturnInvalid) => set({ slReturnInvalid }),
			setTif: (tif) => set({ tif }),

			resetForm: () => rawSet((state) => ({ ...DEFAULT_FORM, draftRevision: state.draftRevision + 1 })),
			markDraftEdited: () => rawSet((state) => ({ draftRevision: state.draftRevision + 1 })),
			resetFormForMarket: (marketIdentity) =>
				set((state) =>
					state.marketIdentity === marketIdentity
						? state
						: {
								...DEFAULT_FORM,
								marketIdentity,
								limitPricePrefillIdentity: null,
							},
				),
			resetFormIfCurrent: (token) => {
				let reset = false;
				rawSet((state) => {
					if (state.marketIdentity !== token.marketIdentity || state.draftRevision !== token.draftRevision)
						return state;
					reset = true;
					return { ...DEFAULT_FORM, draftRevision: state.draftRevision + 1 };
				});
				return reset;
			},

			resetPrices: () =>
				set({
					limitPrice: "",
					triggerPrice: "",
					scaleStart: "",
					scaleEnd: "",
					twapTriggerPrice: "",
					twapStopPrice: "",
					tpPrice: "",
					slPrice: "",
					tpReturnInvalid: false,
					slReturnInvalid: false,
				}),
		},
	};
});

export function getOrderEntryDraftResetToken(): OrderEntryDraftResetToken {
	const { marketIdentity, draftRevision } = useOrderEntryFormStore.getState();
	return { marketIdentity, draftRevision };
}

export function useOrderEntryMarketIdentity() {
	return useOrderEntryFormStore((state) => state.marketIdentity);
}

export function useOrderSide() {
	return usePersistedOrderEntryStore((s) => s.side);
}
export function useOrderType() {
	return usePersistedOrderEntryStore((s) => s.orderType);
}
export function useSizeMode() {
	return usePersistedOrderEntryStore((s) => s.sizeMode);
}
export function useReduceOnly() {
	return useOrderEntryFormStore((s) => s.reduceOnly);
}

export function useOrderSize() {
	return useOrderEntryFormStore((s) => s.size);
}
export function useLimitPrice() {
	return useOrderEntryFormStore((s) => s.limitPrice);
}
export function useTriggerPrice() {
	return useOrderEntryFormStore((s) => s.triggerPrice);
}

export function useScaleStart() {
	return useOrderEntryFormStore((s) => s.scaleStart);
}
export function useScaleEnd() {
	return useOrderEntryFormStore((s) => s.scaleEnd);
}
export function useScaleLevels() {
	return useOrderEntryFormStore((s) => s.scaleLevels);
}
export function useScaleSkew() {
	return useOrderEntryFormStore((s) => s.scaleSkew);
}

export function useTwapMinutes() {
	return useOrderEntryFormStore((s) => s.twapMinutes);
}
export function useTwapRandomize() {
	return useOrderEntryFormStore((s) => s.twapRandomize);
}
export function useTwapTriggerPrice() {
	return useOrderEntryFormStore((s) => s.twapTriggerPrice);
}
export function useTwapStopPrice() {
	return useOrderEntryFormStore((s) => s.twapStopPrice);
}

export function useTpSlEnabled() {
	return useOrderEntryFormStore((s) => s.tpSlEnabled);
}
export function useTpPrice() {
	return useOrderEntryFormStore((s) => s.tpPrice);
}
export function useSlPrice() {
	return useOrderEntryFormStore((s) => s.slPrice);
}
export function useTpReturnInvalid() {
	return useOrderEntryFormStore((s) => s.tpReturnInvalid);
}
export function useSlReturnInvalid() {
	return useOrderEntryFormStore((s) => s.slReturnInvalid);
}
export function useTpSlReturnInvalid() {
	return useOrderEntryFormStore((s) => s.tpReturnInvalid || s.slReturnInvalid);
}

export function useTif() {
	return useOrderEntryFormStore((s) => s.tif);
}

export function useOrderEntryActions() {
	return useOrderEntryFormStore((s) => s.actions);
}
