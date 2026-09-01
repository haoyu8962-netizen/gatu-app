import { Trans } from "@lingui/react/macro";
import { WarningIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";

const LINK_CLASS = "underline underline-offset-2 hover:opacity-80";

export function GeoRestrictionBanner() {
	const { tradeRestricted } = useGeoRestriction();

	if (!tradeRestricted) return null;

	return (
		<div
			role="alert"
			className="flex min-h-[50px] w-full shrink-0 items-center gap-2.5 bg-restricted py-2.5 pl-[max(1rem,var(--sal))] pr-[max(1rem,var(--sar))] text-start text-base font-medium text-white"
		>
			<WarningIcon weight="fill" className="size-5 shrink-0" />
			<p className="leading-snug">
				<Trans>
					You are accessing our products and services from a restricted jurisdiction. We do not allow access from
					certain jurisdictions including locations subject to sanctions restrictions and other jurisdictions where our
					services are ineligible for use. For more information, see our{" "}
					<Link to="/terms" className={LINK_CLASS}>
						Terms of Use
					</Link>
					. If you think this is an error, try refreshing the page or{" "}
					<Link to="/support" className={LINK_CLASS}>
						opening a support ticket
					</Link>
					.
				</Trans>
			</p>
		</div>
	);
}
