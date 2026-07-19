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

const LINK_CLASS = "text-brand no-underline hover:text-brand/80";

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
			overlayClassName="backdrop-blur-[2px] duration-100"
			className="max-h-[calc(100dvh-1rem)] rounded-t-16 !shadow-none min-[1000px]:max-w-[32.5rem] min-[1000px]:rounded-16"
		>
			<ModalHeader divider={false} className="px-6 pt-5 pb-2">
				<ModalTitle className="text-base font-normal">
					<Trans>HIP-3 Deployer Disclaimer</Trans>
				</ModalTitle>
			</ModalHeader>

			<ModalContent className="space-y-3 px-6 pt-0 pb-4">
				<ModalDescription className="text-xs leading-4 text-fg">
					<Trans>
						You are viewing markets deployed independently and permissionlessly by a third party on Hyperliquid. These
						markets are surfaced based on onchain activity and are not reviewed, verified, or approved.
					</Trans>
				</ModalDescription>

				<p className="text-xs leading-4 text-fg">
					<Trans>
						Trading in these markets may involve elevated risk, including low liquidity, high volatility, incomplete
						documentation, and increased liquidation risk. Carefully assess the risks and understand how each market
						works before proceeding.
					</Trans>
				</p>

				<p className="text-xs leading-4 text-fg">
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

				<div className="py-1">
					<Checkbox
						size="lg"
						checked={isAcknowledged}
						onCheckedChange={setIsAcknowledged}
						label={
							<span className="text-fg-muted">
								<Trans>
									I have read and understood this disclaimer and accept the risks of interacting with permissionless
									markets deployed by third parties.
								</Trans>
							</span>
						}
					/>
				</div>
			</ModalContent>

			<ModalFooter className="px-6 pt-0 pb-5">
				<Button
					type="button"
					size="md"
					className="h-10 w-full py-0 text-xs font-normal !shadow-none data-disabled:cursor-default data-disabled:bg-brand/30 data-disabled:text-fg-inverse/60"
					disabled={!isAcknowledged}
					onClick={handleConfirm}
				>
					<Trans>Confirm</Trans>
				</Button>
			</ModalFooter>
		</AdaptiveModal>
	);
}
