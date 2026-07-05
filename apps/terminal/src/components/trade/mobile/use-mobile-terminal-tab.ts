import { useLocation, useNavigate } from "@tanstack/react-router";
import type { MobileTab } from "@/config/nav";

interface MobileTerminalLocationState {
	displayedContent?: unknown;
}

function getMobileTab(value: unknown): MobileTab {
	if (value === "markets" || value === "trade" || value === "account") return value;
	return "trade";
}

export function useMobileTerminalTab() {
	const location = useLocation();
	const navigate = useNavigate();
	const state = location.state as MobileTerminalLocationState;
	const activeTab = getMobileTab(state.displayedContent);

	function setActiveTab(tab: MobileTab) {
		void navigate({
			replace: true,
			resetScroll: false,
			state: (previous) => ({
				...previous,
				displayedContent: tab,
			}),
		});
	}

	return { activeTab, setActiveTab };
}
