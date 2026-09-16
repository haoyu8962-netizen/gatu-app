import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { headerActions } from "@/components/trade/mobile/mobile-header-view";

const LOGICAL_NAVIGATION_SOURCES = [
	"components/funding-history/funding-history-page.tsx",
	"components/historical-orders/historical-orders-page.tsx",
	"components/leaderboard/leaderboard-view.tsx",
	"components/trade-history/trade-history-page.tsx",
	"components/trade/components/mobile-agent-qr-scanner.tsx",
	"components/trade/components/wallet-modal.tsx",
	"components/trade/tradebox/bridge/amount-entry-screen.tsx",
	"components/trade/tradebox/bridge/confirmation-screen.tsx",
	"components/vaults/vault-detail-view.tsx",
] as const;

const HISTORY_PAGE_SOURCES = [
	"components/funding-history/funding-history-page.tsx",
	"components/historical-orders/historical-orders-page.tsx",
	"components/trade-history/trade-history-page.tsx",
] as const;

function readSource(relativePath: string) {
	return readFileSync(resolve(__dirname, "../..", relativePath), "utf8");
}

const LOGICAL_TEXT_TABLE_SOURCES = [
	"components/funding-history/funding-history-page.tsx",
	"components/historical-orders/historical-orders-page.tsx",
	"components/trade-history/trade-history-page.tsx",
	"components/vaults/vault-detail-view.tsx",
	"components/vaults/vaults-list.tsx",
] as const;

const ISOLATED_IDENTITY_FIELDS = [
	["components/api-wallet/api-wallet-view.tsx", '<bdi dir="ltr">{shortenAddress(accountAddress)}</bdi>'],
	["components/leaderboard/leaderboard-view.tsx", '<bdi dir="ltr">{shortenAddress(address, 6, 4)}</bdi>'],
	["components/referrals/referral-claim-history.tsx", '<bdi dir="ltr">{shortenAddress(row.hash, 6, 6)}</bdi>'],
	["components/trade/components/mobile-agent-sync-modal.tsx", '<bdi dir="ltr">{shortenAddress(walletAddress)}</bdi>'],
	["components/trade/market-overview.tsx", '<bdi dir="ltr">{shortenAddress(address, 4, 4)}</bdi>'],
	["components/trade/mobile/mobile-market-bar.tsx", '<bdi dir="ltr">{shortenAddress(address, 4, 4)}</bdi>'],
	["components/trade/tradebox/bridge/executing-screen.tsx", '<bdi dir="ltr">{shortenAddress(address)}</bdi>'],
	["components/trade/tradebox/bridge/success-screen.tsx", '<bdi dir="ltr">{shortenAddress(detail.txHash)}</bdi>'],
] as const;

describe("RTL financial UI contract", () => {
	it.each(LOGICAL_NAVIGATION_SOURCES)("mirrors logical navigation icons in %s", (relativePath) => {
		const source = readSource(relativePath);

		expect(source).toContain("rtl:rotate-180");
	});

	it("isolates every Historical Orders size and every formatted price", () => {
		const pageSource = readSource("components/historical-orders/historical-orders-page.tsx");
		const priceSource = readSource("components/trade/components/historical-order-price.tsx");

		expect(
			pageSource.match(/<bdi dir="ltr">\{formatToken\(entry\.size, market\?\.szDecimals\)\}<\/bdi>/gu),
		).toHaveLength(2);
		expect(priceSource).toContain('<bdi dir="ltr">{formatUSD(display.price, { compact: false })}</bdi>');
		expect(priceSource).toContain('<bdi dir="ltr">{formatUSD(display.triggerPrice, { compact: false })}</bdi>');
		expect(priceSource).toContain('<bdi dir="ltr">{formatUSD(display.protectionPrice, { compact: false })}</bdi>');
		expect(priceSource).toContain('display.execution.kind === "market" ? execution : <bdi dir="ltr">{execution}</bdi>');
	});

	it("isolates Trade History price, size, fee, and PNL values independently", () => {
		const source = readSource("components/trade-history/trade-history-page.tsx");

		expect(source.match(/<bdi dir="ltr">\{formatUSD\(fill\.px\)\}<\/bdi>/gu)).toHaveLength(2);
		expect(
			source.match(/<bdi dir="ltr">\{formatNumber\(fill\.sz, markets\.getSzDecimals\(fill\.coin\)\)\}<\/bdi>/gu),
		).toHaveLength(2);
		expect(source).toContain('<bdi dir="ltr">{formatToken(fill.fee, { symbol: fill.feeToken })}</bdi>');
		expect(source.match(/<bdi dir="ltr">\s*\{closedPnl/gu)).toHaveLength(2);
	});

	it("isolates both Funding position renderings without changing physical numeric alignment", () => {
		const source = readSource("components/funding-history/funding-history-page.tsx");

		expect(
			source.match(
				/<bdi dir="ltr">\s*\{formatToken\(getToolbarAbsoluteSize\(funding\.szi\), \{[\s\S]*?symbol: market\?\.shortName,[\s\S]*?\}\)\}\s*<\/bdi>/gu,
			),
		).toHaveLength(2);
		expect(source.match(/className="[^"]*text-right[^"]*"/gu)?.length).toBeGreaterThan(0);
	});

	it("isolates Staking owner, validator, HYPE, ratio, reward, action, and transaction values", () => {
		const viewSource = readSource("components/staking/staking-view.tsx");
		const modalSource = readSource("components/staking/staking-action-modal.tsx");

		expect(viewSource).toContain('<bdi dir="ltr">{shortenAddress(props.ownerAddress ?? "", 6, 6)}</bdi>');
		expect(viewSource).toContain('<bdi dir="ltr">{shortenAddress(validator.validator)}</bdi>');
		expect(viewSource).toContain('<bdi dir="ltr">{shortenAddress(entry.hash, 6, 6)}</bdi>');
		expect(viewSource).toContain(
			'<bdi dir="ltr">≈ {formatStakingAmount(validator.stakeApproximateHype, 0)} HYPE</bdi>',
		);
		expect(viewSource).toContain('<bdi dir="ltr">{formatStakingAmount(entry.action.amount, 8)} HYPE</bdi>');
		expect(viewSource).toContain('<bdi dir="ltr">{formatStakingRatio(validator.commission)}</bdi>');
		expect(modalSource).toContain('<bdi dir="ltr">{formatStakingAmount(action.maxAmount)} HYPE</bdi>');
		expect(modalSource).toContain('<bdi dir="ltr">{shortenAddress(match.hash, 6, 6)}</bdi>');
		expect(modalSource).toContain('mono || ltr ? <bdi dir="ltr">{value}</bdi> : value');
	});

	it.each(ISOLATED_IDENTITY_FIELDS)("isolates the exact identity field in %s", (relativePath, expectedMarkup) => {
		expect(readSource(relativePath)).toContain(expectedMarkup);
	});

	it("isolates referral amounts and every market metadata value", () => {
		const referralSource = readSource("components/referrals/referral-claim-history.tsx");
		const marketInfoSource = readSource("components/trade/components/market-asset-info.tsx");

		expect(referralSource).toMatch(
			/<bdi dir="ltr">\s*\{formatToken\(row\.amount, \{[\s\S]*?maximumFractionDigits: row\.weiDecimals \?\? 8,[\s\S]*?\}\)\}\s*<\/bdi>/gu,
		);
		expect(marketInfoSource).toContain('<bdi dir="ltr">{row.value}</bdi>');
	});

	it.each(HISTORY_PAGE_SOURCES)("uses logical start spacing for back navigation in %s", (relativePath) => {
		const source = readSource(relativePath);

		expect(source).toContain("-ms-2");
		expect(source).not.toContain("-ml-2");
		expect(source.match(/<bdi dir="ltr">\{shortenAddress\(address, 8, 6\)\}<\/bdi>/g)).toHaveLength(2);
	});

	it("uses logical spacing between mobile header groups", () => {
		const source = readSource("components/trade/mobile/mobile-header-view.tsx");

		expect(source).toContain("headerActions");
		expect(headerActions).toContain("ms-auto");
		expect(headerActions).not.toContain("ml-auto");
		expect(source).not.toContain("ml-auto");
		expect(source).not.toContain("ml-2");
	});

	it.each(LOGICAL_TEXT_TABLE_SOURCES)("uses logical alignment for textual table columns in %s", (relativePath) => {
		const source = readSource(relativePath);

		expect(source).not.toContain("text-left");
	});

	it("isolates Vault addresses from the surrounding RTL paragraph direction", () => {
		const detailSource = readSource("components/vaults/vault-detail-view.tsx");
		const listSource = readSource("components/vaults/vaults-list.tsx");

		expect(detailSource).toContain('<bdi dir="ltr">{detail.vaultAddress}</bdi>');
		expect(detailSource).toContain('<bdi dir="ltr">{shortenAddress(detail.leader)}</bdi>');
		expect(listSource).toContain('<bdi dir="ltr">{shortenAddress(row.leader)}</bdi>');
	});

	it("keeps leaderboard numeric headers physically aligned with their financial values", () => {
		const source = readSource("components/leaderboard/leaderboard-view.tsx");

		expect(source).toContain('<TableHead size="dense" className="text-right"');
		expect(source).toContain('className="ml-auto inline-flex items-center');
		expect(source).toContain('"text-right text-2sm font-semibold tabular-nums whitespace-nowrap"');
		expect(source).not.toContain('<TableHead size="dense" className="text-end"');
	});
});
