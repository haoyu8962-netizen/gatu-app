import { useEffect, useState } from "react";

type SubmitHost = typeof import("./position-market-close-submit-host").PositionMarketCloseSubmitHost;

const HOST_LOAD_ATTEMPTS = 3;
const HOST_RETRY_DELAY_MS = 1_000;

export function PositionMarketCloseSubmitHostGate() {
	const [SubmitHost, setSubmitHost] = useState<SubmitHost | null>(null);

	useEffect(() => {
		let active = true;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		function load(attempt: number) {
			import("./position-market-close-submit-host").then(
				(module) => {
					if (active) setSubmitHost(() => module.PositionMarketCloseSubmitHost);
				},
				() => {
					if (!active || attempt >= HOST_LOAD_ATTEMPTS) return;
					retryTimer = setTimeout(() => load(attempt + 1), HOST_RETRY_DELAY_MS * attempt);
				},
			);
		}
		load(1);
		return () => {
			active = false;
			clearTimeout(retryTimer);
		};
	}, []);

	return SubmitHost ? <SubmitHost /> : null;
}
