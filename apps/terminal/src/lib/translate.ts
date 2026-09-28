import type { MessageDescriptor } from "@lingui/core";

/**
 * A render-time translator that only accepts message descriptors.
 *
 * Helpers receive this instead of the macro `t` from `useLingui()`: the macro only rewrites
 * tagged templates written inside the component that called `useLingui()`, so a tagged template
 * on a passed-in `t` reaches `i18n._` untransformed and renders an empty string. Build the
 * descriptor with `msg` and pass it to this function instead.
 */
export type Translate = (descriptor: MessageDescriptor) => string;
