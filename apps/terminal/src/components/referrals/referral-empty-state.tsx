interface Props {
	text: string;
}

export function ReferralEmptyState({ text }: Props) {
	return <p className="px-4 py-12 text-center text-xs text-fg-muted">{text}</p>;
}
