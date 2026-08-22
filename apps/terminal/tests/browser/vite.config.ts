import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root,
	plugins: [
		viteTsConfigPaths({ projects: [fileURLToPath(new URL("../../tsconfig.json", import.meta.url))] }),
		viteReact({
			babel: {
				plugins: ["@lingui/babel-plugin-lingui-macro", "babel-plugin-react-compiler"],
			},
		}),
		tailwindcss(),
	],
	server: {
		fs: {
			allow: [fileURLToPath(new URL("../../../..", import.meta.url))],
		},
	},
});
