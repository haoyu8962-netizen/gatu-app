export const ACCOUNT_HISTORY_PAGE_SIZES = [5, 10, 25, 50] as const;
export const DEFAULT_ACCOUNT_HISTORY_PAGE_SIZE = 25;

export type AccountHistoryPageSize = (typeof ACCOUNT_HISTORY_PAGE_SIZES)[number];

export interface AccountHistoryPage<T> {
	currentPage: number;
	endIndex: number;
	rows: T[];
	startIndex: number;
	totalPages: number;
}

const ACCOUNT_HISTORY_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isAccountHistoryAddress(value: unknown): value is `0x${string}` {
	return typeof value === "string" && ACCOUNT_HISTORY_ADDRESS_PATTERN.test(value);
}

export function isAccountHistoryPageSize(value: number): value is AccountHistoryPageSize {
	return ACCOUNT_HISTORY_PAGE_SIZES.some((pageSize) => pageSize === value);
}

export function getAccountHistoryPage<T>(
	items: readonly T[],
	requestedPage: number,
	pageSize: AccountHistoryPageSize,
): AccountHistoryPage<T> {
	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const normalizedPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
	const currentPage = Math.min(Math.max(normalizedPage, 1), totalPages);
	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, items.length);

	return {
		currentPage,
		endIndex,
		rows: items.slice(startIndex, endIndex),
		startIndex,
		totalPages,
	};
}
