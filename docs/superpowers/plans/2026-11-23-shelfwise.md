# Shelfwise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Shelfwise, an iPhone home-screen web app that tracks pantry staples (Stocked / Low / Out), builds per-store grocery lists with a budget subtotal from last-paid prices, and updates prices from confirmed receipt photos.

**Architecture:** A small Node server owns a SQLite database and photo files and serves both a JSON API and the static front end. The front end is a no-build-step installable web app (vanilla ES modules plus a service worker) that caches the current list and prices on the phone for weak signal in stores. Pure logic (list/subtotal, receipt parsing, receipt matching) lives in small testable modules separate from HTTP and the UI.

**Tech Stack:** Node 22, TypeScript run with `tsx`, Express, better-sqlite3, multer (uploads), sharp (photo resizing), tesseract.js (receipt OCR on the server), vitest + supertest. Front end: plain HTML/CSS/JS modules, no bundler.

**Spec:** https://claude.ai/artifact/EgRpBUWeprDEsYUNVYc2dk ("Shelfwise: design", approved 2026-11-23)

## Global Constraints

- Phone only (iPhone, added to home screen). No desktop layout work.
- Hosted on the owner's personal server, reached over Tailscale. Served over HTTPS (needed for camera) via `tailscale serve`.
- Item state is exactly one of `stocked`, `low`, `out`. No exact quantities.
- Each item has exactly one home store. No cross-store price comparison.
- Subtotal = sum of (last paid price × usual quantity) over list items. Last paid price, not an average. Tax is not included.
- Items with no price yet are listed separately as "no price yet" and never counted as $0 in the total.
- Money is stored as integer cents everywhere.
- Receipts are never applied automatically: every price update requires the owner to confirm the match.
- Non-goals: meal planning, recipes, barcodes, sharing/multi-user, exact quantities.

## Review Focus

- An item with no price on a list: shown under "no price yet", subtotal excludes it, and the total never silently reads low.
- Budget of 0 or blank: the list still works and shows the subtotal with no over/under warning.
- A receipt photo that OCR cannot read (blank text): the app says so plainly, offers a retry, and changes nothing, rather than erroring.
- Receipt lines that match no item: shown as unmatched and skippable, never forced onto an item.
- Two items with the same name, or a name differing only in case/spacing: rejected within one store.
- A very large or rotated phone photo: stored resized (max 1024px on the long edge) and loads fast in the list.
- Server unreachable (Tailscale off): the cached list and prices still display, with a clear "offline" indicator.

---

## File Structure

```
shelfwise/
  package.json, tsconfig.json, vitest.config.ts
  src/server.ts            # Express app factory + listen
  src/db.ts                # openDb, schema, migrations
  src/lib/money.ts         # parse/format cents
  src/lib/list.ts          # buildList (pure)
  src/lib/receipt.ts       # parseReceiptText, normalizeLabel (pure)
  src/lib/match.ts         # proposeMatches (pure)
  src/lib/ocr.ts           # readReceiptText(imagePath) wrapper around tesseract.js
  src/lib/photos.ts        # saveItemPhoto, saveReceiptPhoto (sharp)
  src/routes/stores.ts, items.ts, list.ts, receipts.ts
  tests/*.test.ts
  public/index.html, app.css, app.js, sw.js, manifest.webmanifest
  public/views/review.js, list.js, receipt.js, api.js
  data/                    # shelfwise.db and photos/ (gitignored)
  docs/superpowers/plans/2026-11-23-shelfwise.md
  DEPLOY.md
```

---

### Task 1: Project scaffold and database

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (ignores `node_modules`, `data/`), `src/db.ts`, `src/server.ts`, `tests/db.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): Database` (better-sqlite3; `":memory:"` allowed) that creates all tables idempotently; `createApp(db: Database): Express` in `src/server.ts` with `GET /api/health` returning `{ ok: true }`.
- Schema produced (columns, cents are integers):
  - `stores(id INTEGER PK, name TEXT UNIQUE, is_main INTEGER DEFAULT 0)`
  - `items(id PK, name TEXT, store_id → stores, state TEXT CHECK in ('stocked','low','out') DEFAULT 'stocked', usual_qty INTEGER DEFAULT 1, photo TEXT NULL, last_price_cents INTEGER NULL, on_list INTEGER DEFAULT 0, UNIQUE(store_id, name COLLATE NOCASE))`
  - `aliases(id PK, item_id → items ON DELETE CASCADE, label TEXT UNIQUE)`
  - `receipts(id PK, store_id → stores, created_at TEXT, status TEXT CHECK in ('pending','confirmed'), raw_text TEXT, photo TEXT)`
  - `receipt_lines(id PK, receipt_id → receipts ON DELETE CASCADE, raw_text TEXT, price_cents INTEGER, item_id INTEGER NULL)`

- [ ] **Step 1:** `git init`; write `package.json` (scripts: `dev`, `start`, `test`) and install the stack above.
- [ ] **Step 2:** Write `tests/db.test.ts`: `creates_all_tables`, `rejects_invalid_state` (insert item with state `'empty'` throws), `rejects_duplicate_name_same_store_case_insensitive` (`"Rice"` then `"rice "`-trimmed-equivalent `"RICE"` throws), `allows_same_name_in_different_stores`. Run `npx vitest run tests/db.test.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement `openDb` and `createApp` with the schema above. Add `tests/server.test.ts::health_returns_ok` using supertest.
- [ ] **Step 4:** Run `npx vitest run`; expect all PASS.
- [ ] **Step 5:** Commit: `git add -A && git commit -m "chore: scaffold server and schema"`.

---

### Task 2: Money helpers and the list/subtotal logic

**Files:**
- Create: `src/lib/money.ts`, `src/lib/list.ts`, `tests/money.test.ts`, `tests/list.test.ts`

**Interfaces:**
- Produces:
  - `parseDollars(input: string): number | null` — `"9.49"`, `"$9.49"`, `"9"` → cents (949, 900); `""`, `"abc"`, negative → `null`.
  - `formatCents(cents: number): string` — `949` → `"$9.49"`.
  - `type ListItem = { id: number; name: string; photo: string | null; state: 'stocked'|'low'|'out'; usualQty: number; lastPriceCents: number | null; onList: boolean }`
  - `buildList(items: ListItem[], budgetCents: number | null): { lines: ListLine[]; unpriced: ListLine[]; subtotalCents: number; status: 'none' | 'under' | 'near' | 'over' }` where a list item is any item with `state !== 'stocked'` or `onList`, `lines` are the priced ones, and `status` is `'near'` at ≥90% of budget, `'over'` above 100%, `'none'` when budget is null or 0.

- [ ] **Step 1:** Write tests: `money.parses_common_inputs`, `money.rejects_junk`, `list.includes_low_out_and_manual_only`, `list.subtotal_is_price_times_qty` (e.g. 949×2 + 399 = 2297), `list.unpriced_items_excluded_from_subtotal_and_listed_separately`, `list.status_thresholds` (budget 10000: 8999 → under, 9000 → near, 10001 → over), `list.zero_or_null_budget_gives_status_none`.
- [ ] **Step 2:** Run `npx vitest run tests/money.test.ts tests/list.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement both modules (pure functions, no I/O).
- [ ] **Step 4:** Run the same command; expect PASS.
- [ ] **Step 5:** Commit: `feat: money helpers and list subtotal logic`.

---

### Task 3: Stores and items API

**Files:**
- Create: `src/routes/stores.ts`, `src/routes/items.ts`, `tests/items.test.ts`
- Modify: `src/server.ts` (mount routes)

**Interfaces:**
- Consumes: `createApp(db)` from Task 1.
- Produces (all JSON):
  - `GET /api/stores` → `Store[]`; `POST /api/stores {name, isMain?}` → 201 `Store`; exactly one main store (setting a new main clears the old).
  - `GET /api/items?storeId=` → `Item[]` (camelCase of schema columns); `POST /api/items {name, storeId, usualQty?}` → 201; duplicate name in a store → 409; blank name → 400.
  - `PATCH /api/items/:id {state?, usualQty?, onList?, name?, storeId?, lastPriceCents?}` → 200 `Item`; invalid state → 400.
  - `DELETE /api/items/:id` → 204.

- [ ] **Step 1:** Write supertest tests: `creates_store_and_item`, `duplicate_item_name_in_store_returns_409`, `blank_name_returns_400`, `patch_state_to_low`, `patch_invalid_state_returns_400`, `only_one_main_store`, `delete_item_removes_aliases` (cascade).
- [ ] **Step 2:** Run `npx vitest run tests/items.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the routes with prepared statements; trim names; map DB rows to camelCase.
- [ ] **Step 4:** Run `npx vitest run`; expect PASS.
- [ ] **Step 5:** Commit: `feat: stores and items API`.

---

### Task 4: Item photos

**Files:**
- Create: `src/lib/photos.ts`, `tests/photos.test.ts`
- Modify: `src/routes/items.ts` (add upload route), `src/server.ts` (serve `/photos`)

**Interfaces:**
- Produces: `saveItemPhoto(dataDir: string, buffer: Buffer): Promise<string>` — auto-rotates from EXIF, resizes to max 1024px on the long edge (never enlarging), writes JPEG to `<dataDir>/photos/<uuid>.jpg`, returns the filename. `POST /api/items/:id/photo` (multipart field `photo`, limit 15 MB) sets `items.photo` and returns the updated `Item`; non-image upload → 400. Photos are served at `/photos/<filename>`.

- [ ] **Step 1:** Write tests with a generated 3000×2000 image from `sharp`: `resizes_to_max_1024`, `does_not_enlarge_small_images`, `upload_sets_item_photo`, `non_image_returns_400`, `photo_is_served`.
- [ ] **Step 2:** Run `npx vitest run tests/photos.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement with `sharp(...).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 })` and multer memory storage.
- [ ] **Step 4:** Run `npx vitest run`; expect PASS.
- [ ] **Step 5:** Commit: `feat: item photo upload`.

---

### Task 5: List endpoint

**Files:**
- Create: `src/routes/list.ts`, `tests/list-route.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `buildList`, `ListItem` from Task 2; items from Task 3.
- Produces: `GET /api/stores/:id/list?budget=<dollars string>` → `{ store, lines, unpriced, subtotalCents, status, budgetCents }`, where `budget` is parsed with `parseDollars` (invalid or missing → `budgetCents: null`). Unknown store → 404.

- [ ] **Step 1:** Write tests: `list_contains_only_that_stores_low_and_out_items`, `list_applies_budget_status`, `invalid_budget_is_ignored`, `unknown_store_404`.
- [ ] **Step 2:** Run `npx vitest run tests/list-route.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the route by loading the store's items and calling `buildList`.
- [ ] **Step 4:** Run `npx vitest run`; expect PASS.
- [ ] **Step 5:** Commit: `feat: per-store list endpoint`.

---

### Task 6: Receipt parsing and matching (pure logic)

**Files:**
- Create: `src/lib/receipt.ts`, `src/lib/match.ts`, `tests/receipt.test.ts`, `tests/match.test.ts`

**Interfaces:**
- Produces:
  - `normalizeLabel(raw: string): string` — lowercase, collapse whitespace, strip punctuation and trailing price/flag characters.
  - `type ParsedLine = { raw: string; priceCents: number }`
  - `parseReceiptText(text: string): ParsedLine[]` — keeps lines that end in a price (`2.99`, `$2.99`, optional trailing tax flag letter like `F` or `T`); ignores lines containing `subtotal`, `total`, `tax`, `balance`, `change`, `cash`, `visa`, `mastercard`, `debit`, `credit`; ignores negative amounts (discounts).
  - `type Proposal = { lineIndex: number; itemId: number | null; reason: 'alias' | 'name' | 'none' }`
  - `proposeMatches(lines: ParsedLine[], items: {id: number; name: string}[], aliases: {itemId: number; label: string}[]): Proposal[]` — an exact alias match (by `normalizeLabel`) wins; otherwise the item whose name tokens best overlap the line's tokens, requiring that every token of the item name appears as a prefix of some line token with at least 3 characters (so `ORG BNNA` does not match `Bananas` by name, but `BANANAS 1.29` does); a line already claimed by one item is not matched twice.

- [ ] **Step 1:** Write tests: `parses_priced_lines`, `ignores_totals_tax_and_payment_lines`, `ignores_negative_discounts`, `handles_trailing_tax_flag`, `alias_match_wins_over_name`, `name_match_by_prefix_tokens`, `unmatched_line_has_null_item`, `an_item_is_not_matched_twice`.
- [ ] **Step 2:** Run `npx vitest run tests/receipt.test.ts tests/match.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement both as pure functions.
- [ ] **Step 4:** Run the same command; expect PASS.
- [ ] **Step 5:** Commit: `feat: receipt parsing and matching`.

---

### Task 7: Receipts API with OCR and confirmation

**Files:**
- Create: `src/lib/ocr.ts`, `src/routes/receipts.ts`, `tests/receipts.test.ts`
- Modify: `src/server.ts` (accept an injectable `readReceiptText` in `createApp` options so tests do not run real OCR)

**Interfaces:**
- Consumes: `parseReceiptText`, `proposeMatches` (Task 6); `saveReceiptPhoto` (add to `src/lib/photos.ts`, same resizing but max 2000px for legibility).
- Produces:
  - `readReceiptText(imagePath: string): Promise<string>` using tesseract.js (English).
  - `POST /api/receipts` (multipart `photo`, field `storeId`) → 201 `{ id, storeId, status: 'pending', readable: boolean, lines: [{ id, raw, priceCents, proposedItemId | null, reason }] }`. If OCR yields no priced lines, `readable: false` and `lines: []`.
  - `POST /api/receipts/:id/confirm { matches: [{ lineId, itemId | null }] }` → 200. For each matched line, in one transaction: set the item's `last_price_cents` to the line price, add the line's normalized label to `aliases` (ignore if it already exists for any item), set the item's state to `stocked`, mark the receipt `confirmed`. Lines with `itemId: null` change nothing. Confirming twice → 409. An `itemId` from a different store → 400.

- [ ] **Step 1:** Write tests with an injected fake OCR: `upload_returns_proposals`, `unreadable_receipt_returns_readable_false`, `confirm_updates_price_alias_and_state`, `unmatched_lines_change_nothing`, `confirm_twice_returns_409`, `item_from_other_store_returns_400`, `next_receipt_uses_saved_alias` (second receipt with the same abbreviated label proposes the item with reason `alias`).
- [ ] **Step 2:** Run `npx vitest run tests/receipts.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement routes and the OCR wrapper; confirm runs inside `db.transaction`.
- [ ] **Step 4:** Run `npx vitest run`; expect PASS. Also run once manually with a real receipt photo and note OCR quality in the commit message.
- [ ] **Step 5:** Commit: `feat: receipt upload, matching proposals and confirmation`.

---

### Task 8: App shell, install files and the pantry review screen

**Files:**
- Create: `public/index.html`, `public/app.css`, `public/app.js`, `public/api.js`, `public/views/review.js`, `public/manifest.webmanifest`, `tests/ui-smoke.test.ts`

**Interfaces:**
- Consumes: the API from Tasks 3–5.
- Produces: `api.js` exports `getStores()`, `getItems(storeId)`, `patchItem(id, patch)`, `createItem(body)`, `uploadItemPhoto(id, file)`, `getList(storeId, budgetDollars)`, `uploadReceipt(storeId, file)`, `confirmReceipt(id, matches)`. `views/review.js` exports `renderReview(root, state)`. Hash routes: `#/review/:storeId`, `#/list/:storeId`, `#/receipt/:storeId`. A store switcher sits at the top with the main store selected first.

Review screen behavior: items for the selected store, each row showing photo (tap to take/choose a photo), name, and a three-way Stocked / Low / Out control; changing the control calls `patchItem` immediately. An "Add item" row creates an item. Touch targets are at least 44px. A bottom tab bar switches Review / List / Receipt. Visual style is deliberately plain and token-driven (CSS custom properties for color, type and spacing) so the owner can restyle it.

- [ ] **Step 1:** Write `ui-smoke.test.ts` (supertest): `index_served`, `manifest_has_name_shelfwise_and_standalone_display`, `static_assets_served`.
- [ ] **Step 2:** Run `npx vitest run tests/ui-smoke.test.ts`; expect FAIL.
- [ ] **Step 3:** Serve `public/` statically from `src/server.ts`; build the shell, manifest (name Shelfwise, `display: standalone`, icons placeholder), `api.js` and the review view.
- [ ] **Step 4:** Run `npx vitest run`; expect PASS. Then `npm run dev` and check the review screen in a phone-sized browser window: toggling a state persists after reload; adding an item and a photo works.
- [ ] **Step 5:** Commit: `feat: app shell and pantry review screen`.

---

### Task 9: List screen, budget and quick flag

**Files:**
- Create: `public/views/list.js`
- Modify: `public/app.js`, `public/app.css`

**Interfaces:**
- Consumes: `getList`, `patchItem` from `api.js`.
- Produces: `renderList(root, state)`.

List screen behavior: a budget field at the top (dollars, remembered per store in `localStorage`); a header line like `$62.00 of $75.00` that is neutral for `under`/`none`, cautionary for `near`, and clearly flagged for `over`; priced lines with photo, name, quantity and line price; a separate "No price yet" section; tapping a line checks it off (checked state held in `localStorage`, not sent to the server); a "+" button adds an item to the list by name (existing item gets `onList: true`; unknown name creates it). Quick flag: a floating "Running low" button on every screen opens a search box listing the store's items; picking one sets it to `low` in one tap.

- [ ] **Step 1:** Add `ui-smoke` check `list_view_module_served`; run it; expect FAIL.
- [ ] **Step 2:** Implement `renderList`, the budget field, the status styling, the check-off behavior and the quick flag.
- [ ] **Step 3:** Run `npx vitest run`; expect PASS.
- [ ] **Step 4:** Manual check in a phone-sized window: mark two items Low, open the list, see the subtotal and an item with no price in its own section; set a budget below the subtotal and see the over-budget state; use the quick flag from the Review screen.
- [ ] **Step 5:** Commit: `feat: list screen with budget and quick flag`.

---

### Task 10: Receipt screen

**Files:**
- Create: `public/views/receipt.js`
- Modify: `public/app.js`, `public/app.css`

**Interfaces:**
- Consumes: `uploadReceipt`, `confirmReceipt`, `getItems`.
- Produces: `renderReceipt(root, state)`.

Behavior: a "Photograph receipt" button opens the camera or library. After upload, show each read line with its price and a picker prefilled with the proposed item (or "Skip"). Proposals made by saved alias are visually marked as remembered. A "Confirm" button sends the matches and shows a short summary (`N prices updated`). If `readable` is false, show a plain message ("I couldn't read that receipt") with a retry button and change nothing.

- [ ] **Step 1:** Add `ui-smoke` check `receipt_view_module_served`; run it; expect FAIL.
- [ ] **Step 2:** Implement the view and wire the tab.
- [ ] **Step 3:** Run `npx vitest run`; expect PASS.
- [ ] **Step 4:** Manual check with a real receipt: lines appear, matches can be changed, confirming updates the prices shown on the list screen; photographing the same store's next receipt prefills remembered matches.
- [ ] **Step 5:** Commit: `feat: receipt screen`.

---

### Task 11: Offline cache and service worker

**Files:**
- Create: `public/sw.js`
- Modify: `public/app.js`, `public/api.js`, `tests/ui-smoke.test.ts`

**Interfaces:**
- Produces: a service worker that precaches the app shell (HTML, CSS, JS modules, manifest) and uses network-first with cache fallback for `GET /api/stores`, `GET /api/items`, `GET /api/stores/:id/list` and `/photos/*`. `api.js` marks read failures as offline and the UI shows an "Offline: showing saved list" bar. Writes made while offline are rejected with a visible message (no offline write queue; this is a non-goal for now).

- [ ] **Step 1:** Add smoke tests `service_worker_served_with_javascript_type` and `sw_precache_list_includes_all_view_modules` (parse `sw.js` for each file in `public/views/`). Run; expect FAIL.
- [ ] **Step 2:** Implement `sw.js`, registration in `app.js`, and the offline bar.
- [ ] **Step 3:** Run `npx vitest run`; expect PASS.
- [ ] **Step 4:** Manual check: load the list once, stop the server (or turn Tailscale off on the phone), reload; the saved list, prices and photos still display with the offline bar; changing an item state shows an error and does not pretend to save.
- [ ] **Step 5:** Commit: `feat: offline read cache`.

---

### Task 12: Deployment over Tailscale and backups

**Files:**
- Create: `DEPLOY.md`, `scripts/backup.sh`

**Interfaces:**
- Produces: documented steps to run the server on the personal server (`npm run start`, listening on `127.0.0.1:3000`, data directory configurable via `SHELFWISE_DATA`), keep it running (systemd unit text included), expose it with `tailscale serve --bg 3000` for an HTTPS `*.ts.net` address, and add it to the iPhone home screen. `scripts/backup.sh` copies `data/` to a dated archive using SQLite's `.backup` command for the database, and the doc shows a nightly cron line.

- [ ] **Step 1:** Make the data directory and port configurable via `SHELFWISE_DATA` and `PORT`; add `tests/config.test.ts::uses_env_data_dir`; run it; expect FAIL, then implement, then PASS.
- [ ] **Step 2:** Write `DEPLOY.md` and `scripts/backup.sh`.
- [ ] **Step 3:** On the server: run the steps in `DEPLOY.md`; open the HTTPS address on the phone; confirm the camera prompt appears and the app installs to the home screen.
- [ ] **Step 4:** Run `scripts/backup.sh`; restore the archive into a temp directory and open it with `openDb`; expect the same item count.
- [ ] **Step 5:** Commit: `docs: deployment and backup`.

---

## Self-Review

- **Spec coverage:** pantry review (Tasks 3, 8), quick flag (9), per-store lists (3, 5, 9), budget and subtotal with unpriced items shown separately (2, 5, 9), photos (4, 8), receipts with confirm and learned aliases (6, 7, 10), phone caching (11), server, Tailscale and backups (12). Non-goals are in Global Constraints and no task builds them.
- **Type consistency:** `ListItem`, `ListLine`, `ParsedLine`, `Proposal` are defined once (Tasks 2 and 6) and used with the same names in later tasks. Cents are integers throughout. API field names are camelCase and the DB columns snake_case, mapped in Task 3.
- **Review Focus coverage:** unpriced items (Tasks 2, 5), zero budget (2, 5), unreadable receipt (7, 10), unmatched lines (6, 7), duplicate names (1, 3), large photos (4), offline (11).
- **Left open on purpose:** the visual styling is minimal and token-driven for the owner to direct; the PWA icon is a placeholder; no offline write queue.
