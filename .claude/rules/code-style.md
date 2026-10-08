---
globs: ["*.ts", "*.tsx", "*.js", "*.jsx"]
alwaysApply: true
description: Code style rules
---

## Component Structure

- **One component per file** - Small internal helpers OK
- **No index.ts barrel files** - Import directly from files
- **Name props interface `Props`** - Always use `interface Props`, not `type`
- **Prefer function declarations** - `function handleClick()` over arrows
- **Use `cn()` for classes** - From `@/lib/cn` for conditional classes
- **Keep components clean** - Move calculations to `lib/` utilities
- **Organize utils by domain** - `lib/trade/`, `lib/chart/`, etc.
- **Minimize useEffect** - Only for true side effects
- **No comments in components** - Logic should be self-explanatory

## Comments & Console

- No unnecessary comments - code should be self-documenting
- Never leave `console.log` in production code

## Helper Functions

Only create helpers when logic is reused, complex, or significantly improves readability. Don't create helpers for simple one-liners.

## Ternary Operators

- Use ternaries only for simple single-level conditionals
- **Never nest ternary operators** - use a helper function with early returns instead

## React Hooks

- **React 19 Compiler**: Project uses React 19 with the compiler enabled. Don't add manual `useMemo`/`useCallback` for performance - the compiler handles memoization automatically (one documented exception under useMemo below).
- **useEffect**: Only for side effects (subscriptions, DOM, external APIs). Never for derived state.
- **useMemo**: Only for semantic purposes (e.g., referential equality for context values). Not needed for performance. The one documented exception is the `useMemo` around `buildChart` in `PortfolioPerformanceChart`: without it the compiled output stops caching the chart model (cache slots 118 → 43) and every pointer move rebuilds it (`docs/i18n-presentation.md`). Add another exception only with the same compiled-output evidence.
- **useState**: Prefer primitives/indices over complex objects.
- **useCallback**: Only when semantically required. Not needed for performance.

## hl-react Subscriptions

- Use `useSubscription(method, params)` for real-time data (the order book goes through the app's feed hook and the shared `l2Book` transport pool)
- Use `useInfo(method, params)` for one-time fetches
- Use `useExchange(method, options)` for signed mutations
- Process data in `lib/`, not components
- Only memoize array transformations, not trivial calculations
- Use literal types: `nSigFigs: 2 | 3 | 4 | 5` not `number`


## Format Functions

Pass API values directly to formatters - they accept `string | number | null | undefined`:

In components and hooks, take the number formatters from `useNumberFormat()` (`const { formatUSD } = useNumberFormat()`) and pass them to presentation helpers; never reference the module-level number formatters anywhere in a component or hook, including its event handlers and effects (ADR 0036). Likewise every `formatDateTime`, `formatDateTimeShort`, `formatTime` and `formatList` call in a component or hook passes a `locale` option: `const locale = i18n.locale;` read during render, or `i18n.locale` read inside an effect, an inline event handler or a CSV row builder (`buildRows`), which runs when the export generates its rows, so its dates match the headers `t` translates then (`docs/i18n-presentation.md`, `date-locale-reactivity-contract`).


## Icons

- Use `@phosphor-icons/react` for all icons
- Import convention: append `Icon` to the icon name, e.g. `CrossIcon`, `CaretDownIcon`, `BellIcon`
- Example: `import { CrossIcon } from "@phosphor-icons/react"`

## Comment Policy

### Unacceptable Comments
- Comments that repeat what code does
- Commented-out code (delete it)
- Obvious comments ("increment counter")
- Comments instead of good naming

### Principle
Code should be self-documenting. If you need a comment to explain WHAT the code does, consider refactoring to make it clearer.