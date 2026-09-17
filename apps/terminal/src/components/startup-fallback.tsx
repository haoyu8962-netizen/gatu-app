export function StartupFallback() {
	return (
		<div aria-busy="true" data-testid="startup-fallback">
			<output className="sr-only">Loading GATU...</output>
		</div>
	);
}
