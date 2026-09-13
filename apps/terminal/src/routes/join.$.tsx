import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/join/$")({
	ssr: false,
	beforeLoad: () => {
		throw notFound();
	},
});
