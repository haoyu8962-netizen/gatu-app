// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralActionModal } from "@/components/referrals/referral-action-modal";
import { ReferralActionStatusUnknownError } from "@/hooks/trade/use-referral-actions";
import { createI18nRoot } from "@/lib/tests/harness/react";

const REFERRAL_FAILURE = "Referral request could not be completed.";
const ARABIC_REFERRAL_FAILURE = "تعذر إكمال طلب الإحالة.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(REFERRAL_FAILURE)]: ARABIC_REFERRAL_FAILURE,
};

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	ModalFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
	ModalHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
	ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
	TextInput: () => <input />,
}));

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/number-format-reactivity", () => ({ useNumberFormatRevision: () => 0 }));

describe("ReferralActionModal invitation flow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderDescription(call: unknown[] | undefined): string {
		const options = call?.[1] as { description?: ReactNode } | undefined;
		const host = document.createElement("div");
		const descriptionRoot = createI18nRoot(host);
		act(() => descriptionRoot.render(<span>{options?.description}</span>));
		const text = host.textContent ?? "";
		act(() => descriptionRoot.unmount());
		return text;
	}

	it("shows a deep-linked code for review without submitting it automatically", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		await act(async () => {
			root.render(
				<ReferralActionModal
					action="apply"
					unclaimedRewards={[]}
					initialCode="gatuappweb3"
					onClose={vi.fn()}
					onSubmit={onSubmit}
				/>,
			);
		});

		expect(container.textContent).toContain("gatuappweb3");
		expect(onSubmit).not.toHaveBeenCalled();

		const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm");
		if (!confirm) throw new Error("Confirm button was not rendered");
		await act(async () => {
			confirm.click();
		});

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith("apply", "gatuappweb3");
	});

	it("keeps a deep-linked code locked when the secondary action is selected", async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		await act(async () => {
			root.render(
				<ReferralActionModal
					action="apply"
					unclaimedRewards={[]}
					initialCode="ExactCode"
					onClose={onClose}
					onSubmit={onSubmit}
				/>,
			);
		});

		expect(container.querySelector("input")).toBeNull();
		const cancel = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Cancel");
		if (!cancel) throw new Error("Cancel button was not rendered");
		await act(async () => cancel.click());

		expect(onClose).toHaveBeenCalledOnce();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(container.querySelector("input")).toBeNull();
	});

	it("reviews the unclaimed balance and submits a claim without displaying other reward fields", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		await act(async () => {
			root.render(
				<ReferralActionModal
					action="claim"
					unclaimedRewards={[
						{
							builderRewards: "4.75",
							claimedRewards: "9.5",
							cumVlm: "100",
							name: "USDC",
							tokenId: 0,
							unclaimedRewards: "1.25",
							weiDecimals: 6,
						},
					]}
					onClose={vi.fn()}
					onSubmit={onSubmit}
				/>,
			);
		});

		expect(container.textContent).toContain("1.25");
		expect(container.textContent).not.toContain("9.5");
		expect(container.textContent).not.toContain("4.75");

		const claim = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Claim all");
		if (!claim) throw new Error("Claim button was not rendered");
		await act(async () => claim.click());

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith("claim", undefined);
	});

	it("closes at the click, submits once and reports a confirmed claim through a notification", async () => {
		let settle!: () => void;
		const onSubmit = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					settle = resolve;
				}),
		);
		const onClose = vi.fn();
		await act(async () => {
			root.render(<ReferralActionModal action="claim" unclaimedRewards={[]} onClose={onClose} onSubmit={onSubmit} />);
		});
		const claim = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Claim all");
		if (!claim) throw new Error("Claim button was not rendered");

		act(() => {
			claim.click();
			claim.click();
		});

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledOnce();
		expect(container.textContent).not.toContain("Waiting for confirmation");
		expect(toastMocks.success).not.toHaveBeenCalled();

		await act(async () => settle());
		expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith("Rewards claimed", expect.anything());
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("reports a failed request in the locale that is active when it fails, without resubmitting", async () => {
		const onSubmit = vi.fn().mockRejectedValue(undefined);
		await act(async () => {
			root.render(<ReferralActionModal action="claim" unclaimedRewards={[]} onClose={vi.fn()} onSubmit={onSubmit} />);
		});
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		const claim = container.querySelectorAll("button")[1];
		if (!claim) throw new Error("Claim button was not rendered");
		await act(async () => {
			claim.click();
			await Promise.resolve();
		});

		expect(toastMocks.error).toHaveBeenCalledOnce();
		expect(renderDescription(toastMocks.error.mock.calls[0])).toContain(ARABIC_REFERRAL_FAILURE);
		expect(renderDescription(toastMocks.error.mock.calls[0])).not.toContain(REFERRAL_FAILURE);
		expect(toastMocks.warning).not.toHaveBeenCalled();
		expect(onSubmit).toHaveBeenCalledOnce();
	});

	it("keeps an unconfirmed request on screen as a warning until it is dismissed", async () => {
		const onSubmit = vi.fn().mockRejectedValue(new ReferralActionStatusUnknownError());
		await act(async () => {
			root.render(<ReferralActionModal action="claim" unclaimedRewards={[]} onClose={vi.fn()} onSubmit={onSubmit} />);
		});
		const claim = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Claim all");
		await act(async () => {
			claim?.click();
			await Promise.resolve();
		});

		expect(toastMocks.warning).toHaveBeenCalledExactlyOnceWith(
			"Request not confirmed",
			expect.objectContaining({ closeButton: true, duration: Number.POSITIVE_INFINITY }),
		);
		expect(toastMocks.error).not.toHaveBeenCalled();
	});
});
