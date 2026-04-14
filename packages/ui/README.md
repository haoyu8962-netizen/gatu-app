# @hypeterminal/ui

The HypeTerminal design system. Primitives, tokens, and variants — nothing app-specific.

Built on [Base UI](https://base-ui.com) (headless accessibility primitives), [Tailwind CSS v4](https://tailwindcss.com) (utility classes + `@theme` tokens), [Class Variance Authority](https://cva.style) (variants), and [Phosphor Icons](https://phosphoricons.com).

Source-shipped workspace package — `"main": "./src/index.ts"`, no build step. Consumers import TypeScript directly.

## What it owns

- **Accessible primitives** wrapping Base UI: `Button`, `Modal`, `Drawer`, `Dropdown`, `Tooltip`, `Select`, `Combobox`, `Slider`, `Tabs`, etc.
- **Design tokens** as Tailwind v4 `@theme` CSS variables: colors (light/dark), spacing, radius, shadows, typography scale.
- **Variant styling** via CVA — predictable `variant` / `intent` / `size` props.
- **A `cn()` utility** wrapping `clsx` + `tailwind-merge`.

Not in scope: app-specific compositions, business logic, terminal-shaped components. Those live in `apps/terminal/src/components/ui/` and compose these primitives.

## Directory layout

Flat structure — one component per file, `~37` `.tsx` primitives, plus token and utility files.

```
packages/ui/src/
├── index.ts                public exports (Button, Modal, Drawer, Select, …)
├── globals.css             Tailwind v4 @theme + semantic tokens + base layer
├── utils.ts                cn() = twMerge(clsx(...))
├── config.ts · types.ts    shared config + variant types
├── button.tsx              Button, ButtonIcon, ButtonGroup, buttonVariants
├── modal.tsx               Modal.Root/Trigger/Content/... + AdaptiveModal (auto mobile/desktop)
├── drawer.tsx              4-sided drawers
├── dropdown.tsx · tooltip.tsx
├── text-input.tsx · search-input.tsx · number-input.tsx · textarea.tsx
├── checkbox.tsx · radio-group.tsx · toggle.tsx · slider.tsx
├── select.tsx · combobox.tsx
├── tabs.tsx · segmented-controls.tsx
├── table.tsx · pagination.tsx · breadcrumbs.tsx
├── card.tsx · divider.tsx
├── badge.tsx · tag.tsx · alert.tsx · progress-indicator.tsx
├── text.tsx · text-block.tsx · text-link.tsx
└── ...
```

## Design tokens

All tokens live in `src/globals.css` as Tailwind v4 `@theme` CSS variables. Three layers:

### Primitives

- **Spacing**: 8-px base grid.
- **Greys**: 6 solid values (white → black).
- **Radius**: 8 values (0–32 px), all scaled by `--radius-factor` — adjust once, everything resizes.
- **Shadows**: 3 levels.
- **Font**: Inter Variable (`@fontsource-variable/inter`).

### Typography scale

`text-3xs` · `text-2xs` · `text-xs` · `text-sm` · `text-base` · `text-lg` · `text-xl` · `text-2xl` · `text-3xl` — with paired `--line-height-*` tokens and mobile overrides.

### Semantic tokens (light + dark)

Everything in the app references semantic names, not raw colors. Categories:

| Prefix | Purpose | Examples |
|---|---|---|
| `bg-*` | Backgrounds (elevation model: sunken → base → raised → overlay) | `bg-bg-base`, `bg-bg-raised`, `bg-bg-overlay` |
| `text-*` | Text intensities / intents | `text-text-strong`, `text-text-weak`, `text-text-brand` |
| `fill-*` | Non-elevation backgrounds (chips, hover states, scrims) | `bg-fill-weak`, `bg-fill-hover`, `bg-fill-brand-strong` |
| `stroke-*` | Borders & dividers | `border-stroke-weak`, `border-stroke-focus` |
| `icon-*` | Icon colors | `text-icon-neutral`, `text-icon-error` |
| `market-*` | Trading: up / down / neutral | `text-market-up`, `bg-market-down` |
| `scope-*` | DEX category tints | `bg-scope-perp`, `bg-scope-spot`, `bg-scope-builders` |

Full taxonomy lives in `.claude/rules/design-tokens.md`. **Never use hex literals** (e.g. `text-[#2b2e48]`) — always a semantic token.

Dark mode is a class variant: `@custom-variant dark (&:where(.dark, .dark *))`.

## Component API pattern

CVA + Base UI is the standard pattern:

```tsx
// button.tsx — illustrative
const buttonVariants = cva("base classes", {
  variants: {
    variant: { filled, outline, ghost, link },
    intent:  { brand, neutral, error, inverse },
    size:    { xxs, xs, sm, md, lg },
  },
  defaultVariants: { variant: "filled", intent: "brand", size: "md" },
});

<Button variant="outline" intent="neutral" size="sm">Label</Button>
```

Overlays use Base UI's compound pattern:

```tsx
<Modal.Root>
  <Modal.Trigger />
  <Modal.Content>
    <Modal.Title />
    <Modal.Description />
    <Modal.Close />
  </Modal.Content>
</Modal.Root>

// AdaptiveModal auto-switches Dialog ↔ Drawer at the 768 px breakpoint
<AdaptiveModal>...</AdaptiveModal>
```

## Usage

```tsx
// App-level styles entry — apps/terminal/src/styles.css
@import "tailwindcss";
@import "@hypeterminal/ui/globals.css";
@source "../../../packages/ui/src";   // scan primitives for used utilities
```

```tsx
// In any component
import { Button, Modal, TextInput } from "@hypeterminal/ui";

<Button variant="filled" intent="brand" size="md">Place order</Button>
```

### Wrapping, not forking

When the app needs a specialized component, wrap — don't modify the primitive. Wrappers live in `apps/terminal/src/components/ui/`:

```tsx
// apps/terminal/src/components/ui/info-row.tsx
import { Divider } from "@hypeterminal/ui";

export function InfoRow({ label, value }: Props) {
  return (
    <div className="flex justify-between text-xs text-text-weak">
      <span>{label}</span>
      <span className="text-text-strong tabular-nums">{value}</span>
    </div>
  );
}
```

See `.claude/rules/ui-library.md` for the full convention.

## Peer dependencies

```json
"@base-ui/react":            "^1.3.0",
"@phosphor-icons/react":     "^2.1.0",
"class-variance-authority":  "^0.7.0",
"clsx":                      "^2.1.0",
"react":                     "^19.0.0",
"tailwind-merge":            "^3.0.0",
"tailwindcss":               "^4.0.0"
```

No runtime deps — the consuming app owns the versions.

## Exports

```ts
// index (components + utils)
import { Button, Modal, Table, cn } from "@hypeterminal/ui";

// tokens + base styles
import "@hypeterminal/ui/globals.css";
```

## Conventions

- **One component per file.** No barrel subdirectories.
- **Props interface named `Props`.** Never `type ComponentProps`.
- **CVA for variants.** No ad-hoc className switches inside the component.
- **Use `cn()` from `./utils`.** Never call `clsx` or `twMerge` directly.
- **No app logic.** If it knows about orders, markets, or Hyperliquid, it doesn't belong here — build it in the app and compose primitives.
