import { msg } from "@lingui/core/macro";
import type { Translate } from "@/lib/translate";

export function getPositionMarketCloseErrorMessage(error: string, translate: Translate): string {
	switch (error) {
		case "Close percentage must be a decimal number":
			return translate(msg`Close percentage must be a decimal number`);
		case "Close percentage must be between 0 and 100":
			return translate(msg`Close percentage must be between 0 and 100`);
		case "Close size exceeds current position":
			return translate(msg`Close size exceeds current position`);
		case "Close size is below market precision":
			return translate(msg`Close size is below market precision`);
		case "Close size must be a decimal number":
			return translate(msg`Close size must be a decimal number`);
		case "Close size must be greater than zero":
			return translate(msg`Close size must be greater than zero`);
		case "Position size is below market precision":
			return translate(msg`Position size is below market precision`);
		case "Position size must be a non-zero number":
			return translate(msg`Position size must be a non-zero number`);
		case "Size precision must be a non-negative integer":
			return translate(msg`Size precision must be a non-negative integer`);
		default:
			return error;
	}
}
