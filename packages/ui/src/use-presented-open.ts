import * as React from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Base UI only runs enter transitions when `open` flips to true after mount. Modals in this app are
 * usually mounted already open by a store change, so the first commit reports them closed and the
 * layout effect opens them before paint, which lets the starting styles animate in.
 */
export function usePresentedOpen(open: boolean | undefined): boolean | undefined {
	const [mounted, setMounted] = React.useState(false);
	useIsoLayoutEffect(() => {
		setMounted(true);
	}, []);
	if (open === undefined) return undefined;
	return open && mounted;
}
