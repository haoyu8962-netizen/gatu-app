interface Props {
	busy?: boolean;
}

export function PassiveDataPlaceholder({ busy = false }: Props) {
	return <div data-slot="passive-data-placeholder" aria-busy={busy} className="h-full min-h-0 w-full flex-1" />;
}
