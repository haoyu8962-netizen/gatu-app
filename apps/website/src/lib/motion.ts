// Motion values for the site, read at build time from the brand motion tokens (plan §6). Base.astro writes them
// as custom properties; global.css uses only these properties for durations and easings.

import tokens from "../../../../brand/loader/sairn-motion.tokens.json" with { type: "json" };

/** Press and hover feedback runs at half the brand feedback duration, so a tap never lags behind the finger. */
const PRESS_DIVISOR = 2;

/** Content swaps (page cross-fade, tab panels, disclosures) also run at half the feedback duration, so a page change never waits on them. */
const SWAP_DIVISOR = 2;

export const MOTION_CSS_VARIABLES: Readonly<Record<string, string>> = {
	"--motion-duration-feedback": `${tokens.duration.feedback}ms`,
	"--motion-duration-confirm": `${tokens.duration.confirm}ms`,
	"--motion-duration-press": `${tokens.duration.feedback / PRESS_DIVISOR}ms`,
	"--motion-duration-swap": `${tokens.duration.feedback / SWAP_DIVISOR}ms`,
	"--motion-duration-brand": `${tokens.duration.brand}ms`,
	"--motion-duration-loop-calm": `${tokens.duration["loop-calm"]}ms`,
	"--motion-ease-enter": tokens.easing.enter,
	"--motion-ease-fade": tokens.easing.fade,
	"--motion-ease-loop": tokens.easing.loop,
};

export const MOTION_ROOT_RULE = `:root{${Object.entries(MOTION_CSS_VARIABLES)
	.map(([name, value]) => `${name}:${value}`)
	.join(";")}}`;
