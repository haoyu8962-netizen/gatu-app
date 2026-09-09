import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { getNetwork } from "@/lib/network";
import {
	clearEmailOnboardingIntent,
	reconcileEmailOnboardingIntent,
	recordEmailOnboardingIntent,
} from "@/lib/wallet/email-onboarding-intent";
import { getPrivyLoginIntent, recordPrivyLoginMethod } from "@/lib/wallet/privy-login-method";
import { getPrivyEmbeddedWalletAddress, resolvePrivyWalletIntent } from "@/lib/wallet/privy-wagmi";

export function PrivyLoginMethodObserver() {
	const { ready, authenticated, user } = usePrivy();
	const env = getNetwork() === "testnet" ? "Testnet" : "Mainnet";
	useEffect(() => {
		reconcileEmailOnboardingIntent({
			ready,
			authenticated,
			userId: user?.id,
			env,
			embeddedWalletAddress: getPrivyEmbeddedWalletAddress(user),
			walletIntent: resolvePrivyWalletIntent(user, getPrivyLoginIntent(user?.id)),
		});
	}, [authenticated, env, ready, user]);
	useEffect(() => clearEmailOnboardingIntent, []);

	useLogin({
		onComplete: ({ loginAccount, loginMethod, user, wasAlreadyAuthenticated }) => {
			const walletAddress =
				loginAccount?.type === "wallet" && "address" in loginAccount && typeof loginAccount.address === "string"
					? loginAccount.address
					: undefined;
			recordPrivyLoginMethod(user.id, loginMethod, walletAddress);
			if (loginMethod === "email" && !wasAlreadyAuthenticated) {
				recordEmailOnboardingIntent({ userId: user.id, env, ownerAddress: getPrivyEmbeddedWalletAddress(user) });
			} else if (!wasAlreadyAuthenticated) {
				clearEmailOnboardingIntent();
			}
		},
	});

	return null;
}
