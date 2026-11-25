# Shelfwise principles pass: design

A refinement of [the redesign](2026-11-23-redesign-design.md), approved by the owner on 2026-11-25. Everything not mentioned here stays as the redesign spec says.

Mockup: [2026-11-25-principles-mockups.html](2026-11-25-principles-mockups.html). This document wins where the two differ.

## Intent

The owner asked for the app to be reassessed against three UI design articles:

- Erik Kennedy, *7 Rules for Creating Gorgeous UI (part 1)*
- Adham Dannaway, *16 little UI design tips*
- Taras Bakusevych, *58 rules for beautiful UI design*

She added one rule of her own: **every empty state has a call to action**.

The pass keeps the brand (Fig, Butter, the wordmark, the shelf-tag budget) and changes how screens are built:

- Fewer containers, more grouping by space.
- Colour only on what you can tap or what carries meaning.
- One focal point per screen.
- Sentence case.
- One UI typeface.
- Soft depth.
- An empty state with a next step everywhere.

## Approaches

The changes were shown as mockups and approved together. The alternative of applying only the empty-state rule was not chosen.

## Changes

### Type
- **Figtree for all UI text:** titles, body, labels, buttons, chips, row prices, sheet fields. Use weights 400, 600 and 700, plus 800 for page titles. Body text that wraps uses line-height 1.5.
- **Bricolage Grotesque** stays only for the wordmark and the big budget figure on the List tag.
- **IBM Plex Mono** stays only for raw receipt lines.
- The iPhone system font is no longer used. Self-host Figtree 400/600/700 alongside the existing 800, cached by the service worker.
- **No uppercase text anywhere**, including labels. Examples: "Market Basket", "4 to get", "In the cart", "Left to spend", sheet field labels, the receipt "Needs a look" and "Matched" headers.

### Surfaces and depth ("light comes from the sky")
- Cards, pills, search fields, buttons and the budget tag get a faint 1px top highlight (`inset 0 1px 0` white) and a soft 1–2px bottom shadow in Fig 950 at low opacity.
- Primary buttons get a slightly stronger shadow. Exact values are in the mockup.
- No new colours.

### Grouping and spacing
- Rows are grouped in **one card per store (Pantry) or per group (List)**, with hairline dividers inset from the text start. They are no longer one card per row.
- There is more space above a group than inside it: about 26px between store sections and 22px above List group headers, with 8px under a header.

### Pantry
- **Store header:**
  - a 10px rounded colour dot in the store's colour
  - the store name in Figtree 700, 17px, sentence case
  - the count in Stone
  - a fold chevron

  This replaces the solid colour banner. Folding still works by tapping the header.
- **New line under the title:** "N staples on your list · View list". "View list" is a Fig, underlined link that opens the List for the picked store, or the main store under All stores. Hide the line when nothing is on the list.
- **Search row:** the filter button moves inside the search field, at the right end. The **+** becomes a 46px Fig 950 square with a Butter plus. It is the one dark button on the screen.
- **Row:**
  - 40px photo or placeholder.
  - Name in Figtree 600, 16px.
  - Detail line: just the price ("$3.49", or "2 × $1.79"). "last paid" is removed.
  - For a staple on the list, the detail line reads "**On your list** · $0.69", with "On your list" in Fig 2, 700.
  - The search flat view still adds " · Store" where the redesign spec says.
- **Basket button:**
  - Off: the outlined basket-plus icon alone in Fig 2, with no filled square behind it, inside a 44px tap area.
  - On: a 38px Butter circle with the Fig basket-tick and the soft shadow.
  - The Butter left edge on rows is removed.

### List
- **Budget tag:**
  - Keeps its shape and its Bricolage figure, and stays the focal point.
  - Its labels become sentence case: "Left to spend", "Estimated", "Over budget", "Tap to set a budget".
  - It is **hidden when the list has nothing to get and nothing in the cart.**
- **Meta line:** "**N to get** · M in the cart" (the "· M in the cart" part appears only when M > 0). It replaces "TO GET N". The group button becomes a Fig text link, "By aisle ▾", at the right.
- **Group headers:** Figtree 700, 15px, Fig 950, with the count right-aligned in Stone. The "In the cart" header uses the same style.
- **Row prices:** Figtree 600, 16px, tabular figures. The shelf-tag figure style is no longer used on rows. "No price yet · not counted" and the Pebble dash stay.
- **Ticks:** unchanged in behaviour. The tick becomes a 26px circle: a Pebble outline, or Fig 900 with a Butter check when ticked.
- **Adding by hand:** the top "Add to this list" field and the black Add button are removed. A "+ Add an item" row in Fig sits as the last row of the last group. Tapping it turns that row into an inline text field with Add and Cancel, with today's behaviour (it reuses or creates a staple and puts it on the list).

### Empty states (owner's rule: always a call to action)

**Shared pattern:**
- a 68px soft circle with an outlined icon
- a title in Figtree 800, 21px
- one or two lines of Stone body text, 15px with 1.5 line-height
- **one full-width primary button** (Fig 950 with Butter text)
- an optional secondary text link in Fig

Build it as one reusable component.

| Where | Title | Body | Primary | Secondary |
|---|---|---|---|---|
| First run (no stores) | "Never forget a staple again" | Three numbered steps: "Add the things you always buy." / "Tap the basket when one runs low. It goes on your list." / "Snap the receipt so prices stay real." Then a "Where do you shop most?" field. | **Get started** (creates the main store) | none |
| Pantry, no staples (for the picked store or All stores) | "Your pantry is empty" | "Add what you buy every week. When one runs low, tap its basket." | **Add a staple** (opens the New staple sheet) | "Or start with common ones" with chips **+ Milk, + Eggs, + Bread, + Butter, + Bananas**. Each chip creates that staple in the picked store (main store under All stores) with no price, then disappears from the chips. |
| Pantry, search has no match | "No “<query>” yet" | "It isn't one of your staples at <store>." (or "…in any store." under All stores) | **Add “<query>”** (New staple sheet with the name filled in) | "Clear search" |
| Pantry, filters match nothing | "Nothing matches" | A sentence naming the active filters | **Clear filters** | "Change filters" (opens the filter sheet) |
| List, nothing to get and nothing in the cart | "Nothing to buy here" | "Tap the basket on a staple in your pantry and it shows up on this list." | **Check your pantry** (goes to Pantry) | "Add an item" (opens the inline add field) |
| List, everything ticked (nothing to get, cart not empty) | "Everything's in the cart" | "N items · about $X. Finish to put them back in your pantry." | **Finish shopping** (opens the finish sheet) | "Add an item". The "In the cart" group still shows below, so ticks can be undone. |
| Receipt, before upload | "Snap your receipt" | "Lay it flat in good light. You check every match before a price changes." | **Take a photo** (camera capture) | "Choose from photos" (library picker) |
| Settings | "More settings soon" | "For now you can rename, recolour or add stores." | **Manage stores** (opens the store menu) | none |

**First run** shows no tab bar and no store pill until the first store exists.

**Interim state:** the Pantry's "All stores" picker shows the dot as a two-colour mix of the first two stores' colours, as in the mockup.

### Loading
- While a screen's first data request is pending, show 3–5 skeleton rows (a 40px block and two text bars) inside a card, with a gentle shimmer.
- Respect `prefers-reduced-motion`: no shimmer.
- Never show a blank screen.

## Constraints
- All existing behaviour, data and API stay the same. This is presentation only, plus the common-staple chips, which use the existing create-item API.
- Contrast stays at AA: text at least 4.5:1, controls at least 3:1.
  - The outlined off-basket in Fig 2 on Card must meet 3:1. Fig 2 on Card is about 9:1.
  - Stone body text on Paper and Card already passes.
- Every file added under `public/` goes into the service worker shell, with the version bumped.

## Calls made by the author
- "View list" opens the main store's List under All stores.
- The common-staple chips create items with no category or aisle. The owner fills those in later.
- The All-ticked state keeps the "In the cart" group visible below the call to action.
- Receipt "Choose from photos" uses a file input without `capture`. "Take a photo" uses `capture="environment"`.

## Left to the builder
- Exact shadow values and spacing within the mockup's intent.
- Icon drawing.
- Skeleton timing.
