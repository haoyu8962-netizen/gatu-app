import type { MobileAgentApproval } from "@gatu/hl-react/signing/mobile-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	beginDesktopApprovalSubmission,
	clearDesktopApprovalRecovery,
	getDesktopApprovalRecovery,
	hasDesktopApprovalRecovery,
	updateDesktopApprovalRecovery,
} from "@/lib/mobile-sync/desktop-approval-recovery";

const VALID_UNTIL_MS = 2_000_000_000_000;
const OWNERS = Array.from({ length: 5 }, (_, index) => `0x${String(index + 1).repeat(40)}` as `0x${string}`);

function createApproval(index: number): MobileAgentApproval {
	const byte = (index + 10).toString(16).padStart(2, "0");
	const publicNibble = ((index + 10) % 16).toString(16);
	return {
		agentNameBase: "Mobile",
		agentName: `Mobile valid_until ${VALID_UNTIL_MS}`,
		agentValidUntilMs: VALID_UNTIL_MS,
		privateKey: `0x${byte.repeat(32)}`,
		publicKey: `0x${publicNibble.repeat(40)}`,
	};
}

afterEach(() => {
	for (const owner of OWNERS) clearDesktopApprovalRecovery("Mainnet", owner);
});

describe("desktop approval recovery", () => {
	it("registers the mutex before generation and blocks a second same-owner candidate", () => {
		const create = vi.fn(() => createApproval(0));
		const first = beginDesktopApprovalSubmission({
			env: "Mainnet",
			ownerAddress: OWNERS[0],
			createApproval: create,
		});
		const second = beginDesktopApprovalSubmission({
			env: "Mainnet",
			ownerAddress: OWNERS[0],
			createApproval: () => createApproval(1),
		});

		expect(first.status).toBe("started");
		expect(second.status).toBe("blocked");
		expect(create).toHaveBeenCalledTimes(1);
		expect(hasDesktopApprovalRecovery("Mainnet", OWNERS[0])).toBe(true);
	});

	it("retains the exact candidate across submitting, pending, and approved phases", () => {
		const approval = createApproval(0);
		beginDesktopApprovalSubmission({
			env: "Mainnet",
			ownerAddress: OWNERS[0],
			createApproval: () => approval,
		});
		expect(
			updateDesktopApprovalRecovery({
				env: "Mainnet",
				ownerAddress: OWNERS[0],
				expectedAgentAddress: approval.publicKey,
				phase: "pending-verification",
				submissionErrorMessage: "response lost",
			}),
		).toBe(true);
		expect(getDesktopApprovalRecovery("Mainnet", OWNERS[0])).toMatchObject({
			approval,
			phase: "pending-verification",
			submissionErrorMessage: "response lost",
		});

		expect(
			updateDesktopApprovalRecovery({
				env: "Mainnet",
				ownerAddress: OWNERS[0],
				expectedAgentAddress: approval.publicKey,
				phase: "approved-unrevealed",
			}),
		).toBe(true);
		expect(getDesktopApprovalRecovery("Mainnet", OWNERS[0])?.approval.privateKey).toBe(approval.privateKey);
	});

	it("fails closed at four owners without evicting an existing private key", () => {
		for (let index = 0; index < 4; index += 1) {
			expect(
				beginDesktopApprovalSubmission({
					env: "Mainnet",
					ownerAddress: OWNERS[index],
					createApproval: () => createApproval(index),
				}).status,
			).toBe("started");
		}

		expect(
			beginDesktopApprovalSubmission({
				env: "Mainnet",
				ownerAddress: OWNERS[4],
				createApproval: () => createApproval(4),
			}).status,
		).toBe("capacity");
		expect(getDesktopApprovalRecovery("Mainnet", OWNERS[0])?.approval.privateKey).toBe(createApproval(0).privateKey);
	});

	it("clears expired and only exact-address recoveries", () => {
		const approval = createApproval(0);
		beginDesktopApprovalSubmission({
			env: "Mainnet",
			ownerAddress: OWNERS[0],
			createApproval: () => approval,
		});

		expect(clearDesktopApprovalRecovery("Mainnet", OWNERS[0], createApproval(1).publicKey)).toBe(false);
		expect(hasDesktopApprovalRecovery("Mainnet", OWNERS[0])).toBe(true);
		expect(getDesktopApprovalRecovery("Mainnet", OWNERS[0], VALID_UNTIL_MS)).toBeNull();
		expect(hasDesktopApprovalRecovery("Mainnet", OWNERS[0])).toBe(false);
	});
});
