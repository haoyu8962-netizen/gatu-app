import { useLingui } from "@lingui/react/macro";
import type { ApiWalletViewProps } from "./api-wallet-view";
import { ApiWalletView } from "./api-wallet-view";

export const API_WALLET_FIXTURE_NAMES = ["normal", "empty", "loading", "error", "disconnected", "non-master"] as const;

export type ApiWalletFixtureName = (typeof API_WALLET_FIXTURE_NAMES)[number];

const ACCOUNT_ADDRESS = "0x1111111111111111111111111111111111111111";

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
	const { t, i18n } = useLingui();
	const pageState = fixture === "non-master" ? "nonMaster" : fixture;
	const noop = () => undefined;
	const activeExpiry = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium" }).format(
		new Date("2026-10-12T00:00:00.000Z"),
	);
	const expiringExpiry = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium" }).format(
		new Date("2026-08-18T00:00:00.000Z"),
	);
	const expiredExpiry = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium" }).format(
		new Date("2026-07-31T00:00:00.000Z"),
	);
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
							expiresAt: "2026-10-12T00:00:00.000Z",
							expiryLabel: activeExpiry,
							status: "active",
						},
						{
							id: "grid-bot",
							name: "grid-bot",
							address: "0x3333333333333333333333333333333333333333",
							expiresAt: "2026-08-18T00:00:00.000Z",
							expiryLabel: expiringExpiry,
							status: "expiring",
							statusDetail: t`5 days left`,
						},
						{
							id: "expired-bot",
							name: "expired-bot",
							address: "0x4444444444444444444444444444444444444444",
							expiresAt: "2026-07-31T00:00:00.000Z",
							expiryLabel: expiredExpiry,
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
