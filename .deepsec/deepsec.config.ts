import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "hypeterminal", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
