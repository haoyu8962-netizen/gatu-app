import { create } from "zustand";

export interface SendDraft {
	ownerKey: string;
	destination: string;
	amount: string;
	token: string;
	accountType: "perp" | "spot";
}

interface SendDraftStore {
	draft: SendDraft | null;
}

const useSendDraftStore = create<SendDraftStore>(() => ({ draft: null }));

export function getSendDraft(ownerKey: string): SendDraft | null {
	const draft = useSendDraftStore.getState().draft;
	return draft?.ownerKey === ownerKey ? draft : null;
}

export function saveSendDraft(draft: SendDraft): void {
	useSendDraftStore.setState({ draft });
}

export function clearSendDraft(): void {
	useSendDraftStore.setState({ draft: null });
}
