export function isSafeHttpUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}
