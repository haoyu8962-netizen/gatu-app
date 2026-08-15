import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist, subscribeWithSelector } from "zustand/middleware";
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
	tif: LimitTif;
}

interface OrderEntryActions {
	setSide: (side: Side) => void;
	setOrderType: (orderType: OrderType) => void;
	setSizeMode: (mode: SizeMode) => void;
	toggleSizeMode: () => void;

	setSize: (size: string) => void;
	setLimitPrice: (price: string) => void;
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
	setTif: (tif: LimitTif) => void;

	resetForm: () => void;
	resetPrices: () => void;
}

interface OrderEntryFormStore extends FormState {
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

const useOrderEntryFormStore = create<OrderEntryFormStore>()(
	subscribeWithSelector((set) => ({
		...DEFAULT_FORM,

		actions: {
			setSide: (side) => usePersistedOrderEntryStore.setState({ side }),

			setOrderType: (orderType) => {
				const isTrigger = isTriggerOrderType(orderType);
				const isScale = isScaleOrderType(orderType);

				set((state) => {
					const needsTifReset = isScale && state.tif === "Ioc";
					return {
						tpSlEnabled: isTrigger ? false : state.tpSlEnabled,
						tif: needsTifReset ? "Gtc" : state.tif,
					};
				});
				usePersistedOrderEntryStore.setState({ orderType });
			},

			setSizeMode: (sizeMode) => usePersistedOrderEntryStore.setState({ sizeMode }),

			toggleSizeMode: () => {
				const { sizeMode } = usePersistedOrderEntryStore.getState();
				usePersistedOrderEntryStore.setState({ sizeMode: sizeMode === "base" ? "quote" : "base" });
			},

			setSize: (size) => set({ size }),
			setLimitPrice: (limitPrice) => set({ limitPrice }),
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
			setTpSlEnabled: (tpSlEnabled) => set({ tpSlEnabled }),
			setTpPrice: (tpPrice) => set({ tpPrice }),
			setSlPrice: (slPrice) => set({ slPrice }),
			setTif: (tif) => set({ tif }),

			resetForm: () => set({ ...DEFAULT_FORM }),

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
				}),
		},
	})),
);

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

export function useTif() {
	return useOrderEntryFormStore((s) => s.tif);
}

export function useOrderEntryActions() {
	return useOrderEntryFormStore((s) => s.actions);
}
