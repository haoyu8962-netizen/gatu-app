/**
 * Matches every in-progress indicator: the spinning Phosphor icons and the Sairn motion components
 * (`ButtonLoading`, looping `StatusGlyph` and `StatusMotion`), which mark themselves with
 * `data-loading-indicator`. Assertions that no progress is shown must use this selector so they keep
 * failing when a spinner is replaced by a motion component.
 */
export const LOADING_INDICATOR_SELECTOR = ".animate-spin, [data-loading-indicator]";
