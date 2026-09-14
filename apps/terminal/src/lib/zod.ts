import { config } from "zod";

// The edge policy has no 'unsafe-eval'. Zod 4 probes `new Function("")` while the first object
// schema is built to choose its JIT parser; the probe is blocked and reported as a CSP violation.
// Every schema module imports Zod through this file, so the JIT is off before any schema exists.
// The fallback parser is what ran under the policy anyway. A side-effect import in the hydration
// entry is not enough: a chunk's imports run before its own body, so schemas in other chunks
// would be built first.
config({ jitless: true });

export * from "zod";
