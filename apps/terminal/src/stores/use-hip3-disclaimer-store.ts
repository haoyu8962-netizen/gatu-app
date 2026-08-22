import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/config/app";
import { HIP3_DISCLAIMER_VERSION } from "@/config/hip3-deployers";
import { createValidatedStorage } from "@/lib/storage/validated-storage";

const hip3DisclaimerStoreSchema = z.object({
	state: z.object({
		acceptedVersion: z.number().int().nonnegative().optional(),
	}),
});

const validatedStorage = createValidatedStorage(hip3DisclaimerStoreSchema, "HIP-3 disclaimer store");

interface Hip3DisclaimerStore {
	acceptedVersion: number;
	actions: {
		accept: () => void;
	};
}

const useHip3DisclaimerStore = create<Hip3DisclaimerStore>()(
	persist(
		(set) => ({
			acceptedVersion: 0,
			actions: {
				accept: () => set({ acceptedVersion: HIP3_DISCLAIMER_VERSION }),
			},
		}),
		{
			name: STORAGE_KEYS.HIP3_DISCLAIMER,
			version: 1,
			storage: createJSONStorage(() => validatedStorage),
			partialize: (state) => ({ acceptedVersion: state.acceptedVersion }),
			merge: (persisted, current) => {
				const stored = persisted as Partial<Hip3DisclaimerStore>;
				return {
					...current,
					acceptedVersion:
						typeof stored.acceptedVersion === "number" && Number.isInteger(stored.acceptedVersion)
							? stored.acceptedVersion
							: 0,
				};
			},
		},
	),
);

export function useHasAcceptedHip3Disclaimer(): boolean {
	return useHip3DisclaimerStore((state) => state.acceptedVersion >= HIP3_DISCLAIMER_VERSION);
}

export function hasAcceptedHip3Disclaimer(): boolean {
	return useHip3DisclaimerStore.getState().acceptedVersion >= HIP3_DISCLAIMER_VERSION;
}

export function useHip3DisclaimerActions() {
	return useHip3DisclaimerStore((state) => state.actions);
}
