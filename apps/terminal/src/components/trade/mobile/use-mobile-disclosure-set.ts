import { useState } from "react";

interface DisclosureSetState {
	identity: string | null;
	initialized: boolean;
	expandedKeys: Set<string>;
}

function getDefaultExpandedKeys(keys: readonly string[]): Set<string> {
	const firstKey = keys[0];
	return firstKey ? new Set([firstKey]) : new Set();
}

export function useMobileDisclosureSet(identity: string | null, keys: readonly string[]) {
	const [state, setState] = useState<DisclosureSetState>(() => ({
		identity,
		initialized: false,
		expandedKeys: new Set(),
	}));

	const expandedKeys =
		state.identity === identity && state.initialized ? state.expandedKeys : getDefaultExpandedKeys(keys);

	function updateExpandedKeys(update: (next: Set<string>) => void) {
		setState((current) => {
			const next = new Set(
				current.identity === identity && current.initialized ? current.expandedKeys : getDefaultExpandedKeys(keys),
			);
			update(next);
			return { identity, initialized: true, expandedKeys: next };
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
}
