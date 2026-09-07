import type { Messages } from "@lingui/core";

export type LoadableCatalogMessages = Messages | ReadonlyArray<Messages[string]>;

export interface LoadableCatalogModule {
	messages: LoadableCatalogMessages;
	messageIdsHash?: number;
}

export function hashCatalogMessageIds(messageIds: readonly string[]): number {
	let hash = 2_166_136_261;
	for (const messageId of messageIds) {
		for (let index = 0; index < messageId.length; index += 1) {
			hash = Math.imul(hash ^ messageId.charCodeAt(index), 16_777_619);
		}
		hash = Math.imul(hash ^ 0xff, 16_777_619);
	}
	return hash >>> 0;
}

export function expandCatalogMessages(defaultMessages: Messages, catalog: LoadableCatalogModule): Messages {
	if (!Array.isArray(catalog.messages)) return catalog.messages as Messages;

	const compactMessages = catalog.messages as ReadonlyArray<Messages[string]>;
	const messageIds = Object.keys(defaultMessages);
	if (compactMessages.length !== messageIds.length || catalog.messageIdsHash !== hashCatalogMessageIds(messageIds)) {
		throw new Error("The locale catalog does not match the source catalog");
	}

	return Object.fromEntries(messageIds.map((messageId, index) => [messageId, compactMessages[index]])) as Messages;
}
