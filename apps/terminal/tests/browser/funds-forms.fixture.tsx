import { Button } from "@sairn/ui";
import { useState } from "react";
import { renderFundsModalBackButton } from "@/components/trade/components/funds-modal-back-button";
import { FundsModalShell } from "@/components/trade/components/funds-modal-shell";
import { DepositForm } from "@/components/trade/tradebox/deposit/deposit-form";
import { DepositMethodChooser } from "@/components/trade/tradebox/deposit/deposit-method-chooser";
import { StatusScreen } from "@/components/trade/tradebox/deposit/shared-ui";
import { WithdrawForm } from "@/components/trade/tradebox/deposit/withdraw-form";
import { WrongNetworkScreen } from "@/components/trade/tradebox/deposit/wrong-network-screen";
import { useIsMobile } from "@/hooks/use-mobile";

const address = "0x1111111111111111111111111111111111111111" as const;
const noop = () => {};

export function FundsFormsFixture() {
	const mobile = useIsMobile();
	const [form, setForm] = useState<"deposit" | "withdraw" | null>(null);
	const [email, setEmail] = useState(true);
	const [cardFunding, setCardFunding] = useState(false);
	const [addressPending, setAddressPending] = useState(false);
	const [screen, setScreen] = useState<"status" | "network" | null>(null);
	const [depositStep, setDepositStep] = useState<"methods" | "transfer">("methods");
	const [purchases, setPurchases] = useState(0);
	const [status, setStatus] = useState<"success" | "loading" | "error">("success");
	const [amount, setAmount] = useState("");
	const [destination, setDestination] = useState("");
	const [submitted, setSubmitted] = useState(0);
	const ready = status === "success";
	const showsDepositMethods = form === "deposit" && cardFunding && depositStep === "methods";
	return (
		<>
			<div className="flex flex-wrap gap-3 p-2">
				<Button
					onClick={() => {
						setDepositStep("methods");
						setForm("deposit");
					}}
				>
					Open deposit
				</Button>
				<Button onClick={() => setForm("withdraw")}>Open withdraw</Button>
				<Button onClick={() => setEmail(!email)}>Toggle email</Button>
				<Button onClick={() => setStatus(status === "success" ? "error" : "success")}>Toggle data</Button>
				<Button onClick={() => setCardFunding(!cardFunding)}>Toggle card funding</Button>
				<Button onClick={() => setAddressPending(!addressPending)}>Toggle address</Button>
				<Button onClick={() => setScreen("status")}>Open status</Button>
				<Button onClick={() => setScreen("network")}>Open wrong network</Button>
				<output aria-label="Fixture submissions">{submitted}</output>
				<output aria-label="Fixture card purchases">{purchases}</output>
			</div>
			<FundsModalShell
				open={form !== null}
				isPending={false}
				onOpenChange={(open) => {
					if (!open) setForm(null);
				}}
				presentation={mobile ? "drawer" : "modal"}
				tab={form ?? "deposit"}
				headerStart={
					form === "deposit" && cardFunding && depositStep === "transfer" ? (
						renderFundsModalBackButton({ label: "Back", onClick: () => setDepositStep("methods") })
					) : null
				}
			>
					{showsDepositMethods ? (
						<DepositMethodChooser
							fiat={{ walletKind: email ? "embedded" : "external", disabled: !ready }}
							notice={ready ? null : "Deposits are not available in your region."}
							onTransfer={() => setDepositStep("transfer")}
							onBuy={() => {
								setPurchases(purchases + 1);
								setForm(null);
							}}
							onBuyAvailable={() => undefined}
						/>
					) : null}
					{!showsDepositMethods && form === "deposit" ? (
						<DepositForm
							amount={amount}
							onAmountChange={setAmount}
							balance="12.345678"
							maxAmount="12.345678"
							maxDepositRaw={12_345_678n}
							balanceStatus={status}
							validation={{ valid: ready, error: null }}
							isPending={false}
							onSubmit={() => setSubmitted(submitted + 1)}
							onRetryData={() => setStatus("success")}
							routingStatus="ready"
							depositRoute="cctp"
							onRetryRouting={noop}
							networkName="Arbitrum"
							sponsoredCctpEnabled
							sponsoredCctpReadiness={{ status: "ready", failure: null, retry: noop }}
							requiresExplicitFundingDeposit={email}
							cctpFee="0.2"
							minimumDepositRaw={400_000n}
							belowMinimumDepositRaw={null}
							cctpFeeLoading={status === "loading"}
							cctpFeeError={status === "error"}
							pendingCctpRecovery={false}
							usesFundingAddressFlow={email}
							fundingAddressPending={addressPending}
							fundingAddress={address}
							onDone={() => setForm(null)}
						/>
					) : null}
					{form !== "deposit" ? (
						<WithdrawForm
							amount={amount}
							onAmountChange={setAmount}
							destination={email ? destination : address}
							onDestinationChange={setDestination}
							destinationRequired={email}
							destinationError={null}
							available="12.345678"
							maxAmount="12.345678"
							route="arbitrum-cctp"
							routingStatus="ready"
							routeChanged={false}
							routeFee={ready ? "0.2" : null}
							activationFee="0"
							showActivationFee={false}
							prerequisitesPending={status === "loading"}
							prerequisiteError={null}
							canRetryPrerequisites={!ready}
							onRetryPrerequisites={() => setStatus("success")}
							validation={{ valid: ready && amount !== "", error: null }}
							canSubmit={ready && amount !== ""}
							isPending={false}
							onSubmit={() => setSubmitted(submitted + 1)}
						/>
					) : null}
			</FundsModalShell>
			<StatusScreen
				open={screen === "status"}
				presentation={mobile ? "drawer" : "modal"}
				title="Deposit"
				icon="awaiting"
				heading="Waiting for chain confirmation"
				description="12.345678 USDC → Hyperliquid. Keep this window open until the transfer is confirmed."
				txHash="0x1111111111111111111111111111111111111111111111111111111111111111"
				onClose={() => setScreen(null)}
			>
				<Button onClick={() => setScreen(null)} className="w-full">
					Dismiss status
				</Button>
			</StatusScreen>
			<WrongNetworkScreen
				open={screen === "network"}
				presentation={mobile ? "drawer" : "modal"}
				onClose={() => setScreen(null)}
				onBack={() => setScreen(null)}
				onSwitch={noop}
				isSwitching={false}
				error={new Error("Fixture switch failure")}
			/>
		</>
	);
}
