import { describe, expect, it } from "vitest";
import {
	finishDepositExecution,
	getDepositExecutionState,
	resetDepositExecution,
	startDepositExecution,
	updateDepositExecutionState,
} from "@/lib/hyperliquid/deposit-execution-state";

describe("deposit execution state", () => {
	it("preserves the pending state and blocks reset until the operation settles", () => {
		const executionKey = "mainnet:manual:wallet:0x1";
		const lockKey = "mainnet:wallet:0x1";
		const operationId = startDepositExecution(executionKey, lockKey, "12.5", "cctp");
		if (operationId === null) throw new Error("Expected execution to start");

		expect(getDepositExecutionState(executionKey).status).toBe("pending");
		expect(getDepositExecutionState(executionKey).amount).toBe("12.5");
		expect(getDepositExecutionState(executionKey).route).toBe("cctp");
		expect(resetDepositExecution(executionKey)).toBe(false);
		expect(getDepositExecutionState(executionKey).status).toBe("pending");

		finishDepositExecution(executionKey, lockKey, operationId);
		expect(getDepositExecutionState(executionKey).amount).toBe("12.5");
		expect(resetDepositExecution(executionKey)).toBe(true);
		expect(getDepositExecutionState(executionKey).status).toBe("idle");
	});

	it("serializes manual and automatic executions for the same wallet while keeping their states separate", () => {
		const manualKey = "mainnet:manual:smart:0x2";
		const automaticKey = "mainnet:automatic:smart:0x2";
		const lockKey = "mainnet:smart:0x2";
		const manualOperationId = startDepositExecution(manualKey, lockKey, "20", "cctp");
		if (manualOperationId === null) throw new Error("Expected manual execution to start");

		expect(startDepositExecution(automaticKey, lockKey, "20", "cctp")).toBeNull();
		expect(getDepositExecutionState(automaticKey).status).toBe("idle");

		expect(
			updateDepositExecutionState(manualKey, manualOperationId, {
				status: "success",
				error: null,
				hash: undefined,
				amount: "20",
				route: "bridge",
				cctpRecoveryUnavailable: false,
				submissionOutcomeUnknown: false,
				walletResponseDelayed: false,
			}),
		).toBe(true);
		finishDepositExecution(manualKey, lockKey, manualOperationId);

		const automaticOperationId = startDepositExecution(automaticKey, lockKey, "20", "cctp");
		expect(automaticOperationId).not.toBeNull();
		if (automaticOperationId !== null) finishDepositExecution(automaticKey, lockKey, automaticOperationId);
		resetDepositExecution(manualKey);
		resetDepositExecution(automaticKey);
	});

	it("ignores updates from an obsolete operation id", () => {
		const executionKey = "testnet:manual:wallet:0x3";
		const lockKey = "testnet:wallet:0x3";
		const operationId = startDepositExecution(executionKey, lockKey, "5", "cctp");
		if (operationId === null) throw new Error("Expected execution to start");

		expect(
			updateDepositExecutionState(executionKey, operationId + 1, {
				status: "success",
				error: null,
				hash: undefined,
				amount: "5",
				route: "bridge",
				cctpRecoveryUnavailable: false,
				submissionOutcomeUnknown: false,
				walletResponseDelayed: false,
			}),
		).toBe(false);
		expect(getDepositExecutionState(executionKey).status).toBe("pending");

		finishDepositExecution(executionKey, lockKey, operationId);
		resetDepositExecution(executionKey);
	});
});
