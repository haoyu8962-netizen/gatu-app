import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	resolve: {
		dedupe: ["react", "react-dom", "@tanstack/react-query", "wagmi"],
	},
	plugins: [
		viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
		viteReact({
			babel: {
				plugins: ["@lingui/babel-plugin-lingui-macro", "babel-plugin-react-compiler"],
			},
		}),
	],
	test: {
		environment: "node",
		setupFiles: ["./src/lib/tests/setup.ts"],
	},
});
