import { createFileRoute } from "@tanstack/react-router";
import { handleLeaderboardApiRequest } from "@/lib/leaderboard/leaderboard-server";

export const Route = createFileRoute("/api/leaderboard")({
	server: {
		handlers: {
			GET: ({ request }) => handleLeaderboardApiRequest(request),
		},
	},
});
