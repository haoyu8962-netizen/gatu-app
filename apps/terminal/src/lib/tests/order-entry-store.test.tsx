// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import {
	getOrderEntryDraftResetToken,
	useOrderEntryActions as useActions,
	useLimitPrice,
	useOrderType,
	useReduceOnly,
	useScaleSkew,
	useTif,
	useTpSlEnabled,
	useTpSlReturnInvalid,
	useTwapAdvancedEnabled,
	useTwapStopPrice,
	useTwapTriggerPrice,
} from "@/stores/use-order-entry-store";

type OrderEntryActions = ReturnType<typeof useActions>;

describe("order entry store persistence", () => {
	let actions: OrderEntryActions;
	let container: HTMLDivElement;
	let root: Root;
	let setItemSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		function ActionsProbe() {
			actions = useActions();
			return null;
		}

		act(() => root.render(createElement(ActionsProbe)));
		act(() => {
			actions.setSide("buy");
			actions.setOrderType("market");
			actions.setSizeMode("base");
			actions.resetForm();
		});
		localStorage.clear();
		setItemSpy = vi.spyOn(Storage.prototype, "setItem");
	});

	afterEach(() => {
		setItemSpy.mockRestore();
		act(() => root.unmount());
		container.remove();
		localStorage.clear();
	});

	it("does not write storage when transient order inputs change", () => {
		act(() => {
			for (let step = 0; step < 250; step += 1) actions.setSize(String(step / 10));
			actions.setLimitPrice("100");
			actions.setTriggerPrice("99");
			actions.setScaleStart("98");
			actions.setScaleEnd("102");
			actions.setScaleLevels(5);
			actions.setScaleSkew("2");
			actions.setTwapMinutes(60);
			actions.setTwapRandomize(false);
			actions.setTwapAdvancedEnabled(true);
			actions.setTwapTriggerPrice("101");
			actions.setTwapStopPrice("103");
			actions.setReduceOnly(true);
			actions.setTpSlEnabled(true);
			actions.setTpPrice("110");
			actions.setSlPrice("90");
			actions.setTif("Ioc");
			actions.resetPrices();
			actions.resetForm();
		});

		expect(setItemSpy).not.toHaveBeenCalled();
		expect(localStorage.getItem(STORAGE_KEYS.ORDER_ENTRY)).toBeNull();
	});

	it("rejects stale reset tokens after edits and an A-B-A market cycle", () => {
		act(() => actions.resetFormForMarket("mainnet:BTC"));
		const original = getOrderEntryDraftResetToken();
		if (!original) throw new Error("Missing draft token");
		act(() => actions.setSize("2"));
		expect(actions.resetFormIfCurrent(original)).toBe(false);
		const edited = getOrderEntryDraftResetToken();
		if (!edited) throw new Error("Missing edited token");
		act(() => {
			actions.resetFormForMarket("mainnet:ETH");
			actions.resetFormForMarket("mainnet:BTC");
		});
		expect(actions.resetFormIfCurrent(edited)).toBe(false);
		const current = getOrderEntryDraftResetToken();
		if (!current) throw new Error("Missing current token");
		expect(actions.resetFormIfCurrent(current)).toBe(true);
		expect(actions.resetFormIfCurrent(current)).toBe(false);
	});

	it("keeps a manually cleared limit price empty after remount and successful reset", () => {
		let limitPrice = "";
		function PriceProbe() {
			limitPrice = useLimitPrice();
			return null;
		}
		act(() => {
			actions.resetFormForMarket("mainnet:BTC");
			root.render(createElement(PriceProbe));
			actions.setLimitPriceFromPrefill("BTC|limit", "100");
		});
		expect(limitPrice).toBe("100");
		act(() => actions.setLimitPriceFromUser("BTC|limit", ""));
		act(() => root.render(null));
		act(() => root.render(createElement(PriceProbe)));
		act(() => {
			actions.setLimitPriceFromPrefill("BTC|limit", "101");
			actions.resetForm();
			actions.setLimitPriceFromPrefill("BTC|limit", "102");
		});
		expect(limitPrice).toBe("");
	});

	it("continues to persist only side, order type, and size mode", () => {
		act(() => {
			actions.setSide("sell");
			actions.setOrderType("limit");
			actions.setSizeMode("quote");
		});

		expect(setItemSpy).toHaveBeenCalledTimes(3);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDER_ENTRY) ?? "null")).toEqual({
			state: {
				side: "sell",
				orderType: "limit",
				sizeMode: "quote",
			},
			version: 2,
		});
	});

	it("keeps TWAP trigger and stop prices transient and clears them with the other prices", () => {
		let snapshot: { twapTriggerPrice: string; twapStopPrice: string } | undefined;

		function StateProbe() {
			snapshot = { twapTriggerPrice: useTwapTriggerPrice(), twapStopPrice: useTwapStopPrice() };
			return null;
		}

		act(() => root.render(createElement(StateProbe)));
		expect(snapshot).toEqual({ twapTriggerPrice: "", twapStopPrice: "" });

		act(() => {
			actions.setTwapTriggerPrice("101.5");
			actions.setTwapStopPrice("103");
		});
		expect(snapshot).toEqual({ twapTriggerPrice: "101.5", twapStopPrice: "103" });

		act(() => actions.resetPrices());
		expect(snapshot).toEqual({ twapTriggerPrice: "", twapStopPrice: "" });

		act(() => {
			actions.setTwapTriggerPrice("99");
			actions.setTwapStopPrice("97");
		});
		act(() => actions.resetForm());
		expect(snapshot).toEqual({ twapTriggerPrice: "", twapStopPrice: "" });
		expect(setItemSpy).not.toHaveBeenCalled();
	});

	it("retains disabled TWAP drafts across tabs and resets their activation with the market or form", () => {
		let snapshot: { enabled: boolean; trigger: string; stop: string } | undefined;
		function Probe() {
			snapshot = { enabled: useTwapAdvancedEnabled(), trigger: useTwapTriggerPrice(), stop: useTwapStopPrice() };
			return null;
		}
		act(() => root.render(createElement(Probe)));
		expect(snapshot).toEqual({ enabled: false, trigger: "", stop: "" });
		act(() => {
			actions.setOrderType("twap");
			actions.setTwapAdvancedEnabled(true);
			actions.setTwapTriggerPrice("105");
			actions.setTwapStopPrice("110");
		});
		const token = getOrderEntryDraftResetToken();
		act(() => actions.setTwapAdvancedEnabled(false));
		expect(actions.resetFormIfCurrent(token)).toBe(false);
		act(() => {
			actions.setOrderType("limit");
			actions.setOrderType("twap");
		});
		expect(snapshot).toEqual({ enabled: false, trigger: "105", stop: "110" });
		act(() => actions.setTwapAdvancedEnabled(true));
		expect(snapshot).toEqual({ enabled: true, trigger: "105", stop: "110" });
		act(() => actions.resetFormForMarket("mainnet:twap:ETH"));
		expect(snapshot).toEqual({ enabled: false, trigger: "", stop: "" });
		act(() => {
			actions.setTwapAdvancedEnabled(true);
			actions.setTwapStopPrice("110");
		});
		act(() => actions.resetFormIfCurrent(getOrderEntryDraftResetToken()));
		expect(snapshot).toEqual({ enabled: false, trigger: "", stop: "" });
	});

	it("clears linked TP/SL amount errors when their price or form state resets", () => {
		let returnInvalid: boolean | undefined;

		function StateProbe() {
			returnInvalid = useTpSlReturnInvalid();
			return null;
		}

		act(() => root.render(createElement(StateProbe)));
		expect(returnInvalid).toBe(false);

		act(() => {
			actions.setTpSlEnabled(true);
			actions.setTpReturnInvalid(true);
		});
		expect(returnInvalid).toBe(true);

		act(() => actions.setTpPrice("110"));
		expect(returnInvalid).toBe(false);

		act(() => actions.setSlReturnInvalid(true));
		expect(returnInvalid).toBe(true);
		act(() => actions.resetPrices());
		expect(returnInvalid).toBe(false);

		act(() => actions.setSlReturnInvalid(true));
		act(() => actions.setTpSlEnabled(false));
		expect(returnInvalid).toBe(false);

		act(() => {
			actions.setTpReturnInvalid(true);
			actions.setSide("sell");
		});
		expect(returnInvalid).toBe(false);
		act(() => actions.setSide("buy"));
	});

	it("keeps the scale skew transient, untouched by price resets, and restored by resetForm", () => {
		let snapshot: string | undefined;

		function StateProbe() {
			snapshot = useScaleSkew();
			return null;
		}

		act(() => root.render(createElement(StateProbe)));
		expect(snapshot).toBe("1");

		act(() => actions.setScaleSkew("2.5"));
		expect(snapshot).toBe("2.5");

		act(() => actions.resetPrices());
		expect(snapshot).toBe("2.5");

		act(() => actions.resetForm());
		expect(snapshot).toBe("1");
		expect(setItemSpy).not.toHaveBeenCalled();
	});

	it("preserves order-type-dependent transient resets", () => {
		let snapshot: { orderType: string; reduceOnly: boolean; tpSlEnabled: boolean; tif: string } | undefined;

		function StateProbe() {
			snapshot = {
				orderType: useOrderType(),
				reduceOnly: useReduceOnly(),
				tpSlEnabled: useTpSlEnabled(),
				tif: useTif(),
			};
			return null;
		}

		act(() => root.render(createElement(StateProbe)));
		act(() => {
			actions.setTpSlEnabled(true);
			actions.setTif("Ioc");
			actions.setOrderType("stopMarket");
		});
		expect(snapshot).toEqual({ orderType: "stopMarket", reduceOnly: false, tpSlEnabled: false, tif: "Ioc" });

		act(() => actions.setReduceOnly(true));
		act(() => actions.setOrderType("market"));
		expect(snapshot).toEqual({ orderType: "market", reduceOnly: true, tpSlEnabled: false, tif: "Ioc" });

		act(() => actions.setOrderType("scale"));
		expect(snapshot).toEqual({ orderType: "scale", reduceOnly: true, tpSlEnabled: false, tif: "Gtc" });
	});

	it("leaves reduce-only under user control when switching to and from trigger order types", () => {
		let snapshot: { orderType: string; reduceOnly: boolean } | undefined;

		function StateProbe() {
			snapshot = { orderType: useOrderType(), reduceOnly: useReduceOnly() };
			return null;
		}

		act(() => root.render(createElement(StateProbe)));
		act(() => actions.setOrderType("stopMarket"));
		expect(snapshot).toEqual({ orderType: "stopMarket", reduceOnly: false });

		act(() => actions.setReduceOnly(true));
		act(() => actions.setOrderType("takeProfitLimit"));
		expect(snapshot).toEqual({ orderType: "takeProfitLimit", reduceOnly: true });

		act(() => actions.setReduceOnly(false));
		act(() => actions.setOrderType("limit"));
		expect(snapshot).toEqual({ orderType: "limit", reduceOnly: false });
	});

	it("keeps order-type-dependent state coherent when persistence throws", () => {
		let snapshot: { orderType: string; reduceOnly: boolean; tpSlEnabled: boolean } | undefined;

		function StateProbe() {
			snapshot = {
				orderType: useOrderType(),
				reduceOnly: useReduceOnly(),
				tpSlEnabled: useTpSlEnabled(),
			};
			return null;
		}

		act(() => root.render(createElement(StateProbe)));
		act(() => actions.setTpSlEnabled(true));
		setItemSpy.mockImplementationOnce(() => {
			throw new DOMException("storage unavailable", "QuotaExceededError");
		});

		let storageError: unknown;
		act(() => {
			try {
				actions.setOrderType("stopMarket");
			} catch (error) {
				storageError = error;
			}
		});
		expect(storageError).toBeInstanceOf(DOMException);
		expect(snapshot).toEqual({ orderType: "stopMarket", reduceOnly: false, tpSlEnabled: false });
	});
});
