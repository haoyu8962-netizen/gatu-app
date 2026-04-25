import { SHORT_MONTHS } from "@/config/chart";

export function formatShortDate(date: Date): string {
	return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatTime(date: Date): string {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatTooltipDate(date: Date): string {
	const m = date.getMonth() + 1;
	const d = date.getDate();
	const y = String(date.getFullYear()).slice(2);
	return `${m}/${d}/${y} ${formatTime(date)}`;
}
