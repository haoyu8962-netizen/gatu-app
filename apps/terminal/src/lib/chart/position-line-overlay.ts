import { createLineOverlay } from "./create-line-overlay";

export const POSITION_LINE_NAME = "positionLine";

export const registerPositionLineOverlay = createLineOverlay({
	name: POSITION_LINE_NAME,
	style: { lineAlpha: 0.5, borderAlpha: 0.8 },
	resolve: ({ extendData }) => {
		const data = extendData as { isLong?: boolean } | undefined;
		const isLong = data?.isLong === true;
		return {
			label: isLong ? "Long" : "Short",
			isBuy: isLong,
		};
	},
});
