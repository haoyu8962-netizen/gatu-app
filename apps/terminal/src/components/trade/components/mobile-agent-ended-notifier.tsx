import { Trans } from "@lingui/react/macro";
import { subscribeMobileAgentEnded, useHyperliquid } from "@sairn/hl-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { shortenAddress } from "@/lib/format";

const MOBILE_AGENT_ENDED_TOAST_PREFIX = "mobile-agent-ended";

export function MobileAgentEndedNotifier() {
	const { clientKey, env, sessionMode } = useHyperliquid();
	const sessionRef = useRef({ clientKey, env, sessionMode });
	sessionRef.current = { clientKey, env, sessionMode };
	const shownRef = useRef<{ id: string; env: string } | null>(null);

	useEffect(
		() =>
			subscribeMobileAgentEnded((event) => {
				const session = sessionRef.current;
				if (event.env !== session.env) return;
				if (session.sessionMode === "agent-only" && session.clientKey.toLowerCase() !== event.owner.toLowerCase()) {
					return;
				}
				const id = `${MOBILE_AGENT_ENDED_TOAST_PREFIX}:${event.env}:${event.owner.toLowerCase()}`;
				const account = shortenAddress(event.owner);
				shownRef.current = { id, env: event.env };
				toast.warning(<Trans>Phone access ended for {account}</Trans>, {
					id,
					description: (
						<Trans>
							The desktop-approved key expired or was replaced from desktop. Scan a new QR from Link mobile device.
						</Trans>
					),
					duration: Number.POSITIVE_INFINITY,
					closeButton: true,
				});
			}),
		[],
	);

	useEffect(() => {
		const shown = shownRef.current;
		if (!shown) return;
		if (shown.env === env && !(sessionMode === "agent-only" && clientKey !== "disconnected")) return;
		toast.dismiss(shown.id);
		shownRef.current = null;
	}, [clientKey, env, sessionMode]);

	return null;
}
