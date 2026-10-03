import { useEffect, useState } from "react";

const TOAST_ITEM_SELECTOR = "[data-sonner-toast]";
const FRONT_ATTRIBUTE = "data-front";

/**
 * Whether the toast that renders `content` is the front one, the only one a collapsed stack shows.
 * Sonner marks it with `data-front` on the toast's list item (`sonner.css` styles the same
 * attribute), so the answer follows what is actually on screen instead of a second copy of the
 * stack order.
 */
export function useIsFrontToast(content: Element | null): boolean {
	const [front, setFront] = useState(false);

	useEffect(() => {
		const item = content?.closest(TOAST_ITEM_SELECTOR);
		if (!item) {
			setFront(false);
			return;
		}
		const read = () => setFront(item.getAttribute(FRONT_ATTRIBUTE) === "true");
		read();
		const observer = new MutationObserver(read);
		observer.observe(item, { attributes: true, attributeFilter: [FRONT_ATTRIBUTE] });
		return () => observer.disconnect();
	}, [content]);

	return front;
}
