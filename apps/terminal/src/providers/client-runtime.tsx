import { createContext, type ReactNode, use } from "react";

const ClientRuntimeContext = createContext(false);

interface Props {
	children: ReactNode;
	ready?: boolean;
}

export function ClientRuntimeProvider({ children, ready = true }: Props) {
	return <ClientRuntimeContext value={ready}>{children}</ClientRuntimeContext>;
}

export function useClientRuntimeReady() {
	return use(ClientRuntimeContext);
}
