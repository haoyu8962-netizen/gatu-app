import { FooterBarView } from "@/components/trade/footer/footer-bar-view";
import { NavMenuTriggerView } from "@/components/trade/header/nav-menu-trigger-view";
import { TopNavView } from "@/components/trade/header/top-nav-view";
import { FOOTER_PLACEHOLDER, TOP_NAV_PLACEHOLDER } from "@/components/trade/layout/desktop-placeholders";
import { MOBILE_HEADER_PLACEHOLDER } from "@/components/trade/layout/mobile-placeholders";
import { MobileHeaderView } from "@/components/trade/mobile/mobile-header-view";
import { DASHBOARD_CONTENT_PLACEHOLDER, DASHBOARD_FRAMES, type DashboardFramePreset } from "@/config/dashboard-frames";
import { DESKTOP_NAV_ITEMS } from "@/config/desktop-nav";
import { DashboardContentPlaceholderView } from "./dashboard-content-placeholder-view";
import { DashboardFrameView } from "./dashboard-frame-view";

interface Props {
	frame?: DashboardFramePreset;
	pathname?: string;
}

export function DashboardShellSkeleton({ frame = DASHBOARD_FRAMES["/funding-history"], pathname = "" }: Props) {
	const route = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
	const activeItem = DESKTOP_NAV_ITEMS.find(
		(item) => item.path === route || (item.id === "vaults" && route.startsWith("/vaults/")),
	);
	const items = TOP_NAV_PLACEHOLDER.items.map((item) => ({ ...item, active: item.id === activeItem?.id }));
	const apiWalletActive = route === "/api-wallet";
	const compactMoreActive = apiWalletActive || !!activeItem?.compactHidden;
	return (
		<div aria-busy="true" data-testid="dashboard-shell-fallback">
			<output className="sr-only">Loading GATU...</output>
			<div aria-hidden="true" inert>
				<DashboardFrameView
					{...frame}
					header={
						<>
							<MobileHeaderView {...MOBILE_HEADER_PLACEHOLDER} className="min-[1001px]:hidden" />
							<div className="hidden min-[1001px]:block">
								<TopNavView
									{...TOP_NAV_PLACEHOLDER}
									items={items}
									moreTrigger={
										<div>
											<NavMenuTriggerView
												label={TOP_NAV_PLACEHOLDER.moreLabel}
												aria-label={TOP_NAV_PLACEHOLDER.moreLabel}
												active={apiWalletActive}
											/>
										</div>
									}
									compactMoreTrigger={
										<div>
											<NavMenuTriggerView
												label={TOP_NAV_PLACEHOLDER.moreLabel}
												aria-label={TOP_NAV_PLACEHOLDER.moreLabel}
												active={compactMoreActive}
											/>
										</div>
									}
								/>
							</div>
						</>
					}
					main={<DashboardContentPlaceholderView {...DASHBOARD_CONTENT_PLACEHOLDER} />}
					footer={
						<div className="hidden min-[1001px]:block">
							<FooterBarView {...FOOTER_PLACEHOLDER} />
						</div>
					}
				/>
			</div>
		</div>
	);
}
