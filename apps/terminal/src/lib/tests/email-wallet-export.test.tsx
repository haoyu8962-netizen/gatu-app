// @vitest-environment jsdom
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const state = vi.hoisted(() => ({
	session: {} as Record<string, unknown>,
	exportWallet: vi.fn(),
	error: vi.fn(),
}));
vi.mock("@privy-io/react-auth", () => ({ useExportWallet: () => ({ exportWallet: state.exportWallet }) }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => state.session }));
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t: (s: TemplateStringsArray) => s[0] }) }));
vi.mock("sonner", () => ({ toast: { error: state.error } }));

import { useEmailWalletExport } from "@/hooks/wallet/use-email-wallet-export";

const owner = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
let api: ReturnType<typeof useEmailWalletExport>;
let root: Root;
let container: HTMLDivElement;
function Harness() {
	api = useEmailWalletExport();
	return null;
}
function render() {
	act(() => root.render(createElement(Harness)));
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
	vi.clearAllMocks();
	state.exportWallet.mockResolvedValue(undefined);
	state.session = {
		ready: true,
		authenticationReady: true,
		authenticated: true,
		sessionMode: "wallet",
		walletIntent: "embedded",
		embeddedWalletAddress: owner,
		user: {
			id: "user-a",
			email: { address: "owner@example.test" },
			wallet: { address: owner, walletClientType: "privy", chainType: "ethereum" },
		},
	};
	container = document.createElement("div");
	document.body.append(container);
	root = createI18nRoot(container);
	render();
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("email wallet export", () => {
	it("exports only the exact owner after closing the application surface, without funding or signer access", async () => {
		state.session.hasWalletAccess = false;
		render();
		const close = vi.fn(() => expect(state.exportWallet).not.toHaveBeenCalled());
		await act(async () => {
			await api.exportEmailWallet(close);
		});
		expect(close).toHaveBeenCalledOnce();
		expect(state.exportWallet).toHaveBeenCalledExactlyOnceWith({ address: owner });
		expect(state.error).not.toHaveBeenCalled();
	});
	it.each([
		{ authenticated: false },
		{ authenticationReady: false },
		{ ready: false },
		{ walletIntent: "external" },
		{ walletIntent: "ambiguous" },
		{ sessionMode: "agent-only" },
		{ embeddedWalletAddress: other },
		{ embeddedWalletAddress: undefined },
		{ user: null },
	])("fails closed for unavailable or mismatched identity %j", async (patch) => {
		Object.assign(state.session, patch);
		render();
		expect(api.canExport).toBe(false);
		await act(async () => {
			await api.exportEmailWallet();
		});
		expect(state.exportWallet).not.toHaveBeenCalled();
	});
	it("blocks repeated clicks until the existing dialog settles; cancellation produces no success claim", async () => {
		let resolve!: () => void;
		state.exportWallet.mockReturnValue(
			new Promise<void>((done) => {
				resolve = done;
			}),
		);
		let pending!: Promise<void>;
		act(() => {
			pending = api.exportEmailWallet();
			void api.exportEmailWallet();
		});
		expect(api.canExport).toBe(false);
		expect(state.exportWallet).toHaveBeenCalledOnce();
		await act(async () => {
			resolve();
			await pending;
		});
		expect(api.canExport).toBe(true);
		expect(state.error).not.toHaveBeenCalled();
	});
	it("rejects a captured old handler after logout", async () => {
		const old = api.exportEmailWallet;
		state.session.authenticated = false;
		render();
		await act(async () => {
			await old();
		});
		expect(state.exportWallet).not.toHaveBeenCalled();
	});
	it("suppresses a late failure after account change and permits the new exact owner afterwards", async () => {
		let reject!: (error: Error) => void;
		state.exportWallet.mockReturnValueOnce(
			new Promise<void>((_, fail) => {
				reject = fail;
			}),
		);
		let pending!: Promise<void>;
		act(() => {
			pending = api.exportEmailWallet();
		});
		state.session.embeddedWalletAddress = other;
		state.session.user = {
			id: "user-b",
			email: { address: "other@example.test" },
			wallet: { address: other, walletClientType: "privy", chainType: "ethereum" },
		};
		render();
		expect(api.canExport).toBe(false);
		await act(async () => {
			reject(new Error("private upstream error"));
			await pending;
		});
		expect(state.error).not.toHaveBeenCalled();
		await act(async () => {
			await api.exportEmailWallet();
		});
		expect(state.exportWallet).toHaveBeenLastCalledWith({ address: other });
	});
	it("shows a safe recovery message for a current failure", async () => {
		state.exportWallet.mockRejectedValueOnce(new Error("private upstream error"));
		await act(async () => {
			await api.exportEmailWallet();
		});
		expect(state.error).toHaveBeenCalledOnce();
		expect(state.error.mock.calls[0]?.[0]).not.toContain("private upstream error");
		expect(api.canExport).toBe(true);
	});
	it("ignores completions after the export surface unmounts", async () => {
		let reject!: (error: Error) => void;
		state.exportWallet.mockReturnValueOnce(
			new Promise<void>((_, fail) => {
				reject = fail;
			}),
		);
		let pending!: Promise<void>;
		act(() => {
			pending = api.exportEmailWallet();
			root.render(null);
		});
		await act(async () => {
			reject(new Error("gone"));
			await pending;
		});
		expect(state.error).not.toHaveBeenCalled();
	});
});
