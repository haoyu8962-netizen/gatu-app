import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/join/$")({
	beforeLoad: () => {
		throw notFound();
	},
});
