import { i18n } from "@lingui/core";
import type { Address, Hex, TransactionReceipt } from "viem";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import {
	CCTP_DEPOSIT_NETWORKS,
	CCTP_FAST_FINALITY_THRESHOLD,
	CCTP_MAX_DEPOSIT_USDC,
	CCTP_TESTNET_MAX_DEPOSIT_USDC,
	getCctpDepositConfig,
	resolveCctpDepositFeatureFlags,
} from "@/config/cctp-deposit";
import { describeActionError } from "@/lib/errors/action-error";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import {
	addressToBytes32,
	assertCctpDepositReceipt,
	assertCctpSponsoredDepositReceipt,
	assertCctpSponsoredDepositSourceTransaction,
	buildCctpDepositContractArgs,
	buildCctpSponsoredDepositContractArgs,
	CCTP_EXTENSION_ABI,
	CCTP_EXTENSION_V2_ABI,
	calculateCctpDepositFee,
	createCctpDepositParameters,
	createCctpSponsoredDepositParameters,
	deriveCctpSponsoredAuthorizationNonce,
	encodeCctpForwardHookData,
	fetchCctpDepositFees,
	fetchCctpFastAllowance,
	getAmountIndependentCctpDepositMinimumRaw,
	getAmountIndependentCctpMaxFeeRaw,
	getCctpDepositMinimumRaw,
	getHyperCoreRecipientState,
	hasHyperCoreMainnetState,
	meetsCctpDepositMinimum,
	normalizeCctpDepositFees,
	normalizeCctpFastAllowance,
	splitCctpAuthorizationSignature,
} from "@/lib/trade/cctp-deposit";
import type { Translate } from "@/lib/translate";

const USER = "0x1111111111111111111111111111111111111111" as Address;
const OTHER_USER = "0x2222222222222222222222222222222222222222" as Address;
const NONCE = `0x${"ab".repeat(32)}` as const;
const AMOUNT_RAW = 5_000_000n;
const translate: Translate = (descriptor) => i18n._(descriptor);

function captureError(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected the action to throw");
}

function createFeePayload(minimumFee = 0, forwardFee = 200_000) {
	return [
		{
			finalityThreshold: 2000,
			minimumFee: 0,
			forwardFee: { low: forwardFee, med: forwardFee, high: forwardFee },
		},
		{
			finalityThreshold: CCTP_FAST_FINALITY_THRESHOLD,
			minimumFee,
			forwardFee: { low: forwardFee - 1, med: forwardFee, high: forwardFee + 1 },
		},
	];
}

function createReceipt({
	amountRaw = AMOUNT_RAW,
	config = CCTP_DEPOSIT_NETWORKS.mainnet,
	depositor = USER,
	logAddress = config.cctpExtension,
	mintRecipient = addressToBytes32(config.cctpForwarder),
	destinationDomain = config.destinationDomain,
	status = "success",
}: {
	amountRaw?: bigint;
	config?: typeof CCTP_DEPOSIT_NETWORKS.mainnet;
	depositor?: Address;
	logAddress?: Address;
	mintRecipient?: `0x${string}`;
	destinationDomain?: number;
	status?: "success" | "reverted";
} = {}): TransactionReceipt {
	return {
		status,
		logs: [
			{
				address: logAddress,
				topics: encodeEventTopics({ abi: CCTP_EXTENSION_ABI, eventName: "BatchDepositForBurn" }),
				data: encodeAbiParameters(
					[{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint32" }],
					[1n, amountRaw, depositor, mintRecipient, destinationDomain],
				),
			},
		],
	} as TransactionReceipt;
}

function createSponsoredReceipt({
	amountRaw = AMOUNT_RAW,
	authNonce = NONCE,
	depositor = USER,
	eventName = "SponsoredDepositForBurn",
	logAddress = CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2,
}: {
	amountRaw?: bigint;
	authNonce?: Hex;
	depositor?: Address;
	eventName?: "SponsoredDepositForBurn" | "SponsoredDepositForBurnSkipped";
	logAddress?: Address;
} = {}): TransactionReceipt {
	return {
		status: "success",
		logs: [
			{
				address: logAddress,
				topics: encodeEventTopics({
					abi: CCTP_EXTENSION_V2_ABI,
					eventName,
					args: { authNonce, depositor },
				}),
				data:
					eventName === "SponsoredDepositForBurn"
						? encodeAbiParameters(
								[{ type: "bytes32" }, { type: "uint32" }, { type: "uint256" }],
								[
									addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
									CCTP_DEPOSIT_NETWORKS.mainnet.destinationDomain,
									amountRaw,
								],
							)
						: "0x",
			},
		],
	} as TransactionReceipt;
}

describe("CCTP deposit configuration", () => {
	it("keeps external Mainnet deposits on while other paths remain independently gated", () => {
		expect(resolveCctpDepositFeatureFlags({})).toEqual({
			mainnetSponsoredWallet: false,
			testnetExternalWallet: false,
			testnetSponsoredWallet: false,
		});
		expect(
			resolveCctpDepositFeatureFlags({
				VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED: "true",
				VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED: "true",
				VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED: "false",
			}),
		).toEqual({
			mainnetSponsoredWallet: true,
			testnetExternalWallet: true,
			testnetSponsoredWallet: false,
		});
	});

	it("uses Circle native USDC and official HyperCore contracts on both environments", () => {
		expect(getCctpDepositConfig(false)).toEqual(CCTP_DEPOSIT_NETWORKS.mainnet);
		expect(getCctpDepositConfig(true)).toEqual(CCTP_DEPOSIT_NETWORKS.testnet);
		expect(CCTP_DEPOSIT_NETWORKS.mainnet).toMatchObject({
			chainId: 42161,
			usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
			cctpExtension: "0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE",
			cctpExtensionV2: "0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB",
			cctpForwarder: "0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757",
			sourceDomain: 3,
			destinationDomain: 19,
		});
		expect(CCTP_DEPOSIT_NETWORKS.testnet).toMatchObject({
			chainId: 421614,
			usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
			cctpExtension: "0x8E4e3d0E95C1bEC4F3eC7F69aa48473E0Ab6eB8D",
			cctpExtensionV2: "0xC1Fec4e5DAf8796A490653359536f9c2a9C158aE",
			cctpForwarder: "0x02e39ECb8368b41bF68FF99ff351aC9864e5E2a2",
			sourceDomain: 3,
			destinationDomain: 19,
		});
		expect(CCTP_TESTNET_MAX_DEPOSIT_USDC).toBe(1_000_000_000n);
		expect(CCTP_MAX_DEPOSIT_USDC).toBe(10_000_000_000_000n);
	});
});

describe("CCTP testnet recipient checks", () => {
	it.each([{ role: "user" }, { role: "vault" }])("accepts an existing $role on HyperCore mainnet", (role) => {
		expect(hasHyperCoreMainnetState(role)).toBe(true);
	});

	it("accepts an existing subaccount", () => {
		const role = { role: "subAccount", data: { master: USER } };
		expect(hasHyperCoreMainnetState(role)).toBe(true);
	});

	it("identifies API wallets as signing-only addresses", () => {
		const role = { role: "agent", data: { user: USER } };
		expect(getHyperCoreRecipientState(role)).toBe("agent");
		expect(hasHyperCoreMainnetState(role)).toBe(false);
	});

	it("rejects missing mainnet state without treating it as an API error", () => {
		expect(hasHyperCoreMainnetState({ role: "missing" })).toBe(false);
	});

	it.each([
		null,
		{},
		{ role: "unexpected" },
		{ role: "agent", data: {} },
		{ role: "subAccount", data: { master: "invalid" } },
	])("fails closed for malformed userRole responses", (role) => {
		expect(() => hasHyperCoreMainnetState(role)).toThrow("Hyperliquid returned an invalid user role");
	});
});

describe("CCTP fee handling", () => {
	it("strictly normalizes the one Fast Transfer quote", () => {
		expect(normalizeCctpDepositFees(createFeePayload(1.3))).toEqual({
			finalityThreshold: 1000,
			minimumFeeBps: "1.3",
			forwardFeeRaw: { low: 199_999n, med: 200_000n, high: 200_001n },
		});
	});

	it.each([
		null,
		{},
		[],
		[{ finalityThreshold: 1000, minimumFee: "1", forwardFee: { low: 1, med: 1, high: 1 } }],
		[{ finalityThreshold: 1000, minimumFee: -1, forwardFee: { low: 1, med: 1, high: 1 } }],
		[{ finalityThreshold: 1000, minimumFee: 1, forwardFee: { low: 1, med: 1.5, high: 2 } }],
		[
			{ finalityThreshold: 1000, minimumFee: 0, forwardFee: { low: 1, med: 1, high: 1 } },
			{ finalityThreshold: 1000, minimumFee: 0, forwardFee: { low: 1, med: 1, high: 1 } },
		],
	])("rejects malformed or ambiguous Circle responses", (payload) => {
		expect(() => normalizeCctpDepositFees(payload)).toThrow();
	});

	it("requests the configured endpoint without accepting cached fee data", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(createFeePayload()),
		});

		await expect(fetchCctpDepositFees(CCTP_DEPOSIT_NETWORKS.testnet, { fetcher })).resolves.toMatchObject({
			finalityThreshold: 1000,
		});
		expect(fetcher).toHaveBeenCalledWith(
			"https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/3/19?forward=true&hyperCoreDeposit=true",
			expect.objectContaining({ method: "GET", cache: "no-store" }),
		);
	});

	it("strictly normalizes Fast Transfer allowance to USDC subunits by rounding down", () => {
		expect(normalizeCctpFastAllowance({ allowance: 123_999.999999, lastUpdated: "2025-01-23T10:00:00Z" })).toBe(
			123_999_999_999n,
		);
		expect(normalizeCctpFastAllowance({ allowance: 0.000001 })).toBe(1n);
		expect(() => normalizeCctpFastAllowance({ allowance: -1 })).toThrow();
		expect(() => normalizeCctpFastAllowance({ allowance: "1000" })).toThrow();
	});

	it("requests the current Fast Transfer allowance without accepting cached data", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ allowance: 1000, lastUpdated: "2025-01-23T10:00:00Z" }),
		});

		await expect(fetchCctpFastAllowance(CCTP_DEPOSIT_NETWORKS.testnet, { fetcher })).resolves.toBe(1_000_000_000n);
		expect(fetcher).toHaveBeenCalledWith(
			"https://iris-api-sandbox.circle.com/v2/fastBurn/USDC/allowance",
			expect.objectContaining({ method: "GET", cache: "no-store" }),
		);
	});

	it("rounds the protocol fee and its 20 percent buffer up before adding the median forwarding fee", () => {
		const result = calculateCctpDepositFee(1_000_001n, normalizeCctpDepositFees(createFeePayload(1.3)));

		expect(result).toEqual({
			protocolFeeRaw: 131n,
			bufferedProtocolFeeRaw: 158n,
			forwardFeeRaw: 200_000n,
			maxFeeRaw: 200_158n,
			netAmountRaw: 799_843n,
		});
	});

	it("fails closed when fees consume the transfer", () => {
		expect(() => calculateCctpDepositFee(200_000n, normalizeCctpDepositFees(createFeePayload()))).toThrow(
			"CCTP fees must be lower than the deposit amount",
		);
	});

	it("requires twice the current maximum fee instead of a fixed legacy-bridge minimum", () => {
		const quote = normalizeCctpDepositFees(createFeePayload(0));

		expect(getCctpDepositMinimumRaw(200_000n)).toBe(400_000n);
		expect(getAmountIndependentCctpDepositMinimumRaw(quote)).toBe(400_000n);
		expect(() => calculateCctpDepositFee(399_999n, quote)).toThrow(
			"CCTP deposit amount is below the minimum of twice the current fee",
		);
		expect(calculateCctpDepositFee(400_000n, quote).netAmountRaw).toBe(200_000n);
		expect(meetsCctpDepositMinimum(399_999n, quote)).toBe(false);
		expect(meetsCctpDepositMinimum(400_000n, quote)).toBe(true);
		expect(meetsCctpDepositMinimum(4_999_999n, quote)).toBe(true);
	});

	it("has no amount-independent minimum while the protocol fee depends on the amount", () => {
		const quote = normalizeCctpDepositFees(createFeePayload(1.3));

		expect(getAmountIndependentCctpDepositMinimumRaw(quote)).toBeNull();
		expect(meetsCctpDepositMinimum(400_000n, quote)).toBe(false);
		expect(meetsCctpDepositMinimum(1_000_001n, quote)).toBe(true);
	});

	it("only exposes an amount-independent fee preview when the protocol fee is zero", () => {
		expect(getAmountIndependentCctpMaxFeeRaw(normalizeCctpDepositFees(createFeePayload(0)))).toBe(200_000n);
		expect(getAmountIndependentCctpMaxFeeRaw(normalizeCctpDepositFees(createFeePayload(1.3)))).toBeNull();
	});
});

describe("CCTP deposit parameters", () => {
	it("left-pads the forwarder address and encodes the exact 56-byte perps hook", () => {
		expect(addressToBytes32(USER)).toBe(`0x${"0".repeat(24)}${USER.slice(2)}`);
		expect(encodeCctpForwardHookData(USER)).toBe(
			`0x636374702d666f7277617264${"0".repeat(24)}0000000000000018${USER.slice(2)}00000000`,
		);
		expect((encodeCctpForwardHookData(USER).length - 2) / 2).toBe(56);
	});

	it("builds official EIP-3009 typed data and one-burn extension parameters", () => {
		const parameters = createCctpDepositParameters({
			amountRaw: AMOUNT_RAW,
			config: CCTP_DEPOSIT_NETWORKS.testnet,
			feeQuote: normalizeCctpDepositFees(createFeePayload()),
			nonce: NONCE,
			nowSeconds: 2_000_000_000,
			user: USER,
		});

		expect(parameters.typedData).toMatchObject({
			domain: {
				name: "USD Coin",
				version: "2",
				chainId: 421614,
				verifyingContract: CCTP_DEPOSIT_NETWORKS.testnet.usdc,
			},
			primaryType: "ReceiveWithAuthorization",
			message: {
				from: USER,
				to: CCTP_DEPOSIT_NETWORKS.testnet.cctpExtension,
				value: AMOUNT_RAW,
				validAfter: 1_999_996_400n,
				validBefore: 2_000_003_600n,
				nonce: NONCE,
			},
		});
		expect(parameters.depositForBurn).toEqual({
			amount: AMOUNT_RAW,
			destinationDomain: 19,
			mintRecipient: addressToBytes32(CCTP_DEPOSIT_NETWORKS.testnet.cctpForwarder),
			destinationCaller: addressToBytes32(CCTP_DEPOSIT_NETWORKS.testnet.cctpForwarder),
			maxFee: 200_000n,
			minFinalityThreshold: 1000,
			hookData: encodeCctpForwardHookData(USER),
		});
	});

	it("produces typed data and extension arguments accepted by viem", async () => {
		const parameters = createCctpDepositParameters({
			amountRaw: AMOUNT_RAW,
			config: CCTP_DEPOSIT_NETWORKS.testnet,
			feeQuote: normalizeCctpDepositFees(createFeePayload()),
			nonce: NONCE,
			nowSeconds: 2_000_000_000,
			user: USER,
		});
		const signature = await privateKeyToAccount(`0x${"01".repeat(32)}`).signTypedData(parameters.typedData);

		expect(() =>
			encodeFunctionData({
				abi: CCTP_EXTENSION_ABI,
				functionName: "batchDepositForBurnWithAuth",
				args: buildCctpDepositContractArgs(parameters, signature),
			}),
		).not.toThrow();
	});

	it("splits and normalizes authorization signatures for the contract call", () => {
		const signature = `0x${"11".repeat(32)}${"22".repeat(32)}00` as const;
		expect(splitCctpAuthorizationSignature(signature)).toEqual({
			v: 27,
			r: `0x${"11".repeat(32)}`,
			s: `0x${"22".repeat(32)}`,
		});
		const parameters = createCctpDepositParameters({
			amountRaw: AMOUNT_RAW,
			config: CCTP_DEPOSIT_NETWORKS.mainnet,
			feeQuote: normalizeCctpDepositFees(createFeePayload()),
			nonce: NONCE,
			nowSeconds: 2_000_000_000,
			user: USER,
		});
		expect(buildCctpDepositContractArgs(parameters, signature)[0]).toMatchObject({ v: 27, r: `0x${"11".repeat(32)}` });
	});

	it("reports a malformed wallet signature and an impossible device clock as translatable reasons", () => {
		const signature = `0x${"11".repeat(32)}${"22".repeat(32)}05` as const;
		const signatureFailure = captureError(() => splitCctpAuthorizationSignature(signature));
		expect(signatureFailure).toBeInstanceOf(LocalizedActionError);
		expect(describeActionError(signatureFailure, translate)).toBe("The wallet could not sign the request. Try again.");

		const clockFailure = captureError(() =>
			createCctpDepositParameters({
				amountRaw: AMOUNT_RAW,
				config: CCTP_DEPOSIT_NETWORKS.mainnet,
				feeQuote: normalizeCctpDepositFees(createFeePayload()),
				nonce: NONCE,
				nowSeconds: 60,
				user: USER,
			}),
		);
		expect(clockFailure).toBeInstanceOf(LocalizedActionError);
		expect(describeActionError(clockFailure, translate)).toBe(
			"Your device clock is out of sync. Correct the date and time, then try again.",
		);
	});
});

describe("sponsored CCTP deposit parameters", () => {
	it("derives the official nonce from the depositor, authorization window, and exact deposit tuple", () => {
		const parameters = createCctpSponsoredDepositParameters({
			amountRaw: AMOUNT_RAW,
			config: CCTP_DEPOSIT_NETWORKS.testnet,
			feeQuote: normalizeCctpDepositFees(createFeePayload()),
			nowSeconds: 2_000_000_000,
			user: USER,
		});
		const expectedNonce = keccak256(
			encodeAbiParameters(
				[
					{ type: "address" },
					{ type: "uint256" },
					{ type: "uint256" },
					{ type: "uint256" },
					{
						type: "tuple",
						components: [
							{ name: "amount", type: "uint256" },
							{ name: "destinationDomain", type: "uint32" },
							{ name: "mintRecipient", type: "bytes32" },
							{ name: "destinationCaller", type: "bytes32" },
							{ name: "maxFee", type: "uint256" },
							{ name: "minFinalityThreshold", type: "uint32" },
							{ name: "hookData", type: "bytes" },
						],
					},
				],
				[USER, AMOUNT_RAW, 1_999_996_400n, 2_000_003_600n, parameters.depositForBurn],
			),
		);

		expect(parameters.authorization.authNonce).toBe(expectedNonce);
		expect(parameters.typedData.message).toEqual({
			from: USER,
			to: CCTP_DEPOSIT_NETWORKS.testnet.cctpExtensionV2,
			value: AMOUNT_RAW,
			validAfter: 1_999_996_400n,
			validBefore: 2_000_003_600n,
			nonce: expectedNonce,
		});
		expect(
			deriveCctpSponsoredAuthorizationNonce({
				amountRaw: AMOUNT_RAW,
				depositForBurn: { ...parameters.depositForBurn, maxFee: parameters.depositForBurn.maxFee + 1n },
				user: USER,
				validAfter: parameters.authorization.authValidAfter,
				validBefore: parameters.authorization.authValidBefore,
			}),
		).not.toBe(expectedNonce);
	});

	it("encodes one authorization and one burn for batchSponsorDepositForBurn", async () => {
		const parameters = createCctpSponsoredDepositParameters({
			amountRaw: AMOUNT_RAW,
			config: CCTP_DEPOSIT_NETWORKS.testnet,
			feeQuote: normalizeCctpDepositFees(createFeePayload()),
			nowSeconds: 2_000_000_000,
			user: USER,
		});
		const signature = await privateKeyToAccount(`0x${"01".repeat(32)}`).signTypedData(parameters.typedData);
		const input = encodeFunctionData({
			abi: CCTP_EXTENSION_V2_ABI,
			functionName: "batchSponsorDepositForBurn",
			args: buildCctpSponsoredDepositContractArgs(parameters, signature),
		});

		expect(() =>
			assertCctpSponsoredDepositSourceTransaction({
				amountRaw: AMOUNT_RAW,
				authNonce: parameters.authorization.authNonce,
				config: CCTP_DEPOSIT_NETWORKS.testnet,
				input,
				to: CCTP_DEPOSIT_NETWORKS.testnet.cctpExtensionV2,
				user: USER,
			}),
		).not.toThrow();
	});
});

describe("sponsored CCTP deposit receipt validation", () => {
	it("requires one matching success event and accepts unrelated batch events", () => {
		const unrelatedReceipt = createSponsoredReceipt({
			authNonce: NONCE,
			depositor: OTHER_USER,
			eventName: "SponsoredDepositForBurnSkipped",
		});
		const receipt = createSponsoredReceipt();
		receipt.logs.unshift(...unrelatedReceipt.logs);

		expect(() =>
			assertCctpSponsoredDepositReceipt({
				amountRaw: AMOUNT_RAW,
				authNonce: NONCE,
				config: CCTP_DEPOSIT_NETWORKS.mainnet,
				receipt,
				user: USER,
			}),
		).not.toThrow();
	});

	it.each([
		createSponsoredReceipt({ eventName: "SponsoredDepositForBurnSkipped" }),
		createSponsoredReceipt({ amountRaw: AMOUNT_RAW + 1n }),
		createSponsoredReceipt({ depositor: OTHER_USER }),
		createSponsoredReceipt({ logAddress: OTHER_USER }),
	])("rejects skipped, mismatched, or spoofed sponsored deposits", (receipt) => {
		expect(() =>
			assertCctpSponsoredDepositReceipt({
				amountRaw: AMOUNT_RAW,
				authNonce: NONCE,
				config: CCTP_DEPOSIT_NETWORKS.mainnet,
				receipt,
				user: USER,
			}),
		).toThrow();
	});
});

describe("CCTP deposit receipt validation", () => {
	it("accepts exactly one matching BatchDepositForBurn event from the official extension", () => {
		expect(() =>
			assertCctpDepositReceipt({
				amountRaw: AMOUNT_RAW,
				config: CCTP_DEPOSIT_NETWORKS.mainnet,
				receipt: createReceipt(),
				user: USER,
			}),
		).not.toThrow();
	});

	it.each([
		createReceipt({ status: "reverted" }),
		createReceipt({ depositor: OTHER_USER }),
		createReceipt({ destinationDomain: 0 }),
		createReceipt({ mintRecipient: addressToBytes32(OTHER_USER) }),
		createReceipt({ logAddress: OTHER_USER }),
	])("rejects reverted, mismatched, or spoofed receipts", (receipt) => {
		expect(() =>
			assertCctpDepositReceipt({
				amountRaw: AMOUNT_RAW,
				config: CCTP_DEPOSIT_NETWORKS.mainnet,
				receipt,
				user: USER,
			}),
		).toThrow();
	});
});
