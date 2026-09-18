import { lazyRouteComponent } from "@tanstack/react-router";
import { createElement, type FunctionComponent, type ReactNode, use } from "react";

/**
 * Lazy-loaded component with preloading support. Uses TanStack Router's
 * lazyRouteComponent which defers evaluation on the server too — `React.lazy()`
 * does NOT (Vite's SSR runner walks the full import chain), so prefer this
 * helper for SSR-unsafe modules.
 *
 * Adds `.preload()` for hover prefetch, recovers from stale-build module-not-
 * found errors, and uses React 19's `React.use()` under the hood.
 *
 * @example
 * const Chart = createLazyComponent(() => import("./chart"), "Chart");
 * <button onMouseEnter={() => Chart.preload()}>Show Chart</button>
 */
export function createLazyComponent<T extends Record<string, unknown>, K extends keyof T>(
	importer: () => Promise<T>,
	exportName: K,
) {
	return lazyRouteComponent(importer, exportName);
}

/**
 * Creates a lazy-loaded component that uses the default export.
 *
 * @example
 * const Modal = createLazyDefault(() => import("./modal"));
 */
interface PreloadableComponent {
	preload?: () => Promise<void>;
}

/**
 * Resolves once every given lazy component has finished (or failed) loading, so a caller can wait
 * for a set of `createLazyComponent` pieces before revealing a tree that renders them.
 */
export function preloadLazyComponents(components: ReadonlyArray<PreloadableComponent>): Promise<void> {
	return Promise.all(components.map((component) => component.preload?.())).then(() => undefined);
}

export function createLazyDefault<T extends { default: React.ComponentType<unknown> }>(importer: () => Promise<T>) {
	return lazyRouteComponent(importer, "default");
}

const LAZY_COMPONENT_LOAD_FALLBACK_MESSAGE = "Lazy component failed to load";

export class LazyComponentLoadError extends Error {
	/** Clears the failure so the next render starts a new import; an error boundary calls it on retry. */
	readonly retry: () => void;

	constructor(cause: unknown, retry: () => void) {
		super(cause instanceof Error ? cause.message : LAZY_COMPONENT_LOAD_FALLBACK_MESSAGE, { cause });
		this.name = "LazyComponentLoadError";
		this.retry = retry;
	}
}

/**
 * Lazy component for surfaces that hold unsaved input, such as the order form. `createLazyComponent`
 * answers a missing chunk by reloading the page on the next render, which would discard the draft, and
 * it never retries a failed import. This variant never reloads. A failed import that a render was
 * waiting for stays a `LazyComponentLoadError` until its `retry()` is called, so React's re-render
 * after the rejection reaches the error boundary instead of starting another import in a loop. A
 * failed preload that no render waited for is forgotten, so the first real open simply tries again.
 */
export function createRetryableLazyComponent<T extends Record<string, unknown>, K extends keyof T>(
	importer: () => Promise<T>,
	exportName: K,
) {
	type Props = T[K] extends (props: infer P) => unknown ? (P extends object ? P : never) : never;

	let loaded: FunctionComponent<Props> | undefined;
	let pending: Promise<void> | undefined;
	let failure: LazyComponentLoadError | undefined;
	let awaitedByRender = false;

	function clearFailure() {
		failure = undefined;
	}

	function load(): Promise<void> {
		if (loaded) return Promise.resolve();
		pending ??= importer().then(
			(module) => {
				loaded = module[exportName] as FunctionComponent<Props>;
				pending = undefined;
				failure = undefined;
				awaitedByRender = false;
			},
			(error: unknown) => {
				const loadError = new LazyComponentLoadError(error, clearFailure);
				if (awaitedByRender) failure = loadError;
				pending = undefined;
				awaitedByRender = false;
				throw loadError;
			},
		);
		return pending;
	}

	function RetryableLazy(props: Props): ReactNode {
		if (!loaded) {
			if (failure) throw failure;
			awaitedByRender = true;
			use(load());
		}
		return loaded ? createElement(loaded, props) : null;
	}

	RetryableLazy.preload = (): Promise<void> => load().catch(() => undefined);
	return RetryableLazy;
}
