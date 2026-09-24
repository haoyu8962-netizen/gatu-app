import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";

interface Props {
	notificationId: string;
	children: ReactNode;
}

let presentationSequence = 0;

export function FundsRecoveryNotification({ notificationId, children }: Props) {
	const presentationRef = useRef<{ notificationId: string; id: string } | null>(null);
	useLayoutEffect(() => {
		const presentation = { notificationId, id: `${notificationId}:presentation:${++presentationSequence}` };
		presentationRef.current = presentation;
		return () => {
			if (presentationRef.current === presentation) presentationRef.current = null;
			toast.custom(() => <></>, { id: presentation.id, duration: 0 });
			toast.dismiss(presentation.id);
		};
	}, [notificationId]);
	useEffect(() => {
		const presentation = presentationRef.current;
		if (!presentation || presentation.notificationId !== notificationId) return;
		toast.custom(() => <div className="w-[var(--width)] max-w-full">{children}</div>, {
			id: presentation.id,
			duration: Number.POSITIVE_INFINITY,
			dismissible: false,
		});
	}, [children, notificationId]);

	return null;
}
