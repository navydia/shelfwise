# Shelfwise: design

A phone-first pantry and grocery list app. Design approved 2026-11-23.

## Intent

The owner has two problems. She has no reliable way to track pantry staples, so she forgets to add them to the list when they run low. And she overspends her grocery budget because she underestimates prices. Shelfwise fixes both: a quick review of staples when building a list, and a running subtotal based on prices actually paid.

## Goals

- Reviewing the pantry takes about a minute and nothing gets forgotten.
- The list shows a subtotal against a per-trip budget, built from real prices from past receipts.
- Uploading a receipt and confirming matches takes a minute or two.
- Works well on an iPhone, including in the store.

## Non-goals

- No desktop layout.
- No exact quantity tracking ("2.5 cups left"). Items are Stocked, Low, or Out.
- No price comparison across stores. Each item has one home store.
- No meal planning, recipes, barcode scanning, or sharing with other people.
- No fully automatic receipt reading. The owner confirms matches.

## Anti-goals

A version that works but needs daily bookkeeping would fail. So would one where a wrong receipt price silently feeds the estimates.

## Constraints

- Installable web app (added to the iPhone home screen), built through Claude Code.
- Hosted on the owner's personal server, reached over Tailscale. The camera needs HTTPS, so the app is served over a Tailscale HTTPS address.
- The phone needs Tailscale on to sync. The current list and prices are cached on the phone so a store trip works with weak signal.

## Approaches considered

- **Web app on the home screen (chosen).** Cheapest, no App Store, one codebase. No home-screen widget.
- **Native iPhone app.** Best feel and widgets, but needs a Mac and Xcode, and either weekly re-installs or $99 a year.
- **React Native.** In between, with the install rules of native and weaker receipt reading.
- **Data storage:** phone-only storage with manual backup was rejected once the personal server was available. Server storage with a phone cache was chosen.

## How it works

**Pantry review.** When building a list, a page shows all staples with a photo and a Stocked / Low / Out control, grouped by store. Marking Low or Out puts the item on that store's list.

**Quick flag.** A fast way to mark an item Low from anywhere in the app, for the moment she notices mid-cooking.

**Store lists.** Each item belongs to one home store. A store's list is its Low and Out items plus anything added by hand. There is a main store plus a few specialty stores.

**Budget and subtotal.** She sets a budget when starting a trip. The list shows the subtotal against it (for example $62 of $75) and warns as it approaches or passes the budget. The subtotal is each item's last paid price times quantity. Items with no price yet are shown separately as "no price yet" so they are not counted as free.

**Receipts.** She photographs a receipt. The server reads the lines and proposes matches to her items. She confirms or fixes each match, which takes a minute or two. Confirmed matches update each item's last paid price and teach the app that receipt's abbreviations for next time.

**Photos.** Each item has a photo, from the camera or photo library, resized for fast loading.

## Calls made by the author

- Name: Shelfwise (the owner's choice).
- Three states per item: Stocked / Low / Out.
- Each item has a usual quantity, default 1, used for the subtotal.
- Tax is not included in the estimate.
- Last paid price is used, not an average.
- One home store per item, with room to allow a second store later.
- The quick flag is a small extra. The review page is the main flow.

## Left to the builder

Backend language and framework, database, the receipt reading method on the server, the screen designs and visual style (the owner is a visual designer and will likely want to direct this), and how the phone cache is kept in sync.
