import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/vaults")({
	component: VaultsLayout,
});

function VaultsLayout() {
	return <Outlet />;
}
