export type DefinitiveDepositSourceFailureCode = "source-receipt-mismatch" | "source-transaction-reverted";

export class DefinitiveDepositSourceFailureError extends Error {
	readonly code: DefinitiveDepositSourceFailureCode;

	constructor(code: DefinitiveDepositSourceFailureCode, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "DefinitiveDepositSourceFailureError";
		this.code = code;
	}
}

export function isDefinitiveDepositSourceFailure(error: unknown): error is DefinitiveDepositSourceFailureError {
	return error instanceof DefinitiveDepositSourceFailureError;
}
