import { useQuery } from "@tanstack/react-query";
import { getCctpDepositConfig } from "@/config/cctp-deposit";
import { calculateCctpDepositFee, fetchCctpDepositFees, fetchCctpFastAllowance } from "@/lib/trade/cctp-deposit";

const CCTP_DEPOSIT_FEE_STALE_TIME_MS = 30_000;

export function useCctpDepositFee({
	amountRaw,
	enabled,
	isTestnet,
}: {
	amountRaw: bigint | undefined;
	enabled: boolean;
	isTestnet: boolean;
}) {
	const config = getCctpDepositConfig(isTestnet);
	const query = useQuery({
		queryKey: ["circle", "cctp", "deposit-fee", isTestnet ? "testnet" : "mainnet"],
		queryFn: async ({ signal }) => {
			const [feeQuote, fastAllowanceRaw] = await Promise.all([
				fetchCctpDepositFees(config, { signal }),
				fetchCctpFastAllowance(config, { signal }),
			]);
			return { feeQuote, fastAllowanceRaw };
		},
		enabled,
		refetchInterval: enabled ? CCTP_DEPOSIT_FEE_STALE_TIME_MS : false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
		retry: 1,
		staleTime: CCTP_DEPOSIT_FEE_STALE_TIME_MS,
	});

	let calculation: ReturnType<typeof calculateCctpDepositFee> | null = null;
	if (query.data && amountRaw !== undefined && amountRaw > 0n) {
		try {
			calculation = calculateCctpDepositFee(amountRaw, query.data.feeQuote);
		} catch {
			calculation = null;
		}
	}

	const hasSufficientFastAllowance =
		amountRaw !== undefined && amountRaw > 0n && query.data !== undefined
			? query.data.fastAllowanceRaw >= amountRaw
			: null;

	return { ...query, calculation, hasSufficientFastAllowance };
}
