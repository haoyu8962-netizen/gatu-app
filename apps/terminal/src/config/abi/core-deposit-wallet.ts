export const CORE_DEPOSIT_WALLET_ABI = [
	{
		type: "function",
		name: "calculateCrossChainWithdrawalFee",
		stateMutability: "view",
		inputs: [
			{ name: "shouldForward", type: "bool" },
			{ name: "destinationChainId", type: "uint32" },
		],
		outputs: [{ name: "maxFee", type: "uint256" }],
	},
] as const;
