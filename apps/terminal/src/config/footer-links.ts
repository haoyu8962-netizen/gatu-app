import { msg } from "@lingui/core/macro";

export const FOOTER_LINKS = [
	{ id: "/docs", label: msg`Docs`, path: "/docs" },
	{ id: "/support", label: msg`Support`, path: "/support" },
	{ id: "/terms", label: msg`Terms`, path: "/terms" },
	{ id: "/privacy", label: msg`Privacy Policy`, path: "/privacy" },
	{ id: "/risk", label: msg`Risk Disclosure`, path: "/risk" },
] as const;

export const FOOTER_LABELS = {
	connecting: msg`Connecting`,
	connected: msg`Connected`,
	disconnected: msg`Disconnected`,
	offline: msg`Offline`,
	command: msg`Open command menu`,
	links: msg`Documentation and legal`,
	commandKey: "⌘K",
};
