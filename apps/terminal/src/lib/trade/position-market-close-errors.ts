import { t } from "@lingui/core/macro";

export function getPositionMarketCloseErrorMessage(error: string): string {
	switch (error) {
		case "Close percentage must be a decimal number":
			return t`Close percentage must be a decimal number`;
		case "Close percentage must be between 0 and 100":
			return t`Close percentage must be between 0 and 100`;
		case "Close size exceeds current position":
			return t`Close size exceeds current position`;
		case "Close size is below market precision":
			return t`Close size is below market precision`;
		case "Close size must be a decimal number":
			return t`Close size must be a decimal number`;
		case "Close size must be greater than zero":
			return t`Close size must be greater than zero`;
		case "Position size is below market precision":
			return t`Position size is below market precision`;
		case "Position size must be a non-zero number":
			return t`Position size must be a non-zero number`;
		case "Size precision must be a non-negative integer":
			return t`Size precision must be a non-negative integer`;
		default:
			return error;
	}
}
