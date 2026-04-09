import { registerOverlay } from "klinecharts";
import { colorToHex, colorToRgba, getChartColors } from "@/components/trade/chart/theme-colors";

const ORDER_LINE_NAME = "orderLine";

let registered = false;

export function registerOrderLineOverlay() {
	if (registered) return;
	registered = true;

	registerOverlay({
		name: ORDER_LINE_NAME,
		needDefaultPointFigure: false,
		needDefaultXAxisFigure: false,
		needDefaultYAxisFigure: false,
		totalStep: 1,
		lock: true,
		zLevel: -1,
		createPointFigures: ({ overlay, coordinates, bounding }) => {
			const y = coordinates[0]?.y;
			if (y === undefined) return [];

			const side = overlay.extendData?.side as "B" | "A" | undefined;
			const label = (overlay.extendData?.label as string | undefined) ?? "";

			const colors = getChartColors();
			const marketColor = side === "B" ? colors.green : colors.red;
			const color = colorToHex(marketColor);
			const lineColor = colorToRgba(marketColor, 0.35);
			const bgColor = colorToHex(colors.background);
			const borderColor = colorToRgba(marketColor, 0.7);

			const textX = bounding.width - 52;

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
						x: textX,
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
			];
		},
	});
}

export { ORDER_LINE_NAME };
