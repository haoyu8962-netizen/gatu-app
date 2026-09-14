import { config } from "zod";

// Mirrors apps/terminal/src/lib/zod.ts: the terminal's Content-Security-Policy has no
// 'unsafe-eval', so Zod's JIT probe must be switched off before the first object schema exists.
config({ jitless: true });

export * from "zod";
