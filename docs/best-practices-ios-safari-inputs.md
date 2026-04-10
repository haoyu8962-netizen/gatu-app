# iOS Safari: inputs and focus zoom

## Quirk

In **iOS Safari**, focused `<input>` elements with a computed **`font-size` below 16px** often trigger **automatic page zoom**. That is by design (readability) but is usually wrong for dense trading UIs.

## What to do

1. **Prefer `font-size` ≥ 16px** on the control that receives focus (e.g. Tailwind `text-base` when the root font size is 16px).

2. **If 16px looks too large**, keep **16px** to avoid zoom and **visually shrink** with CSS:

   - `transform: scale(0.875)` (or similar) on the input or a wrapper.
   - Set **`transform-origin`** (e.g. `left center`) so alignment stays correct.
   - Remember scaling changes **visual** size more than **layout** box; adjust the wrapper or padding if the row height must stay tight.

## Where it matters most

Mobile or responsive flows: order entry, search, filters, any field where we might otherwise use `text-xs` / `text-sm` on the native `<input>`.
