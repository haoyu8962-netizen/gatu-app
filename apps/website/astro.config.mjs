import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import brand from "../../brand/brand.json" with { type: "json" };

// Latin subset only (plan §6), the same range Fontsource ships for its latin files.
const LATIN_UNICODE_RANGE = [
	"U+0000-00FF",
	"U+0131",
	"U+0152-0153",
	"U+02BB-02BC",
	"U+02C6",
	"U+02DA",
	"U+02DC",
	"U+0304",
	"U+0308",
	"U+0329",
	"U+2000-206F",
	"U+20AC",
	"U+2122",
	"U+2191",
	"U+2193",
	"U+2212",
	"U+2215",
	"U+FEFF",
	"U+FFFD",
];

// Hyperliquid's public API is the only remote origin the pages talk to: REST for the live numbers and the
// WebSocket for the Open Book. Everything else is served from this origin.
const CSP_DIRECTIVES = [
	"default-src 'self'",
	"connect-src 'self' https://api.hyperliquid.xyz wss://api.hyperliquid.xyz",
	"img-src 'self' data:",
	"media-src 'self'",
	"font-src 'self'",
];

export default defineConfig({
	site: `https://${brand.domains.primary.apex}`,
	output: "static",
	// Astro 7 strips whitespace by JSX rules by default; the templates rely on HTML whitespace between inline
	// elements and text on separate lines ("risk. Risk disclosure"), so keep the HTML-aware compression.
	compressHTML: true,
	// The fonts come from the installed Fontsource packages, read from node_modules at build time, so the build
	// needs no network. Plex Sans blocks briefly and is preloaded (Base.astro), as in the terminal, so headings never
	// repaint in a fallback; Plex Mono is not preloaded and swaps, and its 600-unit advance matches the monospace stack.
	// Generated fallback metrics stay off: Astro 7.4.2 writes the metric-matched fallback face (local Arial or Courier
	// New) without the subset's unicode-range, so it would take over every glyph outside the latin files (the → of
	// every link, the ▲▼ of the 24h changes) instead of the system font that draws them today.
	fonts: [
		{
			provider: fontProviders.local(),
			name: "IBM Plex Sans Variable",
			cssVariable: "--font-plex-sans",
			fallbacks: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
			optimizedFallbacks: false,
			options: {
				variants: [
					{
						src: ["@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2"],
						weight: "100 700",
						style: "normal",
						display: "block",
						unicodeRange: LATIN_UNICODE_RANGE,
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "IBM Plex Mono",
			cssVariable: "--font-plex-mono",
			fallbacks: ["ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
			optimizedFallbacks: false,
			options: {
				variants: [
					{
						src: ["@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2"],
						weight: 400,
						style: "normal",
						display: "swap",
						unicodeRange: LATIN_UNICODE_RANGE,
					},
				],
			},
		},
	],
	// A <meta http-equiv="content-security-policy"> on every page: Astro hashes the scripts and styles it emits
	// into script-src and style-src. A meta policy cannot carry frame-ancestors, report-to or sandbox; those belong
	// in the CloudFront response-headers policy (plan §8).
	security: {
		csp: {
			directives: CSP_DIRECTIVES,
		},
	},
	// Shiki writes inline style attributes, which the CSP above blocks. The legal pages and the blog have no code
	// blocks; .prose-body styles a plain <pre> if one appears.
	markdown: {
		syntaxHighlight: false,
	},
	// The blog stays out of the sitemap (and noindex) until its first article is published.
	integrations: [sitemap({ filter: (page) => !new URL(page).pathname.startsWith("/blog/") })],
	vite: {
		plugins: [tailwindcss()],
	},
});
