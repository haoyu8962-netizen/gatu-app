# UI Design System Audit

## Scope

- Component library audited: `packages/ui/src`
- App-local UI wrappers audited: `apps/terminal/src/components/ui`
- Trade surfaces audited, including TradingView integration: `apps/terminal/src/components/trade`

## Design System Border Tokens

Source of truth: `packages/ui/src/globals.css`

Light:

- `--stroke-strong`: `#000d4d73`
- `--stroke-weak`: `#0011661a`
- `--stroke-selected`: `#4c64d9`
- `--stroke-focus`: `#4c64d9`
- `--stroke-disabled`: `#0011661a`
- `--stroke-brand-strong`: `#4c64d9cc`
- `--stroke-brand-weak`: `#4c64d933`
- `--stroke-error-strong`: `#c73a3acc`
- `--stroke-error-weak`: `#c73a3a24`
- `--stroke-warning-strong`: `#8f6c1acc`
- `--stroke-warning-weak`: `#8f6c1a33`
- `--stroke-success-strong`: `#067a57cc`
- `--stroke-success-weak`: `#067a5733`
- `--stroke-info-strong`: `#1a74a8cc`
- `--stroke-info-weak`: `#1a74a833`
- `--stroke-inverse-strong`: `#ffffff99`
- `--stroke-inverse-weak`: `#ffffff1f`
- `--stroke-inverse-disabled`: `#ffffff1f`

Dark:

- `--stroke-strong`: `#ffffff99`
- `--stroke-weak`: `#ffffff1f`
- `--stroke-selected`: `#b2bcf1`
- `--stroke-focus`: `#b2bcf1`
- `--stroke-disabled`: `#ffffff1f`
- `--stroke-brand-strong`: `#b2bcf1cc`
- `--stroke-brand-weak`: `#b2bcf133`
- `--stroke-error-strong`: `#ff9c9ccc`
- `--stroke-error-weak`: `#ff9c9c33`
- `--stroke-warning-strong`: `#e0be70cc`
- `--stroke-warning-weak`: `#e0be7033`
- `--stroke-success-strong`: `#77c7afcc`
- `--stroke-success-weak`: `#77c7af33`
- `--stroke-info-strong`: `#7ec0e5cc`
- `--stroke-info-weak`: `#7ec0e533`
- `--stroke-inverse-strong`: `#000d4d73`
- `--stroke-inverse-weak`: `#0011661a`
- `--stroke-inverse-disabled`: `#0011661a`

Default global border fallback:

- `* { border-color: var(--stroke-weak) }`

## UI Inventory

### `packages/ui` exports

- Alerts: `Alert`, `AlertGlobal`
- Inputs: `Autocomplete`, `Combobox`, `Select`, `TextInput`, `Textarea`, `NumberInput`, `SearchInput`, `Slider`, `Checkbox`, `CheckboxGroup`, `RadioGroup`, `RadioGroupItem`, `Toggle`
- Actions: `Button`, `ButtonIcon`, `ButtonGroup`, `ButtonGroupItem`, `Dropdown`
- Navigation: `Breadcrumbs`, `BreadcrumbItem`, `Pagination`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `SegmentedControls`, `SegmentedControlItem`
- Data display: `Avatar`, `AvatarGroup`, `Badge`, `BadgeCount`, `BadgeDot`, `Card`, `Table`, `ProgressIndicator`, `Tag`, `Text`, `TextBlock`, `TextLink`, `Tooltip`, `Divider`, `Slot`
- Surfaces: `Modal`, `Drawer`

### App-local UI wrappers

- `Input`
- `Popover`
- `Command`
- `InfoRow`
- `NumberInput`
- `Resizable`
- `ScrollArea`
- `Skeleton`
- `Sonner`
- `Spinner`
- `Collapsible`
- `TimeTicker`

## Public Props Inventory

This list focuses on explicit/custom props and variant axes, not inherited native DOM props.

### Core actions

- `ButtonProps`
  - Own: `iconLeft`, `iconRight`
  - Variants: `variant=filled|outline|ghost|link`, `intent=brand|neutral|error|inverse`, `size=xxs|xs|sm|md|lg`
- `ButtonIconProps`
  - Variants: `variant=filled|outline|ghost`, `intent=brand|neutral|error|inverse`, `size=xxs|xs|sm|md|lg`
- `ButtonGroupProps`
  - Own: `size`, `intent`, `disabled`, `className`, `children`
  - Variants: `variant=outline|filled|ghost`
- `ButtonGroupItemProps`
  - Own: `className`, `iconLeft`, `iconRight`

### Inputs & selection

- `AutocompleteProps`
  - Own: `label`, `helperText`, `placeholder`, `options`, `multiple`, `errorMessage`, `required`, `disabled`, `className`, `size`, `value`, `defaultValue`, `onValueChange`
  - Variants: `size=xxs|xs|sm|md|lg`, `error=true|false`, `type=single|multiple`
- `ComboboxProps`
  - Own: `label`, `helperText`, `placeholder`, `options`, `multiple`, `errorMessage`, `required`, `disabled`, `className`, `size`, `value`, `defaultValue`, `onValueChange`
  - Variants: `size=xxs|xs|sm|md|lg`, `error=true|false`, `type=single|multiple`
- `SelectProps`
  - Own: `label`, `helperText`, `placeholder`, `options`, `errorMessage`, `required`, `disabled`, `className`, `name`, `value`, `defaultValue`, `onValueChange`
  - Variants: `size=xxs|xs|sm|md|lg`, `error=true|false`
- `TextInputProps`
  - Own: `label`, `hint`, `error`, `optional`, `prefix`, `iconLeft`, `iconRight`, `size`
  - Variants: `size=xxs|xs|sm|md|lg`, `invalid=true|false`
- `TextareaProps`
  - Own: `label`, `helperText`, `errorMessage`, `resize`, `size`
  - Variants: `size=xxs|xs|sm|md|lg`, `error=true|false`
- `NumberInputProps`
  - Own: `value`, `defaultValue`, `onValueChange`, `onValueCommitted`, `min`, `max`, `step`, `smallStep`, `largeStep`, `format`, `locale`, `allowOutOfRange`, `allowWheelScrub`, `label`, `hint`, `error`, `required`, `optional`, `disabled`, `readOnly`, `name`, `id`, `placeholder`, `autoFocus`, `selectOnFocus`, `showStepper`, `prefix`, `iconLeft`, `className`, `size`, `onBlur`, `onFocus`
  - Variants: `size=xxs|xs|sm|md|lg`, `invalid=true|false`
- `SearchInputProps`
  - Own: `label`, `helperText`, `errorMessage`, `onClear`
  - Variants: `size=xxs|xs|sm|md|lg`, `error=true|false`
- `CheckboxProps`
  - Own: `className`, `label`, `description`, `errorMessage`
  - Variants: `size=xxs|xs|sm|md|lg`, `error=true|false`
- `CheckboxGroupProps`
  - Own: `label`
- `RadioGroupProps`
  - Own: `orientation`
- `RadioGroupItemProps`
  - Own: `label`, `description`
  - Variants: `size=xxs|xs|sm|md|lg`
- `ToggleProps`
  - Own: `className`, `label`
  - Variants: `size=xxs|xs|sm|md|lg`
- `SliderProps`
  - Own: `className`, `label`, `showValue`

### Navigation

- `BreadcrumbsProps`
  - Own: `separator`
  - Variants: `size=xxs|xs|sm|md|lg`
- `BreadcrumbItemProps`
  - Own: `href`, `current`
- `PaginationProps`
  - Own: `currentPage`, `totalPages`, `onPageChange`, `totalItems`, `itemsPerPage`, `size`
  - Variants: `variant=desktop|mobile`
- `TabsProps`
  - Own: `size`, `variant`, `fullWidth`, `disabled`
- `TabsTriggerProps`
  - Own: `icon`
- `SegmentedControlsProps`
  - Own: `value`, `defaultValue`, `onValueChange`, `size`, `disabled`, `className`, `children`
  - Variants: `fullWidth=true`
- `SegmentedControlItemProps`
  - Own: `icon`

### Surfaces & overlays

- `CardProps`
  - Own: `size`
  - Variants: `variant=elevated|outlined|filled`, `orientation=vertical|horizontal`
- `ModalPopupProps`
  - Own: `showClose`
  - Variants: `size=sm|md|lg`
- `DrawerProps`
  - Own: `side`
- `DrawerContentProps`
  - Own: `overlay`
  - Variants: `side=right|left|top|bottom`, `size=default|wide`
- `DropdownProps`
  - Own: `trigger`, `items`, `groups`, `disabled`, `className`, `align`, `triggerVariant`, `triggerAriaLabel`, `triggerClassName`
  - Variants: `size=xxs|xs|sm|md|lg`
- `PopoverContent` in app-local UI
  - Own: `align`, `sideOffset`, `collisionPadding`

### Display

- `AlertProps`
  - Own: `tone`, `size`, `layout`, `borderLeft`, `icon`, `title`, `description`, `actions`, `onClose`
  - Variants: `tone=error|warning|success|information|neutral|brand|inverse-neutral|inverse-brand`
- `AlertGlobalProps`
  - Own: `tone`, `icon`, `action`, `onClose`
  - Variants: `tone=error|warning|success|information|neutral|brand|inverse-neutral|inverse-brand`
- `AvatarProps`
  - Own: `src`, `alt`, `initials`, `status`
  - Variants: `size=xxs|xs|sm|md|lg`
- `AvatarGroupProps`
  - Own: `max`, `size`
- `BadgeProps`
  - Own: `tone`, `icon`, `dot`
  - Variants: `tone=error|warning|success|information|neutral|brand`, `size=xxs|xs|sm|md|lg`
- `BadgeCountProps`
  - Variants: `emphasis=strong|moderate|weak`
- `BadgeDotProps`
  - Own: `tone`, `outline`
  - Variants: `tone=error|warning|success|information|neutral|brand`, `size=xxs|xs|sm|md|lg`
- `ProgressIndicatorProps`
  - Own: `currentStep`, `totalSteps`, `label`, `onBack`, `backLabel`, `disabled`
- `TagProps`
  - Own: `selected`, `disabled`, `onDismiss`
  - Variants: `variant=filled|outline`, `size=xxs|xs|sm|md|lg`
- `TextProps`
  - Own: `as`
  - Variants: `variant=display|h1|h2|h3|h4|small|tiny|uppercase`, `color=strong|weak|brand|disabled|error|warning|success|info|inverse-strong|inverse-weak`, `weight=strong|weak`
- `TextLinkProps`
  - Own: `disabled`, `iconLeft`, `iconRight`
  - Variants: `size=xxs|xs|sm|md|lg`, `weight=regular|strong`, `intent=brand|neutral|error`, `underline=true|false`
- `TextBlockProps`
  - Own: `icon`, `heading`, `description`, `linkLabel`, `linkHref`, `onLinkClick`
  - Variants: `align=left|center`
- `TooltipProps`
  - Own: `children`, `content`, `side`, `align`, `sideOffset`, `open`, `defaultOpen`, `onOpenChange`, `delay`, `closeDelay`, `arrow`, `className`
- `DividerProps`
  - Variants: `orientation=horizontal|vertical`
- `SlotProps`
  - Variants: `size=xxs|xs|sm|md|lg|xl|fill`
- `TableProps`
  - Variants: `variant=default|striped`

## Border Usage Summary

### `packages/ui`

Mostly consistent with semantic tokens.

Most common border tokens:

- `border-stroke-weak`: 26
- `focus-visible:outline-stroke-focus`: 22
- `border-stroke-strong`: 17
- `border-stroke-disabled`: 13
- `border-stroke-error-strong`: 11

Pattern:

- Neutral containers and dividers use `stroke-weak`
- Form controls use `stroke-strong`
- Error states use `stroke-error-strong`
- Focus states generally use `stroke-focus`

### App trade surfaces

Mostly token-based, but with many local opacity variants layered on top.

Most common border tokens:

- `border-stroke-weak/40`: 37
- `border-stroke-weak`: 23
- `border-stroke-error-strong`: 23
- `border-stroke-weak/60`: 23
- `border-stroke-error-strong/30`: 12

Pattern:

- Neutral cards and mobile list rows often use `/40`, `/50`, `/60`
- Error and success status cards frequently use `/20` or `/30`
- Brand emphasis often uses `border-stroke-brand-strong/30` or `/60`

## TradingView Audit

### Status

TradingView is largely wired into the design system.

Evidence:

- `tradingview-chart.tsx` passes `overrides` and `custom_css_url`
- `theme-colors.ts` derives chart border values from `--stroke-weak`
- Generated TradingView CSS maps many `--themed-color-*` and `--tv-color-*` variables back to DS-derived values

### Implication

- Vendor bundle CSS contains hardcoded fallbacks like `#2962ff`, `#e0e3eb`, `#434651`
- Those are fallback values inside the library, not the primary source for the in-app themed widget
- Border consistency risk is mainly in our override coverage, not in the vendored bundle itself

## Findings

### Good

- `packages/ui` is consistently semantic. It mostly uses `stroke-weak`, `stroke-strong`, `stroke-focus`, and state-specific stroke tokens correctly.
- TradingView theme integration is DS-aware and not purely vendor-colored.
- `apps/terminal/src/styles.css` mirrors the same semantic stroke token set as `packages/ui/src/globals.css`.

### Needs cleanup

- App-level trade UI uses many one-off opacity mixes (`/20`, `/25`, `/30`, `/35`, `/40`, `/50`, `/55`, `/60`, `/70`, `/80`). These are not necessarily wrong, but they are not codified into the DS hierarchy.
- App-local UI wrappers duplicate DS patterns instead of reusing `@hypeterminal/ui` components directly in some places.
- One stale token usage existed: `hover:border-fg-400` in `mobile-positions-tab.tsx`. This was not aligned with the current semantic stroke system.

### Likely inconsistency hotspots

- `apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx`
- `apps/terminal/src/components/trade/tradebox/*`
- `apps/terminal/src/components/trade/mobile/*`
- `apps/terminal/src/components/ui/input.tsx`

## Changes Started

Applied already:

- Replaced stale `hover:border-fg-400` with `hover:border-stroke-strong` in mobile positions actions
- Updated app-local `Input` focus border/ring from `stroke-brand-strong` to semantic `stroke-focus`

## Recommended Next Pass

1. Normalize neutral borders into a small approved set:
   - Base container: `border-stroke-weak`
   - Subtle nested container: `border-stroke-weak/40`
   - Strong interactive neutral: `border-stroke-strong`
   - Focus: `border-stroke-focus`
2. Normalize state borders into approved sets:
   - Error: `border-stroke-error-strong` or `/30`
   - Success: `border-stroke-success-strong/30`
   - Brand-selected: `border-stroke-brand-strong` or `/30`
3. Replace app-local wrappers with `@hypeterminal/ui` equivalents where possible.
4. Decide whether opacity variants like `/35`, `/55`, `/70`, `/80` are allowed. If yes, document them. If not, remove them.

## Element Purpose Matrix

This is the working list for consistency cleanup. Each row answers: what element should be used, what purpose it serves, and where drift currently exists.

### Primary actions

- Use `Button`
  - Purpose: primary CTA, destructive confirm, secondary action, toolbar action with text
  - Correct roles:
    - `filled/brand`: primary CTA
    - `outline/neutral`: secondary action on the same level
    - `ghost/neutral`: low-emphasis utility action
    - `link/*`: inline textual action
  - Drift:
    - app surfaces still use raw `<button>` for action chips and utility actions where `Button` semantics would be clearer

- Use `ButtonIcon`
  - Purpose: icon-only utility actions with explicit `aria-label`
  - Correct roles:
    - settings, theme toggle, close, overflow, compact toolbar actions
  - Drift:
    - some icon-only controls are visually too light or implemented ad hoc

### Text entry

- Use `TextInput`
  - Purpose: labeled text entry with hint, error, prefix, icons
  - Correct roles:
    - wallet address, form entry, modal input, filter input when label/hint/error is needed
  - Drift:
    - app-local `Input` in `components/ui` is still used for some form cases and now needs deliberate boundaries

- Use app-local `Input`
  - Purpose: compact, low-ceremony single-line input for internal utility surfaces
  - Correct roles:
    - command-style fields, compact inline numeric/text entry where full field chrome is unnecessary
  - Drift:
    - can overlap with `TextInput` and create parallel patterns

- Use app-local `NumberInput`
  - Purpose: constrained numeric entry with keyboard stepping and optional max shortcut
  - Correct roles:
    - price, amount, slippage
  - Drift:
    - coexistence with `@hypeterminal/ui` `NumberInput` needs clearer boundary

### Selection

- Use `Select`
  - Purpose: canonical single-choice dropdown with labels and errors
  - Correct roles:
    - settings choices, order type, network, locale

- Use `SegmentedControls`
  - Purpose: compact peer-mode switch between 2-5 persistent states
  - Correct roles:
    - account `Perps / Spot`, buy/sell when styled as a peer decision, dense panel toggles
  - Drift:
    - some mode switches are still plain buttons and read as links instead of stateful controls

- Use `Tabs`
  - Purpose: switch between peer content panels
  - Correct roles:
    - balances / positions / orders / history

- Use `Toggle`
  - Purpose: boolean preference/state
  - Correct roles:
    - settings toggles, quote-asset switch, feature enablement

### Containers

- Use `Card`
  - Purpose: grouped content block with clear surface hierarchy
  - Correct roles:
    - modal sub-sections, stat groups, wallet sections, status panels
  - Drift:
    - many trade surfaces are hand-rolled `div` containers with one-off border opacity instead of a canonical card language

- Use `Modal`
  - Purpose: blocking dialog workflow
  - Correct roles:
    - wallet connect, settings, transfer, deposit, TP/SL edit

- Use `Drawer`
  - Purpose: edge-attached workflow or mobile-first panel
  - Correct roles:
    - mobile filters, side settings, compact secondary workflows

- Use `Popover`
  - Purpose: anchored transient content
  - Correct roles:
    - small menus, detail hovers, compact selectors
  - Drift:
    - app-local `PopoverContent` styling should stay aligned with `Dropdown`/`Select` popup surfaces

### Messaging & status

- Use `Alert` / `AlertGlobal`
  - Purpose: structured status messages with tone hierarchy
  - Correct roles:
    - validation summaries, warnings, confirmations, info banners
  - Drift:
    - some inline warning/error boxes are hand-built instead of using the canonical alert language

- Use `Badge` / `BadgeCount` / `BadgeDot`
  - Purpose: status, count, compact metadata
  - Correct roles:
    - state labels, counts, market kind markers

### Typography & inline data

- Use `Text`
  - Purpose: semantic type scale and color hierarchy
  - Correct roles:
    - headings, metadata, uppercase labels, weak/supporting copy
  - Drift:
    - many trade surfaces use raw utility strings; not wrong, but less consistent

- Use `TextLink`
  - Purpose: inline navigational or secondary action link
  - Correct roles:
    - docs, learn more, external navigation

### Tables & dense data

- Use `Table`
  - Purpose: structured tabular data
  - Correct roles:
    - order history, funding history, balances tables, positions tables
  - Drift:
    - some mobile/table-like surfaces are card grids instead of table primitives by necessity; they still need the same border hierarchy

### Utility layout elements

- Use `Divider`
  - Purpose: explicit section separation
- Use `InfoRow` / `InfoRowGroup`
  - Purpose: label-value metadata blocks in side panels
- Use `CommandDialog`
  - Purpose: searchable command/menu overlay

## Current Mismatch List

### State and purpose mismatches

- Account panel route mismatch
  - Route scope could be `spot` while account panel defaulted to `perps`
  - File: `apps/terminal/src/components/trade/tradebox/account-panel.tsx`
  - Status: fixed in current pass

### Primitive mismatch candidates

- Hand-built action buttons in mobile positions cards
  - File: `apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx`
  - Issue: raw buttons use custom border hierarchy instead of a canonical secondary-action primitive

- Hand-built warning/error/status boxes across tradebox flows
  - Files:
    - `apps/terminal/src/components/trade/tradebox/deposit-modal.tsx`
    - `apps/terminal/src/components/trade/tradebox/bridge-tab.tsx`
    - `apps/terminal/src/components/trade/tradebox/margin-mode-dialog.tsx`
    - `apps/terminal/src/components/trade/tradebox/order-toast.tsx`
  - Issue: repeated custom alert containers instead of shared alert/status language

- Hand-built panel containers
  - Files across `apps/terminal/src/components/trade/mobile` and `tradebox`
  - Issue: custom bordered surfaces instead of a more unified card/container system

### Visual emphasis mismatches

- Chart source toggle reads like text links instead of a mode switch
  - File: `apps/terminal/src/components/trade/chart/chart-source-toggle.tsx`

- Top nav carries too many disabled product items
  - File: `apps/terminal/src/components/trade/header/top-nav.tsx`

- Live market overview is less structured than the `/design` exploration
  - Files:
    - `apps/terminal/src/components/trade/market-overview.tsx`
    - `apps/terminal/src/components/trade/layout/market-overview-variants-demo.tsx`

## Work Order

This is the order to clean the UI without causing broad regressions.

1. Route/state consistency
   - account panel scope
   - any other controls whose default state disagrees with route context

2. Control consistency
   - chart source toggle
   - mobile action chips/buttons
   - icon-only utility affordances

3. Status/feedback consistency
   - replace hand-built error/warning/info boxes with shared patterns

4. Container hierarchy
   - normalize panel/card border and background hierarchy across tradebox and mobile

5. Header and market overview polish
   - simplify nav noise
   - align live market overview with selected design direction
