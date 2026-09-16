import { msg } from "@lingui/core/macro";

export const FOOTER_LINKS = [
	{ id: "/docs", label: { ...msg`Docs`, message: "Docs" }, path: "/docs" },
	{ id: "/support", label: { ...msg`Support`, message: "Support" }, path: "/support" },
	{ id: "/terms", label: { ...msg`Terms`, message: "Terms" }, path: "/terms" },
	{ id: "/privacy", label: { ...msg`Privacy Policy`, message: "Privacy Policy" }, path: "/privacy" },
	{ id: "/risk", label: { ...msg`Risk Disclosure`, message: "Risk Disclosure" }, path: "/risk" },
] as const;

export const FOOTER_LABELS = {
	connecting: { ...msg`Connecting`, message: "Connecting" },
	connected: { ...msg`Connected`, message: "Connected" },
	disconnected: { ...msg`Disconnected`, message: "Disconnected" },
	offline: { ...msg`Offline`, message: "Offline" },
	command: { ...msg`Open command menu`, message: "Open command menu" },
	links: { ...msg`Documentation and legal`, message: "Documentation and legal" },
	commandKey: "⌘K",
};
