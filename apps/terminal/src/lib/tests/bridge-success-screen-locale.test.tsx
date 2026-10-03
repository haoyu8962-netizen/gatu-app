// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SuccessScreen } from "@/components/trade/tradebox/bridge/success-screen";
import { formatDateTimeShort } from "@/lib/format";
import { createI18nRoot } from "./harness/react";

const STARTED_AT = new Date(2026, 9, 2, 14, 31).getTime();
const DONE_AT = new Date(2026, 9, 2, 14, 33).getTime();

describe("bridge success screen dates", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
	});

	it("rewrites the submitted and filled times in the active language in the same open details", () => {
		act(() =>
			root.render(
				<SuccessScreen
					address={`0x${"a".repeat(40)}`}
					receivedAmount="12.5"
					txHash={null}
					startTime={STARTED_AT}
					endTime={DONE_AT}
					processDetails={[
						{ type: "CROSS_CHAIN", txHash: `0x${"b".repeat(64)}`, txLink: "", startedAt: STARTED_AT, doneAt: DONE_AT },
					]}
					onDone={() => {}}
					onNewDeposit={() => {}}
				/>,
			),
		);
		const trigger = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("More details"),
		);
		act(() => trigger?.click());
		const values = [...container.querySelectorAll('[data-slot="info-row-value"]')];
		const timeValues = [STARTED_AT, DONE_AT].map((time) =>
			values.find((value) => value.textContent === formatDateTimeShort(time, { locale: "en" })),
		);
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(timeValues.every((value) => value !== undefined)).toBe(true);

		act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));

		expect(trigger?.isConnected).toBe(true);
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(timeValues.map((value) => value?.isConnected)).toEqual([true, true]);
		expect(timeValues.map((value) => value?.textContent)).toEqual([
			formatDateTimeShort(STARTED_AT, { locale: "zh" }),
			formatDateTimeShort(DONE_AT, { locale: "zh" }),
		]);
		expect(formatDateTimeShort(STARTED_AT, { locale: "zh" })).not.toBe(
			formatDateTimeShort(STARTED_AT, { locale: "en" }),
		);
	});
});
