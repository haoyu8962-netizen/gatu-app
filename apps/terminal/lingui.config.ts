import { defineConfig } from "@lingui/cli"

export default defineConfig({
  catalogs: [
    {
      include: ["src"],
      path: "<rootDir>/src/locales/{locale}/messages",
    },
  ],
  // Maintained terminal interface languages
  locales: ["en", "zh", "ja", "hi", "es", "fr", "ar"],
  sourceLocale: "en",
  formatOptions: {
    lineNumbers: false,
  },
})
