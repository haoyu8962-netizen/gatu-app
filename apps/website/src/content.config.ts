import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.coerce.date(),
		updated: z.coerce.date().optional(),
		author: z.string().optional(),
		draft: z.boolean().optional(),
	}),
});

const legal = defineCollection({
	loader: glob({
		pattern: ["privacyPolicy.md", "riskDisclosure.md", "terms.md", "support.md"],
		base: "../../legal",
		generateId: ({ entry }) => entry.replace(/\.md$/, ""),
	}),
	schema: z.looseObject({}),
});

export const collections = { blog, legal };
