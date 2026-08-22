import { useLogin } from "@privy-io/react-auth";
import { recordPrivyLoginMethod } from "@/lib/wallet/privy-login-method";

export function PrivyLoginMethodObserver() {
	useLogin({
		onComplete: ({ loginAccount, loginMethod, user }) => {
			const walletAddress =
				loginAccount?.type === "wallet" && "address" in loginAccount && typeof loginAccount.address === "string"
					? loginAccount.address
					: undefined;
			recordPrivyLoginMethod(user.id, loginMethod, walletAddress);
		},
	});

	return null;
}
