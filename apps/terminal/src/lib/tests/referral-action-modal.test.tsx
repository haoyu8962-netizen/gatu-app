import { clearFeedback, feedbackErrorText, feedbackText, latestFeedback } from "./harness/order-feedback";
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

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/number-format-reactivity", () => ({ useNumberFormatRevision: () => 0 }));

const feedbackIdentity = vi.hoisted(() => ({
	clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	env: "Mainnet",
}));
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => feedbackIdentity }));

describe("ReferralActionModal invitation flow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		feedbackIdentity.clientKey = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		feedbackIdentity.env = "Mainnet";
		clearFeedback();
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
		expect(latestFeedback("success")).toBeUndefined();

		await act(async () => settle());
		expect(feedbackText("success", "title")).toBe("Rewards claimed");
		expect(feedbackText("success", "message")).toBe("Changes may take a moment to appear.");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("reports a definitive failure as a failed referral request, not as an unconfirmed one", async () => {
		const onSubmit = vi.fn().mockRejectedValue(undefined);
		await act(async () => {
			root.render(<ReferralActionModal action="claim" unclaimedRewards={[]} onClose={vi.fn()} onSubmit={onSubmit} />);
		});
		const claim = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Claim all");
		await act(async () => {
			claim?.click();
			await Promise.resolve();
		});

		expect(feedbackText("failed", "title")).toBe("Referral request");
		expect(feedbackText("failed", "message")).toBe("");
		expect(feedbackErrorText(latestFeedback("failed"))).toContain(REFERRAL_FAILURE);
		expect(latestFeedback("unconfirmed")).toBeUndefined();
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

		expect(latestFeedback("failed")).toBeDefined();
		expect(feedbackErrorText(latestFeedback("failed"))).toContain(ARABIC_REFERRAL_FAILURE);
		expect(feedbackErrorText(latestFeedback("failed"))).not.toContain(REFERRAL_FAILURE);
		expect(latestFeedback("unconfirmed")).toBeUndefined();
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

		expect(feedbackText("unconfirmed", "title")).toBe("Request not confirmed");
		expect(latestFeedback("failed")).toBeUndefined();
	});

	it.each(["success", "failed", "unconfirmed"] as const)(
		"keeps a late %s referral result under its original identity",
		async (status) => {
			let settle: (() => void) | undefined;
			const onSubmit = vi.fn(
				() =>
					new Promise<void>((resolve, reject) => {
						settle = () =>
							status === "success"
								? resolve()
								: reject(
										status === "unconfirmed" ? new ReferralActionStatusUnknownError() : new Error("Referral rejected"),
									);
					}),
			);
			const onClose = vi.fn();
			act(() =>
				root.render(<ReferralActionModal action="claim" unclaimedRewards={[]} onClose={onClose} onSubmit={onSubmit} />),
			);
			const claim = Array.from(container.querySelectorAll("button")).find(
				(button) => button.textContent === "Claim all",
			);
			act(() => claim?.click());
			const pendingId = latestFeedback("pending")?.id;
			expect(pendingId).toBeDefined();

			feedbackIdentity.clientKey = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
			feedbackIdentity.env = "Testnet";
			act(() => root.render(null));
			await act(async () => settle?.());
			expect(latestFeedback(status)).toMatchObject({
				id: pendingId,
				owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				env: "Mainnet",
			});
			expect(onSubmit).toHaveBeenCalledOnce();
			expect(onClose).toHaveBeenCalledOnce();
		},
	);
});
