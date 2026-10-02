import { BRAND_NAME } from "@/config/brand";

export function StartupFallback() {
	return (
		<div aria-busy="true" data-testid="startup-fallback">
			<output className="sr-only">{`Loading ${BRAND_NAME}...`}</output>
		</div>
	);
}
