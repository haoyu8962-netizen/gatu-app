import {
	AdaptiveModal,
	Button,
	Checkbox,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "@gatu/ui";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHip3DisclaimerActions } from "@/stores/use-hip3-disclaimer-store";

interface Props {
	documentationUrl: string | undefined;
}

const LINK_CLASS = "font-medium text-brand underline underline-offset-2 hover:opacity-80";

export function Hip3DeployerDisclaimer({ documentationUrl }: Props) {
	const isMobile = useIsMobile();
	const [isAcknowledged, setIsAcknowledged] = useState(false);
	const { accept } = useHip3DisclaimerActions();

	function handleConfirm() {
		if (!isAcknowledged) return;
		accept();
	}

	return (
		<AdaptiveModal
			open
			onOpenChange={() => undefined}
			size="lg"
			showClose={false}
			dismissible={false}
			presentation={isMobile ? "drawer" : "modal"}
			layer="blocking"
			className="max-h-[calc(100dvh-1rem)]"
		>
			<ModalHeader divider={false} className="pb-2 pr-4">
				<ModalTitle>
					<Trans>HIP-3 Deployer Disclaimer</Trans>
				</ModalTitle>
			</ModalHeader>

			<ModalContent className="space-y-4 pt-0">
				<ModalDescription className="text-sm leading-relaxed">
					<Trans>
						You are viewing markets deployed independently and permissionlessly by a third party on Hyperliquid. These
						markets are surfaced based on onchain activity and are not reviewed, verified, or approved.
					</Trans>
				</ModalDescription>

				<p className="text-sm leading-relaxed text-fg-muted">
					<Trans>
						Trading in these markets may involve elevated risk, including low liquidity, high volatility, incomplete
						documentation, and increased liquidation risk. Carefully assess the risks and understand how each market
						works before proceeding.
					</Trans>
				</p>

				<p className="text-sm leading-relaxed text-fg-muted">
					{documentationUrl ? (
						<Trans>
							Review the deployer's{" "}
							<a href={documentationUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
								documentation
							</a>{" "}
							and our{" "}
							<Link to="/terms" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
								Terms of Use
							</Link>{" "}
							before trading.
						</Trans>
					) : (
						<Trans>
							Review the available deployer information and our{" "}
							<Link to="/terms" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
								Terms of Use
							</Link>{" "}
							before trading.
						</Trans>
					)}
				</p>

				<div className="rounded-8 border border-stroke-weak bg-fill-weak p-3">
					<Checkbox
						size="lg"
						checked={isAcknowledged}
						onCheckedChange={(checked: boolean | "indeterminate") => setIsAcknowledged(checked === true)}
						label={
							<Trans>
								I have read and understood this disclaimer and accept the risks of interacting with permissionless
								markets deployed by third parties.
							</Trans>
						}
					/>
				</div>
			</ModalContent>

			<ModalFooter className="pt-0">
				<Button type="button" size="md" className="w-full" disabled={!isAcknowledged} onClick={handleConfirm}>
					<Trans>Confirm</Trans>
				</Button>
			</ModalFooter>
		</AdaptiveModal>
	);
}
