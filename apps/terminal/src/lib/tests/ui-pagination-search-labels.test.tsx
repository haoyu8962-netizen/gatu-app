/** @vitest-environment jsdom */

import { Pagination, SearchInput } from "@gatu/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Pagination and SearchInput labels", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function buttonTexts() {
		return [...container.querySelectorAll("button")].map((button) => button.textContent);
	}

	function pageLabels() {
		return [...container.querySelectorAll("button")]
			.map((button) => button.getAttribute("aria-label") ?? "")
			.filter((label) => /\d/.test(label));
	}

	it("keeps the English pagination defaults for package users", () => {
		act(() => root.render(<Pagination currentPage={2} totalPages={3} />));

		expect(buttonTexts()).toEqual(["Previous", "1", "2", "3", "Next"]);
		expect(pageLabels()).toEqual(["Page 1", "Page 2", "Page 3"]);
	});

	it("renders the caller's visible and accessible pagination labels", () => {
		act(() =>
			root.render(
				<Pagination
					currentPage={2}
					totalPages={3}
					previousText="上一页"
					nextText="下一页"
					getPageLabel={(page) => `第 ${page} 页`}
				/>,
			),
		);

		expect(buttonTexts()).toEqual(["上一页", "1", "2", "3", "下一页"]);
		expect(pageLabels()).toEqual(["第 1 页", "第 2 页", "第 3 页"]);
		expect(container.querySelector('[aria-current="page"]')?.getAttribute("aria-label")).toBe("第 2 页");
	});

	it("names the search clear button with the caller's label and keeps the English default", () => {
		act(() => root.render(<SearchInput value="btc" onChange={() => {}} />));
		expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Clear search");

		act(() => root.render(<SearchInput value="btc" onChange={() => {}} clearLabel="清除搜索" />));
		expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("清除搜索");
	});
});
