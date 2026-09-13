---
globs: ["*.ts", "*.tsx"]
alwaysApply: true
description: SSR safety rules for TanStack Start
---

## SSR Safety (TanStack Start)

This project uses TanStack Start. Runtime server rendering is off: the Node process answers navigations from the prerendered `_shell.html` and document pages (`src/lib/static-pages/`). Module-level code still runs on the server during the build-time prerender and in the dev server, so every rule below still applies.

- **Never access browser APIs (`document`, `window`, `localStorage`, `navigator`) at module top-level** without a guard: `if (typeof document === "undefined") return;`
- **`React.lazy()` does NOT prevent SSR evaluation** — Vite's SSR module runner still evaluates the full import chain of dynamic imports. Do not use `lazy()` as an SSR escape hatch.
- **For client-only components**, use `ClientOnly` from `@tanstack/react-router`:
  ```tsx
  import { ClientOnly } from "@tanstack/react-router";
  <ClientOnly fallback={null}>
    <MyBrowserOnlyComponent />
  </ClientOnly>
  ```
- **For client-only utilities**, use `createClientOnlyFn` from `@tanstack/react-start`:
  ```tsx
  import { createClientOnlyFn } from "@tanstack/react-start";
  const saveToStorage = createClientOnlyFn((key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
  ```
- **Zustand stores with `persist` middleware** are SSR-safe (deferred storage access), but any store-level side effects that touch the DOM must be guarded with `typeof document === "undefined"`.
