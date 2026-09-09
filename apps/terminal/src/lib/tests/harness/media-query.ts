import { vi } from "vitest";

export function stubReducedMotion(initial = false) {
	let reducedMotion = initial;
	const queries = new Map<string, MediaQueryList>();
	vi.stubGlobal(
		"matchMedia",
		vi.fn((media: string) => {
			const existing = queries.get(media);
			if (existing) return existing;
			const query = Object.assign(new EventTarget(), {
				media,
				matches: initial,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
			}) as MediaQueryList;
			Object.defineProperty(query, "matches", {
				get: () => media === "(prefers-reduced-motion: reduce)" && reducedMotion,
			});
			queries.set(media, query);
			return query;
		}),
	);
	return {
		setReducedMotion(next: boolean) {
			if (next === reducedMotion) return;
			reducedMotion = next;
			queries.get("(prefers-reduced-motion: reduce)")?.dispatchEvent(new Event("change"));
		},
	};
}
