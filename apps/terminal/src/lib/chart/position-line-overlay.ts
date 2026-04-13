import { registerOverlay } from "klinecharts";
import { colorToHex, colorToRgba, getChartColors } from "@/components/trade/chart/theme-colors";

const POSITION_LINE_NAME = "positionLine";

let registered = false;

export function registerPositionLineOverlay() {
	if (registered) return;
	registered = true;

	registerOverlay({
		name: POSITION_LINE_NAME,
		needDefaultPointFigure: false,
		needDefaultXAxisFigure: false,
		needDefaultYAxisFigure: false,
		totalStep: 1,
		lock: true,
		zLevel: -1,
		createPointFigures: ({ overlay, coordinates, bounding, precision }) => {
			const y = coordinates[0]?.y;
			if (y === undefined) return [];

			const isLong = overlay.extendData?.isLong as boolean | undefined;

			const colors = getChartColors();
			const marketColor = isLong ? colors.green : colors.red;
			const color = colorToHex(marketColor);
			const lineColor = colorToRgba(marketColor, 0.5);
			const bgColor = colorToHex(colors.background);
			const borderColor = colorToRgba(marketColor, 0.8);

			const label = isLong ? "Long" : "Short";
			const rawPrice = overlay.points[0]?.value;
			const priceText = rawPrice != null ? Number(rawPrice).toFixed(precision.price) : "";

			const badgeX = bounding.width - 110;
			const priceX = bounding.width - 4;

			return [
				{
					type: "line",
					attrs: {
						coordinates: [
							{ x: 0, y },
							{ x: bounding.width, y },
						],
					},
					styles: { style: "dashed" as const, color: lineColor, size: 1, dashedValue: [4, 3] },
					ignoreEvent: true,
				},
				{
					type: "text",
					attrs: {
						x: badgeX,
						y,
						text: label,
						align: "center",
						baseline: "middle",
					},
					styles: {
						color,
						size: 10,
						paddingLeft: 6,
						paddingRight: 6,
						paddingTop: 3,
						paddingBottom: 3,
						backgroundColor: bgColor,
						borderColor,
						borderSize: 1,
						borderRadius: 3,
						style: "stroke_fill" as const,
					},
					ignoreEvent: true,
				},
				{
					type: "text",
					attrs: {
						x: priceX,
						y,
						text: priceText,
						align: "right",
						baseline: "middle",
					},
					styles: {
						color,
						size: 10,
						paddingLeft: 4,
						paddingRight: 4,
						paddingTop: 2,
						paddingBottom: 2,
						backgroundColor: bgColor,
						borderColor,
						borderSize: 1,
						borderRadius: 2,
						style: "stroke_fill" as const,
					},
					ignoreEvent: true,
				},
			];
		},
	});
}

export { POSITION_LINE_NAME };
