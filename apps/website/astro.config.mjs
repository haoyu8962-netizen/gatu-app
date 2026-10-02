import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import brand from "../../brand/brand.json" with { type: "json" };

export default defineConfig({
	site: `https://${brand.domains.primary.apex}`,
	output: "static",
	integrations: [sitemap()],
	vite: {
		plugins: [tailwindcss()],
	},
});
