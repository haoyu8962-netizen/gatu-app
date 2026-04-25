export function extractStatusErrors(statuses: unknown[]): string[] {
	const errors: string[] = [];
	for (const status of statuses) {
		if (status && typeof status === "object" && "error" in status && typeof status.error === "string") {
			errors.push(status.error);
		}
	}
	return errors;
}
