# Linear Design System — Visual Analysis

Extracted from 443 screenshots of Linear's web app (August 2024). Covers both light and dark modes, in-app screens, settings, auth/onboarding, and marketing pages.

---

## 1. Color System

### Dark Mode (Primary — App Default)

| Token | Value | Usage |
|-------|-------|-------|
| **Background** | `#16171a` / `#18181B` | Page background, sidebar |
| **Surface** | `#1f2023` / `#1A1A1C` | Elevated panels, cards, modals |
| **Surface-raised** | `#232428` | Popovers, dropdowns, floating panels |
| **Border-subtle** | `#2a2b2e` | Dividers, separators, section lines |
| **Border-default** | `#3a3b3f` | Input borders, card borders |
| **Text-primary** | `#e8e8ea` / `#EDEDEF` | Headings, body text (NOT pure white) |
| **Text-secondary** | `#8b8d93` / `#8A8A8E` | Descriptions, secondary info |
| **Text-muted** | `#6f7177` / `#6B6B6F` | Placeholders, timestamps, column headers |
| **Accent** | `#5e6ad2` | CTA buttons, active states, links, toggles |
| **Destructive** | `#EF4444` / `#dc2626` | Delete actions |
| **Warning** | `#F97066` | Caution actions (e.g. "Make team public") |

**Key insight**: Linear never uses pure black (`#000`) or pure white (`#FFF`) for backgrounds or text. Text is `#e8e8ea` (slightly muted white), backgrounds are `#16171a` (warm near-black). This reduces eye strain and creates a premium feel.

### Light Mode (Settings, Auth, Some Views)

| Token | Value | Usage |
|-------|-------|-------|
| **Background** | `#FAFAFA` / `#F9F8F7` | Page background (warm off-white) |
| **Card/Surface** | `#FFFFFF` | Cards, modals, inputs |
| **Surface-muted** | `#F7F8F9` / `#F3F4F6` | Status card backgrounds, section bands |
| **Border** | `#E5E7EB` / `#D1D5DB` | Input borders, dividers, separators |
| **Text-primary** | `#1A1A1A` / `#1C1C1C` / `#111827` | Headings (NOT pure black) |
| **Text-secondary** | `#6B6F76` / `#6b7280` | Body text, descriptions, labels |
| **Text-muted** | `#9CA3AF` / `#B0B0B0` | Placeholders, keyboard shortcuts |
| **Accent** | `#5E6AD2` / `#7C6AEF` | CTA buttons, toggles, focus rings |
| **Destructive** | `#EF4444` | Delete buttons |
| **Hover-bg** | `#F3F4F6` / `#F9FAFB` | Row hover, item hover |

### Status Colors (Workflow)

| Status | Color | Icon |
|--------|-------|------|
| Backlog | `#D1D5DB` | Dashed circle |
| Todo | `#E5E7EB` (border) | Hollow circle |
| In Progress | `#F59E0B` (amber) | Filled yellow circle |
| Done/Completed | `#22C55E` (green) | Green checkmark |
| Cancelled | `#9CA3AF` (gray) | Strikethrough circle |

### Priority Colors

| Priority | Color |
|----------|-------|
| Urgent | `#EF4444` (red) |
| High | `#F97316` (orange) |
| Medium | `#EAB308` (yellow) |
| Low | `#6B7280` (gray) |
| No priority | `#D1D5DB` (light gray) |

### Label Colors

| Label | Color |
|-------|-------|
| Bug | `#EF4444` (red dot) |
| Feature | `#8B5CF6` (purple dot) |
| Improvement | `#3B82F6` (blue dot) |

---

## 2. Typography

### Font Family

- **Body**: Inter (variable font)
- **Headings**: Inter Display (more expressive for titles)
- **Code/shortcuts**: Monospace system font
- **Feature settings**: `font-feature-settings: 'cv12', 'cv13', 'ss01', 'tnum'` (compact f/t, open digits, tabular numbers)

### Type Scale

| Element | Size | Weight | Line Height | Color |
|---------|------|--------|-------------|-------|
| Marketing heading | 32-40px | 700 (bold) | 1.1-1.2 | primary |
| Page title (settings) | 24-28px | 600 (semibold) | 1.2-1.3 | primary |
| Issue title (detail) | 20-22px | 600 | 1.3 | primary |
| Section title | 16-18px | 600 | 1.3 | primary |
| Modal/panel title | 16px | 600 | 1.3 | primary |
| Body text | 14px | 400 (regular) | 1.5-1.6 | primary |
| Field labels | 13-14px | 500 (medium) | 1.4 | secondary |
| Sidebar nav items | 13px | 400-500 | 1.3-1.4 | primary/secondary |
| Table data / list items | 13-14px | 400 | 1.4 | primary |
| Issue identifiers (SLM-10) | 12-13px | 500 | 1.4 | muted |
| Small metadata / timestamps | 11-12px | 400 | 1.4 | muted |
| Keyboard shortcuts | 11-12px | 400 | 1.0 | muted, monospace |
| Overline labels ("FEATURES") | 11px | 500-600 | 1.0 | accent, uppercase, `letter-spacing: 0.1em` |
| Count badges | 11px | 500 | 1.0 | muted |

### Key Observations

- **13px is the workhorse size** — used for sidebar items, list items, field labels, descriptions
- **14px for body/content** — descriptions, comments, input text
- **Never smaller than 11px** — even micro badges are 11px
- **Heading scale is compressed** — 16, 18, 20-22, 24-28px (no huge jumps)
- **Weight discipline**: Only 400, 500, 600 used. No 300 (thin) or 700+ (bold) except marketing

---

## 3. Spacing System

### Base Unit: 4px

All spacing is multiples of 4px.

### Common Values

| Token | Value | Usage |
|-------|-------|-------|
| 4px | `1` | Icon gaps, tight pill padding, between tightly related elements |
| 6px | `1.5` | Label-to-input gap, pill internal vertical padding |
| 8px | `2` | Icon-to-text gap, pill horizontal padding, between buttons, item gaps |
| 12px | `3` | Popover padding, list item horizontal padding, field descriptions |
| 16px | `4` | Between form fields, section content gap, horizontal content padding |
| 20px | `5` | Between form fields (generous), modal content spacing |
| 24px | `6` | Modal/card padding, section separation, content area padding |
| 32px | `8` | Between major sections, page-level spacing |
| 40px | `10` | Major section breaks, content area top padding |

### Component Heights

| Element | Height |
|---------|--------|
| Input/select | 36-40px (h-9 to h-10) |
| Button (standard) | 32-36px (h-8 to h-9) |
| Button (CTA, auth) | 44-48px (h-11 to h-12) |
| Sidebar item | ~32px |
| List/table row (compact) | 36-40px |
| Table row (standard) | 40-48px |
| Toolbar/header bar | 40-44px |
| Context menu item | 32px |
| Popover option row | 28-34px |
| Properties panel row | 28-32px |
| Filter pill | ~28px |
| Metadata pill | ~24px (h-6) |

### Layout Widths

| Element | Width |
|---------|-------|
| Sidebar (in-app) | 200-240px |
| Settings sidebar | ~150-160px |
| Properties panel (right) | 240-280px |
| Settings content max-width | 520-600px (constrained) |
| Modal (standard) | ~480px |
| Modal (large, new issue) | ~640px |
| Reading content max-width | ~700px |

---

## 4. Border Radius

| Element | Radius | Tailwind Equivalent |
|---------|--------|---------------------|
| Checkboxes | 3-4px | `rounded-xs` to `rounded-sm` |
| Key badges, hover highlights | 4px | `rounded-sm` |
| Buttons (standard) | 6px | `rounded-md` |
| Inputs, selects, textareas | 6px | `rounded-md` |
| Popovers, dropdowns, cards | 8px | `rounded-lg` |
| Workspace logo | 8px | `rounded-lg` |
| Modals, dialogs, large cards | 12px | `rounded-xl` |
| Marketing app icons | 16-20px | `rounded-2xl` |
| Avatars, status dots, toggle tracks | full | `rounded-full` |
| Pill badges, label dots | full | `rounded-full` |

**Key difference from current HypeTerminal**: Linear uses 6px for buttons/inputs (your `rounded-md`), while HypeTerminal uses 4px (`rounded-sm`). Linear's modals are 12px (your `rounded-xl`), HypeTerminal uses 8px (`rounded-lg`).

---

## 5. Shadow / Elevation System

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 (flat) | none | Most in-app elements, sidebar items, table rows |
| 1 (subtle) | `0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)` | Cards, onboarding panels |
| 2 (medium) | `0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)` | Popovers, floating panels, dropdowns |
| 3 (elevated) | `0 8px 24px rgba(0,0,0,0.12)` | Modals, dialogs, context menus |
| 4 (high) | `0 12px 32px rgba(0,0,0,0.16)` | Command palette, major overlays |

**Note**: Popovers combine shadow with a very thin 1px border (`rgba(0,0,0,0.04)`) for definition.

---

## 6. Component Patterns

### Buttons

| Variant | Background | Text | Border | Radius | Height |
|---------|-----------|------|--------|--------|--------|
| Primary (in-app) | `#5E6AD2` indigo | white | none | 6px | 32-36px |
| Primary (marketing) | `#7C6AEF` purple | white | none | 6-8px | 44-48px |
| Primary (settings) | `#1C1C1C` black | white | none | 6px | 36px |
| Ghost/Cancel | transparent | dark/muted | none | 6px | 32-36px |
| Destructive | `#EF4444` red | white | none | 6px | 32-36px |
| Warning | `#F97066` coral | white | none | 6px | 32-36px |
| Outline (auth) | white | dark | 1px `#E5E7EB` | 8px | 44px |

**Pattern**: Primary CTA always right-aligned in button groups. Cancel/ghost on the left.

### Inputs

- Height: 36-40px
- Border: 1px solid `#E5E7EB` (light) / `#3a3b3f` (dark)
- Radius: 6px
- Padding: 8-10px vertical, 12px horizontal
- Placeholder: light gray `#9CA3AF`
- Focus: border changes to `#5E6AD2` (accent) with subtle ring
- Title inputs (issue/project name): Borderless, large font (20-28px semibold), inline-editable

### Dropdowns / Context Menus

- Container: `bg-white` (light) / `bg-#232428` (dark), 8px radius, medium shadow
- Item height: 32px
- Item padding: 8px vertical, 12px horizontal
- Item pattern: icon (16px) + 8px gap + label + flex-grow + right-aligned shortcut/metadata
- Hover: `bg-#F3F4F6` (light) / slightly lighter (dark)
- Destructive: red text at bottom
- Separator: 1px line with 4px margin
- Submenu indicator: right chevron

### Modals / Dialogs

- Width: ~480px standard, ~640px large
- Radius: 12px
- Padding: 24px
- Title: 16-20px semibold
- Overlay: `rgba(0,0,0,0.4-0.5)` semi-transparent
- Close button: X in top-right, muted gray
- Footer: Cancel (ghost) left + Primary action (filled) right

### Tabs

- Style: **Underline** (not pill/contained)
- Active: dark text + 2px bottom border
- Inactive: muted gray text, no border
- Height: 36-40px
- Gap: 20-24px between tabs

### Sidebar Navigation

- Width: 200-240px (fixed)
- Item height: ~32px
- Item padding: 4-6px vertical, 8-12px horizontal
- Icon size: 16px, muted gray
- Icon-to-text gap: 8px
- Active: `bg-#F3F4F6` (light) / slightly lighter (dark), darker text, weight 500
- Inactive: transparent bg, muted text, weight 400
- Section headers: 11px, uppercase or muted, `letter-spacing: 0.05em`
- Notification badge: right-aligned count number
- Nested indent: 16px additional
- Collapsible: disclosure triangle

### Tables / List Views

- Header: 12px muted text, weight 500
- Row height: 36-40px (compact)
- Row hover: `bg-#F9FAFB` (light) / slightly lighter (dark)
- Row separator: 1px very subtle line or none
- No alternating row colors
- Actions appear on hover

### Properties Panel (Issue Detail Right Side)

- Width: 240-280px fixed
- Row height: 28-32px
- Label: 12-13px muted, left
- Value: 12-13px dark, right (clickable dropdown trigger)
- Properties: Status, Priority, Assignee, Labels, Project, Milestone, Due Date

### Pills / Badges

- Fully rounded (pill shape)
- Height: ~24px
- Padding: 4-6px horizontal
- Label pills: colored dot (10-12px) + text
- Filter pills: text + X close button
- Status pills: tinted background + text

### Toggle / Switch

- Track: 36x20px
- Active: `#5E6AD2` (accent)
- Inactive: `#D1D5DB` (light) / dark gray (dark)
- Knob: 16px white circle, rounded-full
- Transition: smooth slide

### Info Callout / Banner

- Background: light indigo `#EEF2FF` (light mode)
- Icon: blue "?" or info icon
- Border-radius: 8px
- Padding: 16px
- Contains: title + body text + optional "Read more" link
- Close X button

### Alert / Warning Boxes

| Type | Background | Text/Icon |
|------|-----------|-----------|
| Info | `#EEF2FF` (light indigo) | Blue icon |
| Warning | Light amber tint | Amber icon |
| Danger | Red tint | Red icon + "Warning:" prefix bold |

---

## 7. Layout Patterns

### Three-Column (Issue Detail)

```
[Sidebar 220px] | [Issue Content fluid] | [Properties 260px]
```

### Two-Column (Standard App)

```
[Sidebar 220px] | [Main Content fluid]
```

### Settings

```
[Settings Sidebar 160px] | [Content max-w-600px centered]
```
- Sections separated by horizontal 1px lines
- Form: label + input per row

### Centered Auth/Onboarding

```
[Centered max-w-480px]
Logo > Heading > Description > Form > CTA
```

### Marketing

```
[Full-width centered max-w-1200px]
Dark background, centered text, generous whitespace
```

---

## 8. Interaction States

| State | Light Mode | Dark Mode |
|-------|-----------|-----------|
| **Hover (row)** | `bg-#F9FAFB` | Slightly lighter bg |
| **Hover (sidebar)** | `bg-#F9FAFB` | Slightly lighter |
| **Active/selected (sidebar)** | `bg-#F3F4F6` + bold text | Lighter bg + white text |
| **Hover (button)** | Slightly darker shade | Slightly lighter shade |
| **Focus (input)** | `border-#5E6AD2` + ring | `border-#5E6AD2` + ring |
| **Selected (tab)** | Dark text + 2px bottom border | White text + 2px border |
| **Selected (theme card)** | `2px solid #5E6AD2` border | Same |
| **Toggle on** | `bg-#5E6AD2` track | Same |
| **Toggle off** | `bg-#D1D5DB` track | Dark gray track |
| **Disabled** | ~50% opacity | Same |
| **Unread** | Blue dot indicator | Same |
| **Drag** | 6-dot grip handle appears on hover | Same |

---

## 9. Icon System

- **Style**: Outline, 1.5px stroke weight
- **Default size**: 16x16px
- **Sidebar/nav icons**: 16px, muted gray
- **Priority**: Custom bar-graph icons (1-4 bars)
- **Status**: Custom circles with fills/strokes
- **Team**: Colored rounded squares (~20px, ~4px radius)
- **Avatars**: Circular, 24-32px, initials or photo

---

## 10. Key Design Principles Observed

### 1. Extreme Neutrality
The UI is almost entirely monochromatic. Color appears only for:
- Status indicators (workflow colors)
- The accent CTA button
- Label dots
- Error/warning states

Everything else is shades of gray. This creates a calm, focused interface.

### 2. Never Pure Black or White
- Dark mode bg: `#16171a` (not `#000`)
- Dark mode text: `#e8e8ea` (not `#FFF`)
- Light mode bg: `#FAFAFA` (not `#FFF`)
- Light mode text: `#1A1A1A` (not `#000`)

This reduces contrast fatigue while maintaining readability.

### 3. Density Through Alignment
- 36-40px row heights (compact)
- 13px body text (smaller than typical 14-16px)
- Tight but never claustrophobic
- No unnecessary padding or decoration
- Content-to-chrome ratio is very high

### 4. Three Elevation Levels
1. **Flat** — in-app elements (rows, sidebar items)
2. **Slightly elevated** — cards, panels
3. **Floating** — popovers, modals (shadow + backdrop)

No excessive shadow usage. Most of the UI is flat.

### 5. One Way to Do Each Thing
- Buttons: always 6px radius, consistent heights
- Inputs: always 6px radius, same height
- Modals: always 12px radius, always 24px padding
- Tabs: always underline style
- No variation for the sake of variation

### 6. Selective Glassmorphism
- `backdrop-filter: blur(10px)` only on command palette and modal overlays
- Never on structural UI like sidebar or panels
- Semi-transparent backgrounds only where content scrolls behind

---

## 11. Comparison: Linear vs Current HypeTerminal

| Aspect | Linear | HypeTerminal Current | Gap |
|--------|--------|---------------------|-----|
| Color space | LCH/OKLCH-based | OKLCH | Aligned |
| Text not pure white/black | `#e8e8ea` / `#1A1A1A` | `oklch(0.985 0 0)` / `oklch(0.141 ...)` | Aligned |
| Accent color | `#5E6AD2` (indigo) | `accent-blue` (OKLCH blue) | Different hue, same role |
| Button radius | 6px | 4px (`rounded-sm`) | Linear is rounder |
| Input radius | 6px | 4px (`rounded-sm`) | Linear is rounder |
| Modal radius | 12px | 8px (`rounded-lg`) | Linear is rounder |
| Body text | 13-14px | 12px (`text-xs`) | HypeTerminal is denser |
| Sidebar items | 13px | `text-nav` (13px) | Aligned |
| Input height | 36-40px | h-8 (32px) | Linear is taller |
| Row height | 36-40px | varies | Similar |
| Font | Inter | Figtree | Different family |
| Font features | tabular-nums | not enabled | Gap |
| Tab style | Underline | Mixed (underline + pill) | Should standardize |
| Shadow levels | 4 distinct levels | 6 levels defined | HypeTerminal has more |
| Popover shadow | shadow + 1px border | shadow only | Minor |

---

## 12. Actionable Takeaways for HypeTerminal

### What to adopt directly:
1. **Never pure black/white** — already doing this with OKLCH
2. **Accent appears < 5% of surface** — audit accent usage
3. **Consistent component radii** — consider bumping buttons/inputs to 6px (`rounded-md`)
4. **Underline tabs only** — remove pill tab variant for consistency
5. **Enable `font-variant-numeric: tabular-nums`** — critical for trading data alignment
6. **13px as workhorse size** — already have `text-nav`, use it more broadly
7. **32px standard row height** — already at h-8, good
8. **Three elevation levels** — flat (most things), card (panels), floating (modals)
9. **Hover reveals actions** — use sparingly for cleaner UI
10. **Info callout pattern** — for warnings/information in dialogs

### What to keep different (trading-specific):
1. **Denser text scale** — trading terminals need 10-12px for orderbook/positions
2. **Market colors** — green/red are essential, Linear doesn't need these
3. **Tighter button/input heights** — h-6/h-7/h-8 scale is correct for density
4. **More data columns** — trading tables need more horizontal density than Linear
5. **Geist Mono** — keep for price/data display (Linear doesn't emphasize mono)
