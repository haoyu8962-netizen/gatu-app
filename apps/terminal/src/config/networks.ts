export interface Network {
	id: string;
	name: string;
	shortName: string;
	estimatedDepositTime: string;
	estimatedWithdrawTime: string;
}

export const NETWORKS = [
	{
		id: "arbitrum",
		name: "Arbitrum",
		shortName: "ARB",
		estimatedDepositTime: "~1 min",
		estimatedWithdrawTime: "~5 min",
	},
] as const satisfies readonly Network[];

export type NetworkId = (typeof NETWORKS)[number]["id"];
