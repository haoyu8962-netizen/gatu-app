import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { ApiWalletViewProps } from "./api-wallet-view";
import { ApiWalletView } from "./api-wallet-view";

export const API_WALLET_FIXTURE_NAMES = ["normal", "empty", "loading", "error", "disconnected", "non-master"] as const;

export type ApiWalletFixtureName = (typeof API_WALLET_FIXTURE_NAMES)[number];

const ACCOUNT_ADDRESS = "0x1111111111111111111111111111111111111111";
const DAY_IN_MS = 86_400_000;

export function getApiWalletFixtureFromLocation(): ApiWalletFixtureName | null {
	if (!import.meta.env.DEV || typeof window === "undefined") return null;
	const requestedFixture = new URLSearchParams(window.location.search).get("fixture");
	return API_WALLET_FIXTURE_NAMES.includes(requestedFixture as ApiWalletFixtureName)
		? (requestedFixture as ApiWalletFixtureName)
		: null;
}

interface Props {
	fixture: ApiWalletFixtureName;
}

export function ApiWalletFixture({ fixture }: Props) {
	const { t } = useLingui();
	const pageState = fixture === "non-master" ? "nonMaster" : fixture;
	const [fixtureNow] = useState(() => Date.now());
	const activeExpiresAt = new Date(fixtureNow + 90 * DAY_IN_MS).toISOString();
	const expiringExpiresAt = new Date(fixtureNow + 5 * DAY_IN_MS).toISOString();
	const expiredExpiresAt = new Date(fixtureNow - DAY_IN_MS).toISOString();
	const noop = () => undefined;
	const props: ApiWalletViewProps = {
		pageState,
		accountAddress: fixture === "disconnected" ? undefined : ACCOUNT_ADDRESS,
		accountLabel: t`Mock account`,
		name: "",
		generatedAddress: undefined,
		validityDays: 90,
		agents:
			fixture === "normal" || fixture === "non-master"
				? [
						{
							id: "market-maker",
							name: "market-maker",
							address: "0x2222222222222222222222222222222222222222",
							expiresAt: activeExpiresAt,
							expiryLabel: t`90 days`,
							status: "active",
						},
						{
							id: "grid-bot",
							name: "grid-bot",
							address: "0x3333333333333333333333333333333333333333",
							expiresAt: expiringExpiresAt,
							expiryLabel: t`5 days left`,
							status: "expiring",
						},
						{
							id: "expired-bot",
							name: "expired-bot",
							address: "0x4444444444444444444444444444444444444444",
							expiresAt: expiredExpiresAt,
							expiryLabel: t`Expired`,
							status: "expired",
						},
					]
				: [],
		action: null,
		canGenerate: pageState === "normal" || pageState === "empty",
		canAuthorize: false,
		isRefreshing: false,
		onNameChange: noop,
		onValidityChange: noop,
		onGenerate: noop,
		onAuthorize: noop,
		onRemove: noop,
		onRetry: noop,
		onConnect: noop,
		onCloseAction: noop,
		onConfirmAction: noop,
		onVerifyAgain: noop,
		onTogglePrivateKey: noop,
		onDownloadCredential: noop,
		onCredentialSavedChange: noop,
		onFinishAction: noop,
	};

	return <ApiWalletView {...props} />;
}
