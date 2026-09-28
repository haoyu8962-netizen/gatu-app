import type { MessageDescriptor } from "@lingui/core";

/**
 * An error our own code throws for a user-requested action, carrying the message to show.
 *
 * Build the descriptor with `msg` so the text is translated when it is displayed, not when it is
 * thrown. `message` keeps the source-language text for logs and error reports.
 */
export class LocalizedActionError extends Error {
	readonly descriptor: MessageDescriptor;

	constructor(descriptor: MessageDescriptor, options?: { cause?: unknown }) {
		super(descriptor.message ?? descriptor.id, options);
		this.name = "LocalizedActionError";
		this.descriptor = descriptor;
	}
}

export function isLocalizedActionError(error: unknown): error is LocalizedActionError {
	return error instanceof LocalizedActionError;
}
