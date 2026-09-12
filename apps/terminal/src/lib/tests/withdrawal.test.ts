import { i18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { ARBITRUM_CCTP_DOMAIN, CCTP_NETWORKS } from "@/config/cctp";
import { getCctpWithdrawalFeeRequest } from "@/hooks/trade/use-cctp-withdrawal-fee";
import {
	buildCctpWithdrawalParameters,
	getMaximumWithdrawal,
	getMinimumWithdrawal,
	getWithdrawalNetReceived,
	getWithdrawalRouteFee,
	getWithdrawalSourceDex,
	isWithdrawalRoute,
	validateWithdrawal,
} from "@/lib/trade/withdrawal";

i18n.loadAndActivate({ locale: "en", messages: {} });

const DESTINATION = "0x1111111111111111111111111111111111111111" as const;

describe("CCTP withdrawal contract", () => {
	it("uses the Arbitrum CCTP domain rather than the EVM chain ID", () => {
		expect(buildCctpWithdrawalParameters({ amount: "10", destination: DESTINATION, sourceDex: "spot" })).toEqual({
			token: "USDC",
			amount: "10",
			sourceDex: "spot",
			destinationRecipient: DESTINATION,
			addressEncoding: "hex",
			destinationChainId: 3,
			gasLimit: 200_000,
			data: "0x",
		});
		expect(ARBITRUM_CCTP_DOMAIN).toBe(3);
		expect(ARBITRUM_CCTP_DOMAIN).not.toBe(42_161);
	});

	it("supports the separate perp source encoding", () => {
		expect(buildCctpWithdrawalParameters({ amount: "5", destination: DESTINATION, sourceDex: "" }).sourceDex).toBe("");
	});

	it("maps shared quote balances to spot and separate perp balances to the default dex", () => {
		expect(getWithdrawalSourceDex(true)).toBe("spot");
		expect(getWithdrawalSourceDex(false)).toBe("");
	});

	it("rejects unknown withdrawal route values", () => {
		expect(isWithdrawalRoute("arbitrum-cctp")).toBe(true);
		expect(isWithdrawalRoute("arbitrum-legacy")).toBe(true);
		expect(isWithdrawalRoute("arbitrum")).toBe(false);
		expect(isWithdrawalRoute(null)).toBe(false);
	});

	it("queries automatic-forwarding fees from the environment-specific CoreDepositWallet", () => {
		expect(getCctpWithdrawalFeeRequest(false)).toMatchObject({
			address: CCTP_NETWORKS.mainnet.coreDepositWallet,
			functionName: "calculateCrossChainWithdrawalFee",
			args: [true, 3],
		});
		expect(getCctpWithdrawalFeeRequest(true)).toMatchObject({
			address: CCTP_NETWORKS.testnet.coreDepositWallet,
			functionName: "calculateCrossChainWithdrawalFee",
			args: [true, 3],
		});
	});
});

describe("withdrawal amounts", () => {
	it("uses the live CCTP fee and retains the explicit legacy fee", () => {
		expect(getWithdrawalRouteFee("arbitrum-cctp", "0.2")).toBe("0.2");
		expect(getWithdrawalRouteFee("arbitrum-cctp", null)).toBeNull();
		expect(getWithdrawalRouteFee("arbitrum-legacy", null)).toBe("1");
	});

	it("matches the official CCTP UI minimum of twice the forwarding fee", () => {
		expect(getMinimumWithdrawal("arbitrum-cctp", "0.2")).toBe("0.4");
		expect(
			validateWithdrawal(
				{
					amount: "0.399999",
					available: "10",
					route: "arbitrum-cctp",
					routeFee: "0.2",
					activationFee: "0",
				},
				(descriptor) => i18n._(descriptor),
			),
		).toEqual({ valid: false, error: "Minimum withdrawal is $0.4" });
		expect(
			validateWithdrawal(
				{
					amount: "0.4",
					available: "10",
					route: "arbitrum-cctp",
					routeFee: "0.2",
					activationFee: "0",
				},
				(descriptor) => i18n._(descriptor),
			),
		).toEqual({ valid: true, error: null });
	});

	it("accounts for the separate one-time HyperCore activation fee", () => {
		expect(getMaximumWithdrawal("5.5", "1")).toBe("4.5");
		expect(
			validateWithdrawal(
				{
					amount: "5",
					available: "5.5",
					route: "arbitrum-cctp",
					routeFee: "0.2",
					activationFee: "1",
				},
				(descriptor) => i18n._(descriptor),
			),
		).toEqual({ valid: false, error: "Insufficient balance" });
		expect(
			validateWithdrawal(
				{
					amount: "4.5",
					available: "5.5",
					route: "arbitrum-cctp",
					routeFee: "0.2",
					activationFee: "1",
				},
				(descriptor) => i18n._(descriptor),
			),
		).toEqual({ valid: true, error: null });
	});

	it("calculates the received amount without floating-point arithmetic", () => {
		expect(getWithdrawalNetReceived("10.000001", "0.2")).toBe("9.800001");
		expect(getWithdrawalNetReceived("1", "1")).toBe("0");
	});

	it("fails closed while the dynamic fee is unavailable", () => {
		expect(
			validateWithdrawal(
				{
					amount: "10",
					available: "20",
					route: "arbitrum-cctp",
					routeFee: null,
					activationFee: "0",
				},
				(descriptor) => i18n._(descriptor),
			),
		).toEqual({ valid: false, error: null });
	});
});
