import { createFileRoute, Outlet } from "@tanstack/react-router";

function BuildersPerpLayout() {
	return <Outlet />;
}

export const Route = createFileRoute("/builders-perp")({
	component: BuildersPerpLayout,
});
