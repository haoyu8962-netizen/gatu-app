import { useState } from "react";

interface DisclosureSetState {
	identity: string | null;
	expandedKeys: Set<string>;
}

export interface MobileDisclosureSetController {
	expandedKeys: ReadonlySet<string>;
	setExpanded: (key: string, expanded: boolean) => void;
	expandAll: (targetKeys?: readonly string[]) => void;
	collapseAll: (targetKeys?: readonly string[]) => void;
}

export interface MobileDisclosureSetState {
	readonly identity: string | null;
	createController: (keys: readonly string[]) => MobileDisclosureSetController;
}

export function useMobileDisclosureSetState(identity: string | null): MobileDisclosureSetState {
	const [state, setState] = useState<DisclosureSetState>(() => ({
		identity,
		expandedKeys: new Set(),
	}));
	let expandedKeys = state.expandedKeys;
	if (state.identity !== identity) {
		// Reset before children render so disclosure state cannot flash or revive across account or environment changes.
		expandedKeys = new Set();
		setState({ identity, expandedKeys });
	}

	return {
		identity,
		createController(keys) {
			function updateExpandedKeys(update: (next: Set<string>) => void) {
				setState((current) => {
					const next = new Set(current.identity === identity ? current.expandedKeys : []);
					update(next);
					return { identity, expandedKeys: next };
				});
			}

			function setExpanded(key: string, expanded: boolean) {
				updateExpandedKeys((next) => {
					if (expanded) next.add(key);
					else next.delete(key);
				});
			}

			function expandAll(targetKeys: readonly string[] = keys) {
				updateExpandedKeys((next) => {
					for (const key of targetKeys) next.add(key);
				});
			}

			function collapseAll(targetKeys: readonly string[] = keys) {
				updateExpandedKeys((next) => {
					for (const key of targetKeys) next.delete(key);
				});
			}

			return { expandedKeys, setExpanded, expandAll, collapseAll };
		},
	};
}

export function useMobileDisclosureSet(
	identity: string | null,
	keys: readonly string[],
	sharedState?: MobileDisclosureSetState,
): MobileDisclosureSetController {
	const localState = useMobileDisclosureSetState(identity);
	const activeState = sharedState?.identity === identity ? sharedState : localState;
	return activeState.createController(keys);
}
