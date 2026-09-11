# Legacy mobile ticket client

`mobile-sync-legacy-client.mjs` is the actual client module from commit `4639917c`, transformed from TypeScript to ES2022 with the locked Vite/esbuild toolchain. Its sole policy import is inlined as the original `60_000` constant. It retains the old request bodies and response handling.

The production HTTP checker runs its registration and consumption functions against the real new server, including the default-closed build. Both fail closed with their original unavailable result. This fixture tests the shipped old transport semantics; physical old-page refresh, PWA and wallet UX remain in the device runbook.
