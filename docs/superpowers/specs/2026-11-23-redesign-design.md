# Shelfwise redesign: design

The visual design and the flow changes that came out of the design sessions on 2026-11-23. This builds on [the original design](2026-11-23-shelfwise-design.md); anything not mentioned here stays as that document and the current code have it.

Mockups are in [2026-11-23-redesign-mockups/](2026-11-23-redesign-mockups/). Where they disagree, this document wins, and later files win over earlier ones (file 1 is the latest). They are throwaway HTML, not code to copy.

## Intent

The first build works, but its look is a neutral placeholder, and the owner is a visual designer who wants it to feel like a brand rather than a utility. While designing, she also simplified how the pantry works: an item is either fine or needs buying, buying it puts it back, and the list should follow the store's aisles.

## Goals

- The app looks like one brand: the Shelf Tag direction, with a Fig and Butter palette, a wordmark, and consistent components.
- The pantry check is faster: one tap per staple, with search and a filter to find things.
- The list is easy to shop from: grouped by aisle or category, with a compact budget tag and more room for items.
- Buying something puts it back to "stocked" without separate bookkeeping, but only when she says the trip is done.
- Every text and control colour meets WCAG 2.1 AA.

## Non-goals

- No dark mode (light only, as now).
- No Settings content yet: the tab exists with a placeholder.
- No change to how receipts are read or matched, only how the screen looks.
- No sharing, meal planning or price comparison (unchanged from the original design).

## Anti-goals

- A wrong tap in the store must not quietly change the pantry. That's why changes wait for Finish shopping.
- A filter must never stay on unnoticed and make items seem missing.
- Colour must never be the only signal for a state.

## Constraints

- Still a home-screen web app on her iPhone, served from her server over Tailscale, and it must work in the store with weak signal. Fonts therefore have to be self-hosted and cached by the service worker, not loaded from Google at runtime.
- Writes are never queued offline (current behaviour). Ticking items is stored on the phone, so it works offline; Finish shopping needs a connection.
- Existing data must carry over: today's Low and Out items become "on the list".

## Approaches considered

Visual direction, in the order they were tried:
- **Warm editorial** (cream, serif titles, sage): chosen first, then judged too generic.
- **The Ledger** (ruled notebook), **Shelf Tag** (supermarket shelf labels), **The Receipt** (till-roll paper). **Shelf Tag was chosen.**
- Shelf Tag was then softened from black and bright yellow into a brand palette. Olive green and Sage were tried and dropped; **Fig** (aubergine) beat Harbor (navy) and Espresso (brown).
- Logo: a jar-in-a-tag symbol was tried in three colourings and dropped for a **wordmark**. Of three wordmarks (shelf line, weight split, tag dot), **the tag dot** won.
- Page titles: Bricolage (clashed with the wordmark), then serifs (Fraunces, Instrument Serif), then bold sans-serifs. **Figtree 800** chosen.

Pantry status:
- Stocked / Low / Out with jar icons, then Low / Out only, then words, gauge or bar icons. **Replaced by one "on the list" toggle**, because Low and Out did the same thing.

When bought items go back to stocked:
- **At each tick**, with Undo: automatic, but stray taps change the pantry.
- **On a Finish shopping tap (chosen)**: safer, with a reminder in case she forgets.

## Visual system

### Colour

| Token | Hex | Use |
|---|---|---|
| Paper | `#F2EEE6` | Page background |
| Card | `#FBF9F5` | Rows, panels, sheets |
| Line | `#E4DED3` | Hairlines and borders |
| Fig 950 | `#1E1519` | Titles, wordmark, prices, budget tag text, main buttons |
| Fig 900 | `#2C2027` | Body text, selected chips, checked boxes |
| Fig 800 | `#3B2A34` | Spare dark |
| Fig | `#4A3242` | Brand accent: default store banner, focus ring, links |
| Fig 2 | `#5E4656` | Secondary accent text |
| Plum tint | `#EEE5EA` | Soft accent backgrounds (receipt "matched" tick) |
| Butter | `#E8CC7A` | Budget tag, on-list button, highlights, text on dark buttons |
| Stone | `#6E675D` | Secondary text |
| Pebble | `#8F887D` | Empty checkbox borders, "no price" dash |
| Marigold | `#B27A34` | Outlines for "needs a look" on receipts |
| Marigold fill | `#DDA95E` | Budget tag when nearly at budget |
| Marigold text | `#7D5D14` | "Best guess, not sure" on receipts |
| Paprika | `#A65340` | Budget tag when over budget; destructive text ("Delete store") |
| Tab label | `#4E4741` | Inactive labels on the glass tab bar |

**Store banner colours** (store's choice, default Fig): Fig `#4A3242`, Claret `#5A2E36`, Cinnamon `#553423`, Olive `#40402A`, Forest `#2D4334`, Teal `#22434A`, Harbor `#2E3A55`, Slate `#3A3D45`. All have relative luminance between 0.041 and 0.049, so they sit at Fig's darkness. Banner text is Paper; the item count is Paper at 72% opacity.

**Contrast (checked):** body text on cards 14.9:1; Fig 950 on Butter 11.4:1; Butter on Fig 950 11.4:1; Stone on Card 5.3:1 and on Paper 4.8:1; Fig on Butter (on-list icon) 7.3:1; Paper on every store colour at least 9.1:1, and the 72% count at least 5.2:1; Paprika text on Card 5.1:1; glass tab labels at least 5.6:1 over any background that can scroll under them. Search fields use the Card background, because the placeholder on a tinted field would fall to 4.5:1.

### Type

- **Wordmark:** "Shelfwise" in Bricolage Grotesque ExtraBold, Fig 950, tight tracking (about -0.045em). The dot of the "i" is a small Butter shelf tag: a rounded rectangle with a punched hole on its left, tilted about -8°. On light backgrounds the tag gets a hairline Fig 950 edge so it doesn't vanish (Butter on Paper is 1.4:1); on dark backgrounds, no edge. 24px in the header.
- **Page titles:** Figtree 800, about 32px, Fig 950, tight tracking.
- **Prices, section labels, buttons, chips:** Bricolage Grotesque (700–800). Prices are drawn shelf-tag style: a small "$", whole dollars large, cents raised and smaller.
- **Body text:** the iPhone system font.
- **Raw receipt lines:** IBM Plex Mono.

### Components

- **Header (every screen):** wordmark left, store picker pill right, page title below.
- **Glass tab bar:** a floating, rounded, frosted bar with four tabs: Pantry, List, Receipt, Settings. Card colour at 76% opacity, background blur and saturation, a bright top highlight and a soft shadow. The current tab has a faint Fig-tinted pill. It collapses to a single glass circle at the bottom left (showing the current tab's icon) when you scroll down, and opens again when you scroll up or tap it.
- **Store banner:** a full-width rounded bar in the store's colour, with the store name in uppercase and the item count. Tap to fold or unfold that store's section.
- **On-the-list button:** 44×44. Off: Paper square with a Stone basket and plus. On: Butter square with a Fig basket and tick, and the row gets a Butter left edge and "on the list" under the name.
- **Budget tag (List):** a Butter label with a punched hole on its left and a rounded right end, about 68px tall. Left: the amount left to spend as a big shelf-tag price. Right: "LEFT TO SPEND" and "$61.60 of $75". No meter. It turns Marigold fill when nearly at budget and Paprika with Paper text and "Over budget" when over, using the existing near and over rules in `src/lib/list.ts`.
- **Sheets:** bottom sheets on Card with a grab handle, a Figtree title, and one full-width Fig 950 button with Butter text.
- **Main button:** Fig 950 with Butter text. Secondary: Paper with Fig 900 text.
- **Finish shopping pill:** 44px tall, Fig 950, "Finish shopping" plus a round Butter count badge. It sits at the bottom right, next to the collapsed tab circle. It only appears when something is ticked.

## Screens and behaviour

### Pantry

- The store picker offers **All stores** (new) or one store. With All stores, each store is a banner section in its own colour; with one store, just that store.
- **Search** across the visible staples. While typing, store sections become one flat list, each row shows "$price · Store", and the match is highlighted. The tab bar hides behind the keyboard.
- **Filter button** opens a sheet with:
  - **Show:** All staples / On the list.
  - **Category:** dropdown, default "All categories".
  - **Sort by:** Store, Name, Category, Recently changed. When a single store is picked, "Store" is removed and **Aisle** is offered instead, as the default (my call).
  - **Only items without a photo** switch.
  - The apply button counts matches live ("Show 4 staples").
- **With a filter on**, the filter button turns Fig 900 with a Butter badge showing how many filters are active, and a line under the search reads "Showing **On the list** · 4 of 21 · Clear".
- **How sorting lays out the list** (my call):
  - **Sort by Store** shows the store banner sections.
  - **Category** and **Aisle** show one list with plain-text group headers, styled like the List's.
  - **Name** and **Recently changed** show one flat list. With All stores, each row's detail line then also shows "· Store".
  - "Recently changed" means most recently added to or taken off the list, or edited.
- **Adding a staple** (my call): a **+** button beside the filter button opens the Edit staple sheet in "New staple" mode. Its Store defaults to the picked store, or to the main store when All stores is showing. This replaces today's inline "Add a staple" form.
- **Each row:** photo, name, "$price last paid" (or "2 × $1.89" when the usual quantity is over 1), and the on-the-list button.
- Tapping the photo or name opens **Edit staple**.
- The old floating "Running low" button and its dialog are removed.

### Edit staple (sheet)

- Photo (with Change) and name.
- **Store** dropdown.
- **Category** dropdown, with "New category…" at the end.
- **Aisle** dropdown with the aisles already used at that store, plus "New aisle…" and "None".
- **Price:** a dollar field holding the last paid price, editable.
- **Usual quantity** stepper.
- **Under the price,** a line saying where it came from: "From Market Basket receipt, 23 Nov" or "Entered by you". Saving a changed price marks it "Entered by you"; the next confirmed receipt overwrites it and marks it as from that receipt.
- Delete staple stays (with the existing two-tap confirm).

### List

- **Per store** (the picker doesn't offer All stores here; my call, since a trip is to one store).
- The compact budget tag. The budget is still set per store, as now.
  - **Tapping the tag** opens a small sheet to set or clear the budget (my call). This replaces today's inline "Budget $" field.
  - **With no budget set**, the tag stays the same size and colour, but shows the estimated total as the big price ("$61.60"). The right side reads "ESTIMATED" and "Tap to set a budget".
- A bar reading "TO GET 6" with a **group button**: By aisle / By category / None, plus the "Move ticked items to the bottom" switch (on by default). The choice is remembered per store on the phone.
- **Group headers show only one label:** "Aisle 4" when grouped by aisle, or "Dairy & eggs" when grouped by category. Aisles sort in walking order: numbers numerically, then named aisles alphabetically; "No aisle" comes last. Categories sort alphabetically, with "No category" last.
- **Rows:** tick box, photo, name, "1 × $11.99", line price. Items with no price show "No price yet · not counted" and a dash, and aren't counted in the total.
- **Adding by hand** stays (it makes or reuses a staple and puts it on the list).
- **Ticking** is stored on the phone as now. Ticked rows dim with a strike-through and, if the switch is on, move to an "In the cart" group at the bottom.
- **A trip is one store** (my call). Ticks are kept on the phone per store, along with the time of that store's first tick (the trip's start). Clearing the last tick clears the start time.
- **Finish shopping** opens a sheet: "Back in your pantry · N" listing that store's ticked items, and "Still to get · N" naming the rest. Confirming takes those ticked items off the list on the server, clears that store's ticks, and leaves the rest on the list. Other stores' ticks are untouched. "Keep shopping" closes the sheet. The budget amount is kept for next time (my call). If offline, it says so and changes nothing.
- **Forgotten trip:** when the app opens, any store whose trip started on an earlier calendar day gets a Butter-outlined card at the top of Pantry and List. It asks "Finish Saturday's trip to Market Basket?", naming the start day, with **Finish trip** (the same as Finish shopping for that store) and **Review list**. With two such stores, the cards stack. In the Pantry, those items also read "in the cart".

### Receipt

Same flow and data as now, restyled, as in mockup file 4:
- the receipt summary card
- "Needs a look" cards with a Marigold outline, the raw line in mono above the guess, and Yes / Pick item / Skip (or Pick item / Skip when there's no guess). The "New item" button in the mockup is **out of scope**: receipt matching works as today (my call).
- "Matched" rows with a Plum-tint tick
- a Fig 950 "Save N prices" button

Confirming still sets each matched staple's price (now marked as from that receipt) and takes it off the list, as now.

### Stores

- The store picker is a menu: All stores (Pantry only), each store with a colour dot and **Edit**, and **Add a store**. This replaces the current `+` button and `window.prompt`.
- **Edit store** sheet:
  - name
  - **banner colour** (the eight swatches, with a live banner preview)
  - **Main store** switch
  - Save
  - **Delete store** (my call):
    - Allowed only for a store with no staples. Otherwise it says how many staples to move or delete first.
    - The main store can't be deleted until another store is made main.
    - Deleting also removes that store's past receipts and their photos, and the confirm step says so.
- Sorting and grouping that mention a store use these colours as the store's dot.

### Settings

A fourth tab with a placeholder ("More settings coming"). Not designed yet.

## Data changes

- **Status:** one "on the list" flag per staple. Drop Stocked / Low / Out from the API and screens. Migrate existing Low and Out items to on the list. The `state` column can be removed or left unused, the builder's call, but nothing may read it.
- **Category:** a shared list of categories (name, unique), seeded with a sensible starting set: Produce, Dairy & eggs, Meat & fish, Bakery, Pasta & grains, Oils & condiments, Canned & jarred, Baking, Snacks, Frozen, Drinks, Household. Each staple has an optional category.
- **Aisle:** each staple has an optional short text aisle label ("4", "Deli"), belonging to its store.
- **Price source:** each staple records whether its price came from a receipt (with the receipt's store and date) or was entered by hand.
- **Store colour:** each store has a colour, one of the eight names, default Fig.
- **Store edit/delete:** add update and delete routes for stores.

## Calls made by the author

- Light mode only.
- Aisle is free text, sorted numbers first.
- The List is always one store.
- Sort by Aisle replaces Sort by Store when one store is picked.
- Store delete is blocked while the store has staples.
- The budget amount carries over after Finish shopping.
- The Finish shopping summary is one "Back in your pantry" group, because with a single flag there's no difference between pantry items and items added by hand.
- A trip is one store, and the reminder triggers when that store's trip started on an earlier calendar day.
- The seed category list.
- Pantry sort layouts: banners only for Sort by Store; headers for Category and Aisle; flat for the rest.
- Adding a staple is a + button that opens the edit sheet in "New staple" mode.
- The budget is set by tapping the tag. With no budget, the tag shows the estimate.
- No "New item" on receipts for now.
- Deleting a store also deletes its receipts; the main store can't be deleted.

## Left to the builder

- How to structure the CSS and components.
- Icon drawing details.
- Animation timing for the tab bar collapse.
- How fonts are self-hosted and cached.
- The schema migration mechanics.
- Exact spacing, where the mockups and this document don't pin it down.
