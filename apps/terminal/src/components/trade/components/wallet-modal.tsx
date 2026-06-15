import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function WalletModal({ open, onOpenChange }: Props) {
	const { ready, authenticated, login } = usePrivy();

	useEffect(() => {
		if (!open || !ready) return;
		onOpenChange(false);
		if (!authenticated) login();
	}, [open, ready, authenticated, login, onOpenChange]);

	return null;
}
