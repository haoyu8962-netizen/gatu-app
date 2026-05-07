import type { ZodType } from "zod";
import type { StateStorage } from "zustand/middleware";

const canUseLocalStorage = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export function createValidatedStorage<T>(schema: ZodType<T>, label: string): StateStorage {
	return {
		getItem: (name: string): string | null => {
			if (!canUseLocalStorage) return null;
			const item = localStorage.getItem(name);
			if (!item) return null;

			try {
				const parsed = JSON.parse(item);
				const validationResult = schema.safeParse(parsed);

				if (!validationResult.success) {
					console.warn(`[${label}] persisted state failed schema validation, clearing`, validationResult.error.issues);
					localStorage.removeItem(name);
					return null;
				}

				return item;
			} catch (err) {
				console.warn(`[${label}] persisted state could not be parsed, clearing`, err);
				localStorage.removeItem(name);
				return null;
			}
		},
		setItem: (name: string, value: string): void => {
			if (!canUseLocalStorage) return;
			localStorage.setItem(name, value);
		},
		removeItem: (name: string): void => {
			if (!canUseLocalStorage) return;
			localStorage.removeItem(name);
		},
	};
}
