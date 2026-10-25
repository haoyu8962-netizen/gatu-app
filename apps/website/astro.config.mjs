import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import brand from "../../brand/brand.json" with { type: "json" };

export default defineConfig({
	site: `https://${brand.domains.primary.apex}`,
	output: "static",
	// The blog stays out of the sitemap (and noindex) until its first article is published.
	integrations: [sitemap({ filter: (page) => !new URL(page).pathname.startsWith("/blog/") })],
	vite: {
		plugins: [tailwindcss()],
	},
});
