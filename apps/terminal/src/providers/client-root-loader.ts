type ClientRootModule = typeof import("@/providers/client-root");

export type ClientRootProviderComponent = ClientRootModule["ClientRootProvider"];

export interface ClientRootLoaderState {
	readonly Provider: ClientRootProviderComponent | null;
	readonly error: unknown;
}

const SERVER_STATE: ClientRootLoaderState = { Provider: null, error: undefined };

/**
 * Publishes the client-only wallet runtime as an immutable snapshot for `useSyncExternalStore`.
 * Every outcome, success or failure, is a new object, so React re-renders the gate and a failed
 * load reaches the error boundary instead of leaving the static shell on screen.
 */
export function createClientRootLoader(importer: () => Promise<ClientRootModule>) {
	let state: ClientRootLoaderState = SERVER_STATE;
	let pending: Promise<ClientRootModule> | undefined;
	const listeners = new Set<() => void>();

	function publish(next: ClientRootLoaderState) {
		state = next;
		for (const listener of listeners) listener();
	}

	return {
		load(): Promise<ClientRootModule> {
			pending ??= importer().then(
				(module) => {
					publish({ Provider: module.ClientRootProvider, error: undefined });
					return module;
				},
				(error: unknown) => {
					publish({ Provider: null, error: error ?? new Error("Client runtime failed to load") });
					throw error;
				},
			);
			return pending;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getState: () => state,
		getServerState: () => SERVER_STATE,
	};
}

export const clientRootLoader = createClientRootLoader(() => import("@/providers/client-root"));
