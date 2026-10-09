import { Trans } from "@lingui/react/macro";
import { subscribeMobileAgentEnded } from "@sairn/hl-react";
import { useEffect } from "react";
import { toast } from "sonner";

const MOBILE_AGENT_ENDED_TOAST_ID = "mobile-agent-ended";

export function MobileAgentEndedNotifier() {
	useEffect(
		() =>
			subscribeMobileAgentEnded(() => {
				toast.warning(<Trans>Phone access ended</Trans>, {
					id: MOBILE_AGENT_ENDED_TOAST_ID,
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

	return null;
}
