import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "gatu", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
