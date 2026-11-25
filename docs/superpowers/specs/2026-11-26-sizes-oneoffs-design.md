# Sizes, one-offs, navigation and settings: design

Approved by the owner on 2026-11-26, from the mockup [2026-11-26-sizes-oneoffs-mockups.html](2026-11-26-sizes-oneoffs-mockups.html). Three tweaks were requested after the mockup, and **this document wins where they differ**. This builds on the earlier specs in this folder: the visual system, the empty-state rule (always a call to action), offline rules and the stale-render guard all still apply. It **replaces** `2026-11-25-emoji-and-settings-design.md`, whose emoji part is folded in here and whose Settings tab is dropped.

## Why
Using the app with real receipts showed four problems:
- The Receipt screen overflowed.
- A receipt line could only be matched to an existing staple.
- The same product is bought in different sizes and by weight, at different prices.
- Some purchases aren't staples at all.

The owner also wants a simpler two-tab bar, settings next to the screen they affect, emoji pictures, archiving, brighter store colours, and sheets that don't pop the keyboard.

## Goals
- A staple can have several **sizes**. You choose the size when it goes on the list, and each size keeps its own price.
- **One-offs** can be added on the List and priced quickly while shopping. They count in the total and are gone after Finish shopping.
- A receipt line can become a **new staple**.
- Navigation is just Pantry and List, with Receipt one tap from the Pantry and settings beside each screen's title.
- Nothing overflows, and the keyboard never covers the field you're typing in.

## Non-goals
- One-offs are not tracked, saved or reused after a trip.
- No automatic emoji guessing.
- Receipts don't detect sizes; you pick the size when matching.
- No price history beyond the last price per size.

## Anti-goals
- A wrong size or weight must never silently write a wrong price. When a by-weight size has no weight, its price stays unchanged.
- Upgrading must not lose or alter any existing staple, price or receipt.

## Data model (migration v2, appended to `MIGRATIONS` in `src/db.ts`)
- **`sizes` table:**

  | column | type | notes |
  |---|---|---|
  | `id` | | |
  | `item_id` | FK → `items` | on delete cascade |
  | `name` | text, default `''` | `''` means an unnamed single size |
  | `sold_by` | `'each'` or `'weight'` | |
  | `last_price_cents` | int, null | per item for `each`, per lb for `weight` |
  | `price_source` | `'receipt'`, `'manual'` or null | |
  | `price_receipt_id` | FK → `receipts` | on delete set null |
  | `price_updated_at` | text | |
  | `usual_amount` | real, not null, default 1 | count for `each`, lb for `weight` |
  | `is_default` | int | exactly one per item |
  | `sort` | int | |

  Sizes are unique per item by `name collate nocase`.
- **Every existing item becomes one size:**
  - `name ''`, `sold_by 'each'`, `is_default 1`
  - its current `last_price_cents`, `price_source`, `price_receipt_id` and `price_updated_at` carry over
  - `usual_amount` = `usual_qty`

  The old item price and quantity columns stay but are no longer read.
- **New `items` columns:**
  - `emoji` (text, null)
  - `archived_at` (text, null)
  - `list_size_id` (FK → `sizes`, on delete set null): the size chosen while the item is on the list
  - `list_amount` (real, null): the amount on the list. When null, the size's `usual_amount` is used.

  Existing on-list items get the id of their only size as `list_size_id`.
- **`oneoffs` table:**
  - `id`
  - `store_id` (FK → `stores`, on delete cascade)
  - `name` (text, not null)
  - `price_cents` (int, null)
  - `amount` (real, default 1)
  - `created_at`
- **Store colours** become `tomato #D2452F`, `pumpkin #C2620F`, `berry #C0306E`, `violet #7A4FD0`, `blue #2F6FD6`, `teal #0E8A86`, `green #3E8E2F` and `slate #5E6B7D`. The default is `tomato`. Each is at least 3.5:1 against Paper.
  - The migration maps old names to new ones: fig → berry, claret → tomato, cinnamon → pumpkin, olive → green, forest → green, teal → teal, harbor → blue, slate → slate.
  - `STORE_COLORS` and `tokens.css` are updated to match.
- The migration is idempotent, runs in a transaction, and keeps every row. DEPLOY.md gets one line about it, saying to back up first.

## API changes
- **Item JSON:**
  - Drops `lastPriceCents`, `priceSource`, `priceDate` and `usualQty`.
  - Adds `emoji`, `archived` (boolean), `sizes: Size[]` (sorted, default first), `listSizeId` and `listAmount`.
  - `Size` = `{ id, name, soldBy, lastPriceCents, priceSource, priceDate, usualAmount, isDefault }`.
- **Items:**
  - `GET /api/items` excludes archived items unless `?archived=1`, which returns only archived items.
  - `POST /api/items` accepts an optional `sizes` array. With no `sizes`, it creates one default unnamed `each` size, priced from `lastPriceCents` if given.
  - `PATCH /api/items/:id` accepts:
    - `emoji` (at most 16 UTF-8 bytes; `''` means null)
    - `archived` (true sets `archived_at` and takes the item off the list; false clears it)
    - `onList`, `listSizeId` (must belong to the item) and `listAmount` (> 0)
- **Sizes:**
  - `POST /api/items/:id/sizes`
  - `PATCH /api/sizes/:id`: `name`, `soldBy`, `usualAmount`, `lastPriceCents` (sets source `manual`) and `isDefault` (true clears it on the item's other sizes)
  - `DELETE /api/sizes/:id`: returns 409 for the item's last size. Deleting the default size promotes the next one.
- **One-offs:**
  - `GET /api/stores/:id/oneoffs`
  - `POST /api/stores/:id/oneoffs {name, priceCents?, amount?}`
  - `PATCH /api/oneoffs/:id`
  - `DELETE /api/oneoffs/:id`
- **The list:** `GET /api/stores/:id/list` lines become `{ kind: 'staple' | 'oneoff', id, name, emoji, photo, categoryId, aisle, sizeId, sizeName, soldBy, unitPriceCents, amount, lineCents }`.
  - Staple lines use the list size and amount.
  - `lineCents` = round(`unitPriceCents` × `amount`), or null when there's no price.
  - One-offs have no category or aisle, so they group under "No aisle" / "No category" (Ruling 3).
  - The subtotal and status use every priced line.
- **Finish:** `POST /api/stores/:id/finish { itemIds, oneOffIds }` takes those staples off the list and **deletes** those one-offs, all-or-nothing, and checks they belong to the store.
- **Receipts:**
  - Confirm matches become `{ lineId, itemId, sizeId, weightLb? }`.
    - For an `each` size, the line price becomes the size's price.
    - For a `weight` size with `weightLb` > 0, the price is round(line price ÷ `weightLb`) per lb.
    - For a `weight` size without a weight, the price is left unchanged and the line counts as matched.
    - The item comes off the list, as now.
  - A **new staple from a receipt** is created by the client with `POST /api/items` first (one size, priced from the line), then included in the confirm.
  - The upload response's `proposedItemId` gains a `proposedSizeId`: the item's default size.
- **Other routes:**
  - Category `PATCH` and `DELETE`, aisle listing and renaming, and `version` in `/api/health`, all as in the replaced emoji/settings design.
  - Category delete returns 409 with a count while the category is in use.

## Screens

### Navigation
- **Tab bar:** two tabs only, **Pantry** and **List**, in a left-aligned glass capsule. It still collapses to a circle on scroll.
  - The List tab carries a Fig 950 badge with Butter text showing the List store's count of unticked staples and one-offs. The badge hides at 0.
- **Routes:**
  - `#/settings` is removed.
  - `#/receipt` becomes a full-screen route with a "‹ Pantry" back link and no tab bar.
- **Receipt button:**
  - A round Fig 950 button showing only the Butter receipt icon (no text), 56px, bottom right.
  - It appears on the Pantry only, with `aria-label="Scan a receipt"`.
  - It sits beside the tab bar and stays visible when the bar collapses.
- **Settings button:**
  - A plain **cog** icon (outlined, 24px, Fig 950), with no background, border or fill.
  - It sits on the same line as the page title (Pantry, Shopping List), right-aligned, with a 44px tap area.
  - It opens that screen's settings sheet.
- **Header row:** the wordmark and store pill only.

### Pantry
- The "N staples on your list · View list" line is removed.
- **Rows:** emoji or photo thumbnail (photo first, then emoji, then initial, via one shared `thumb()` helper).
- **Detail line:**
  - One unnamed size: the price.
  - One named size: "5 oz can · $1.59".
  - Several sizes: "3 sizes · from $4.99".
  - By weight: "$2.49/lb".
  - The "On your list" and "In the cart" prefixes stay.
- **Basket:**
  - With one size, the tap adds it directly.
  - With several sizes, it opens the **size picker** sheet:
    - "Which size this time?"
    - a radio list of sizes with their prices
    - the default (or last-chosen) size pre-selected
    - a primary button, "Add <size> to list"
- **Archived staples** are hidden everywhere: Pantry, List, receipt picker and search.
- **Pantry settings sheet:**
  - **Stores:** a row per store with its dot (opens the store sheet), plus "+ Add a store".
  - **Organise:**
    - Categories, with a count: rename, delete (only when unused, otherwise "Move its N staples first"), add.
    - Aisles: per store, with rename.
    - Archived staples, with a count: the archived list. Tapping one gives **Restore**.
  - **About:** version, plus "Connected" or "Can't reach Shelfwise" with Try again.
  - Each sub-list without entries shows an empty state with a call to action.

### Staple sheet
- **Picture:** tapping it gives **Take or choose a photo**, **Use an emoji** (a grid of about 30 grocery emojis plus an emoji text field) and, when set, **Remove emoji**.
- **Sizes section:**
  - One row per size: the name (or "Standard" when unnamed), "Each" or "By weight", the price and its source, and a Default tag.
  - Tapping a row opens the size sheet: name, sold by (Each / By weight), price ($ or $/lb), usual amount (count or lb), make default, delete.
  - "+ Add a size" sits at the end.
- Category and aisle stay as before.
- Buttons: Save, **Archive staple** (link) and **Delete staple** (link, two-tap confirm).

### Shopping List
- **Page title:** "Shopping List". The tab label stays "List".
- **Rows:** no photos and no thumbnails, so staples and one-offs share one row style.
  - Name, then a size tag when the size has a name (for example "6-pack"). The detail line is "1 × $6.49" or "About 3 lb × $2.49/lb".
  - The price sits on the right. An unpriced staple shows "No price yet · not counted" and a dash.
- **One-offs:**
  - The detail line has a dashed "One-off" tag.
  - When unpriced, a compact **price box** sits on the right with "Add a price" as the detail text. Tapping the box focuses a decimal input (number pad), and the total updates live.
  - The price is saved on blur or Enter, and invalid input shows inline.
- **Adding an item:** "+ Add an item" (the last row, as now) opens an inline field.
  - As you type, matching staples appear as suggestions: "Eggs is a staple. Add it?" Picking one puts the staple on the list (through the size picker if it has several sizes).
  - Submitting text that isn't a staple creates a **one-off** in this store.
- **Tapping a row** opens the **detail sheet**:
  - For a staple: the large photo or emoji, name, category and aisle, the size choice (a radio list with prices), the amount (a stepper for each, decimal lb for weight), the line total, Done, "Edit staple" and "Remove from list".
  - For a one-off: name, price, amount, Done and Remove.
- **Finish shopping:** ticked staples come off the list and ticked one-offs are deleted. Unticked one-offs stay (Ruling 1).
- **Ticks:**
  - Ticks stay on the phone, keyed `s:<itemId>` / `o:<oneoffId>`. Old numeric ticks are dropped once.
  - The forgotten-trip card and Finish pill behave as now.
- **List settings sheet**, for the current List store:
  - Budget (opens the budget sheet)
  - Group by (Aisle / Category / None)
  - Move ticked items to the bottom
  - **Clear unbought one-offs**, with a count and a two-tap confirm
  - A note explaining that ticked one-offs vanish on Finish, and how to keep one as a staple

### Receipt
- Full screen with a back link. The upload empty state is as now.
- **Results:**
  - The summary card.
  - **Needs a look:** one `.grp` card with dividers. Each line shows:
    - a Marigold dot
    - the raw text in mono, wrapped to at most 2 lines with an ellipsis and `overflow-wrap:anywhere`
    - the guess or "No match"
    - the price, right-aligned inside the card
    - a row of text-button actions: **Yes** (for a guess), **Pick item**, **New staple**, **Skip**
  - **Matched:** the same card style, showing the item and size name, with Undo.
- **Size when matching:**
  - **Pick item** chooses a staple, then a size when it has several.
  - A by-weight size shows a small "Weight (lb)" field on the line, needed for a price update.
- **New staple** opens a sheet:
  - the raw line for reference
  - Name, prefilled with a cleaned guess (Ruling 4)
  - Size name (optional), Sold by, and Price, prefilled from the line
  - Category and aisle are optional

  Saving creates the staple and marks the line as matched to it.
- **Save button:** a sticky bar at the bottom with a Paper gradient behind it. The content gets enough bottom padding that the last line is never hidden. The label is "Save N prices", disabled at 0.

### Sheets and the keyboard
- **No autofocus:** `openSheet` never focuses a text input on open. It focuses the sheet container (`tabindex=-1`) for accessibility.
- **Keyboard avoidance:** while a sheet is open, listen to `visualViewport` resize and scroll events.
  - Offset the sheet's bottom by the keyboard height (`innerHeight - visualViewport.height - visualViewport.offsetTop`).
  - Cap the sheet's height to the visible area, with internal scrolling.
  - On `focusin`, scroll the focused field into view within the sheet.
- The same applies to inline inputs on the Shopping List (the price box and the add field): scroll them into view above the keyboard.

## Rulings (author calls)
1. On Finish, unticked one-offs stay on the list. Clearing them is in List settings.
2. The List badge counts unticked staples plus one-offs for the List store.
3. One-offs group under "No aisle" / "No category" when the list is grouped.
4. The new-staple name guess strips leading counts and codes ("1ct", "Gm"), size tokens ("24oz", "5 oz") and the price, then title-cases what's left. This guess is in `public/lib/receipt-name.js`, with unit tests.
5. A staple's size on the list defaults to the last size chosen for it, then to its default size.
6. Archiving a staple takes it off the list.
7. Deleting a size the list currently uses moves the list onto the default size.

8. **Changing how a size is sold** (`each` ↔ `weight`) clears that size's price and price source in the same request. The size sheet warns first: "Changing how it's sold clears the price. Enter the new price below."
9. **The staple sheet saves everything together on Save.**
   - Size edits are held in the sheet until then.
   - A **new** staple sends its sizes in `POST /api/items { sizes }`.
   - An **existing** staple applies the size additions, edits and deletions through the size routes, then PATCHes the item. Errors show inline and the sheet stays open.
   - A new staple starts with one "Standard" size row (each, price empty, amount 1), so quick add stays quick. "+ Add a size" adds more.
10. **`list_size_id` stays when the item leaves the list**, so it remembers the last size (Ruling 5). `list_amount` resets to null when the item leaves the list (remove, finish, archive or receipt confirm), when the list size changes, and when the size's `soldBy` changes.
11. **Archived names still count as taken.** Creating a staple with an archived staple's name returns 409 `{ error: 'An archived staple is called "<name>"', archivedId }`. The client then offers **Restore it**. `proposeMatches` and every picker ignore archived staples.
12. **A receipt's new staples are created only when you press Save prices.**
    - Until then they live only on that receipt screen, so Undo, leaving or never saving creates nothing.
    - On Save, the client creates each new staple with `POST /api/items`, then confirms with the new ids.
    - If creating a staple fails, nothing is confirmed and the error shows inline.
13. **The list response keeps its envelope:** `{ store, budgetCents, lines, unpriced, subtotalCents, status }`. Both arrays use the new line shape.
14. **The three post-mockup tweaks (the spec text wins):**
    - The settings control is on the page-title line, right-aligned.
    - It's a plain cog, with no outline or fill.
    - The Receipt button is icon-only.
15. **Carried over from the replaced spec:**
    - `PATCH /api/categories/:id {name}` returns 409 for a duplicate and 404 if unknown.
    - `DELETE /api/categories/:id` returns 204, or 409 `{ error: 'Move its N staples first', staples: N }` while the category is in use.
    - `GET /api/categories` includes a `count` of non-archived staples.
    - `GET /api/stores/:id/aisles` returns `[{ aisle, count }]`, sorted with `compareAisles`.
    - `POST /api/stores/:id/aisles/rename {from, to}` returns `{ renamed }`. `to` is trimmed, 1–20 characters, and only that store's staples change. Renaming onto an existing aisle merges them.
    - `GET /api/health` adds `version` from `package.json`.

## Left to the builder
- Exact sheet layouts within the mockup's style.
- The emoji grid contents.
- Icon drawing.
- How the badge refreshes (any view change, plus a tick or untick).
