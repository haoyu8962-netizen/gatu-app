import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
	children: ReactNode;
	target?: HTMLElement | null;
}

export function DesktopTabToolbarPortal({ children, target }: Props) {
	if (target === undefined) return children;
	return target ? createPortal(children, target) : null;
}
