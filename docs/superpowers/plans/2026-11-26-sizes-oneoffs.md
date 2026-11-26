# Sizes, One-offs, Navigation and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved bundle:
- staple sizes, including by-weight pricing
- one-offs on the Shopping List
- new staples from receipts
- two-tab navigation with a Receipt button and per-screen settings sheets
- archiving staples
- emoji pictures
- brighter store colours
- a fixed Receipt screen
- sheets that don't autofocus and avoid the keyboard

**Architecture:**
- Server: migration v2 adds a `sizes` table, a `oneoffs` table, and new item and store fields. Routes grow to cover sizes, one-offs, archive, the new list line shape, size-aware receipt confirmation, and category/aisle management.
- Client: new pure logic in `public/lib/` (unit-tested), plus restyled and rewritten views.

**Tech Stack:** Node 22 `node:sqlite`, Express 5, vitest + supertest, vanilla ES-module PWA.

**Spec:** `docs/superpowers/specs/2026-11-26-sizes-oneoffs-design.md`. Read the whole spec, including Rulings 1–15, before any task. Mockup: `docs/superpowers/specs/2026-11-26-sizes-oneoffs-mockups.html`; the spec text wins.

## Global Constraints
- **Branch:** `sizes-oneoffs`.
- **Commits:** `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, with every message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't change git config. **Don't push.**
- **Migration v2** is appended to `MIGRATIONS`. It must be idempotent, run in one transaction, and keep every existing row and price.
  - The owner's live database is `data/shelfwise.db` (user_version 1): don't touch it. Test on temp copies.
- **Store colours:** exactly `tomato #D2452F, pumpkin #C2620F, berry #C0306E, violet #7A4FD0, blue #2F6FD6, teal #0E8A86, green #3E8E2F, slate #5E6B7D`. The default is `tomato`, and the old-name mapping is as the spec gives it.
- **Visual system:** Figtree text, sentence case, existing tokens plus the new store colours, text ≥4.5:1 and controls ≥3:1. Every empty state uses `emptyState` with one primary button. No photos on Shopping List rows.
- **Offline:** writes are never queued. New or removed `public/` files are reflected in the `sw.js` SHELL, and VERSION is bumped in every task that changes shell files.
- **Stale renders:** keep `ctx.stale()` checks after every await, before writing to the page.
- **Checks:** `npm test` and `npx tsc --noEmit` stay green. Browser checks use `SHELFWISE_DATA=<scratch>/x PORT=31xx npx tsx tests/e2e/serve.ts` plus `node scripts/seed-demo.mjs <url>` at 375×812. Stop the servers afterwards.

## Review Focus
1. **Upgrading a real v1 database:** every item gets exactly one default size carrying its old price, source, receipt link and quantity; on-list items keep their place; store colours are remapped. *Test: Task 1, `migrates_v1_to_v2_sizes_and_colours`.*
2. **No silent wrong prices:**
   - A by-weight match without a weight leaves the price unchanged.
   - Flipping `soldBy` clears the price.
   - A weight price is round(line ÷ lb).

   *Tests: Task 3, `weight_match_without_weight_keeps_price` and `weight_match_divides`. Task 1, `soldby_change_clears_price`.*
3. **Finish is all-or-nothing:** it takes staples off the list and deletes one-offs. An id from another store gives 400 and changes nothing. *Test: Task 2, `finish_mixed_rejects_foreign_ids`.*
4. **Archived staples are invisible** in lists, pickers, matching and search, and their names still give a helpful 409. *Tests: Task 1, `archived_hidden_and_name_conflict_names_it`. Task 3, `proposals_skip_archived`.*
5. **The keyboard never hides the active field, and sheets never autofocus.** *Check: browser steps in Tasks 4 and 6, at 375×812, with a simulated visualViewport shrink.*

---

### Task 1: Migration v2, sizes, archive and emoji (server)
**Files:** `src/db.ts`, `src/routes/items.ts`, new `src/routes/sizes.ts`, `src/server.ts`, `tests/db.test.ts`, `tests/items.test.ts`, new `tests/sizes.test.ts`, `DEPLOY.md` (one line)
**Interfaces:**
- **Migration v2:**
  - `sizes` table (per the spec).
  - `oneoffs` table.
  - `items` gains `emoji`, `archived_at`, `list_size_id` and `list_amount`.
  - Existing items are backfilled into sizes, and store colours are remapped.
  - `STORE_COLORS` is updated, with default `tomato`.
- **Items:**
  - `toItem` returns the spec's item JSON, with `sizes` sorted default-first.
  - `GET /api/items?archived=1`.
  - `POST /api/items { …, sizes? }`.
  - PATCH accepts `emoji`, `archived`, `onList`, `listSizeId` and `listAmount`, with Ruling 10's lifecycle and Ruling 11's archived-name 409.
- **Sizes:** `src/routes/sizes.ts` mounts `POST /api/items/:id/sizes`, `PATCH /api/sizes/:id` and `DELETE /api/sizes/:id`, applying Rulings 7, 8 and 10.

- [ ] **Step 1: Write the failing tests:**
  - `fresh_database_is_version_2`
  - `migrates_v1_to_v2_sizes_and_colours`: a v1 temp database with priced, on-list and receipt-linked items and fig/harbor stores.
  - `create_item_default_size`
  - `create_item_with_sizes`
  - `patch_list_size_must_belong`
  - `list_amount_resets_on_remove_and_size_change`
  - `emoji_length_limit`
  - `archive_takes_off_list_and_hides`
  - `archived_hidden_and_name_conflict_names_it`
  - `size_crud_and_default_promotion`
  - `cannot_delete_last_size_409`
  - `soldby_change_clears_price`
  - `manual_size_price_sets_source`
  - `delete_list_size_moves_list_to_default`
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Update the existing tests that read the old item price fields.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: sizes, archive and emoji (migration v2)`.

### Task 2: One-offs, list lines and Finish (server)
**Files:** new `src/routes/oneoffs.ts`, `src/routes/list.ts`, `src/lib/list.ts`, `src/server.ts`, tests: new `tests/oneoffs.test.ts`, `tests/list.test.ts`, `tests/list-route.test.ts`
**Interfaces:**
- **One-off routes**, as in the spec. The name is required, the price is ≥0 or null, and the amount is >0.
- **`buildList`** takes staple and one-off inputs and returns the spec's line shape. The envelope stays the same (Ruling 13), and archived staples are excluded.
- **Finish:** `{ itemIds, oneOffIds }`, all-or-nothing, as in the spec.

- [ ] **Step 1: Write the failing tests:**
  - `oneoff_crud`
  - `list_includes_oneoffs_and_staple_sizes`
  - `weight_line_cents_rounds`
  - `unpriced_oneoff_in_unpriced`
  - `finish_deletes_ticked_oneoffs_and_offlists_staples`
  - `finish_mixed_rejects_foreign_ids`
  - `archived_not_on_list`
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: one-offs and size-aware list`.

### Task 3: Receipts by size, categories, aisles and version (server)
**Files:** `src/routes/receipts.ts`, `src/lib/match.ts`, `src/routes/categories.ts`, `src/routes/stores.ts`, `src/server.ts`, tests: `tests/receipts.test.ts`, `tests/match.test.ts`, `tests/categories.test.ts`, `tests/stores.test.ts`, `tests/server.test.ts`
**Interfaces:**
- **Receipt upload:** each proposal adds `proposedSizeId`, and archived items are skipped.
- **Confirm:** `{ lineId, itemId, sizeId, weightLb? }`, priced as the spec says. The size must belong to the item, otherwise 400.
- **Categories, aisles and version:** as in Ruling 15.

- [ ] **Step 1: Write the failing tests:**
  - `confirm_each_sets_size_price`
  - `weight_match_divides`
  - `weight_match_without_weight_keeps_price`
  - `confirm_size_must_belong_400`
  - `proposals_skip_archived`
  - `proposal_has_default_size`
  - `rename_category` / `_duplicate_409`
  - `delete_category_in_use_409`
  - `categories_include_counts`
  - `list_store_aisles`
  - `rename_aisle_merges_and_scoped`
  - `health_reports_version`
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: size-aware receipts, category and aisle management`.

### Task 4: Client logic, navigation shell, sheets and keyboard
**Files:**
- New: `public/lib/sizes.js`, `public/lib/receipt-name.js`, `public/ui/thumb.js`
- Modify: `public/lib/trip.js`, `public/lib/list-groups.js`, `public/lib/pantry-view.js`, `public/ui/sheet.js`, `public/ui/tabbar.js`, `public/app.js`, `public/index.html`, `public/api.js`, `public/tokens.css`, `public/app.css`, `public/sw.js`
- Remove: `public/views/settings.js`
- Tests: new `tests/client-sizes.test.ts`, `tests/client-receipt-name.test.ts`; update `tests/client-trip.test.ts`, `tests/client-groups.test.ts`, `tests/client-pantry.test.ts`
**Interfaces:**
- `sizes.js`:
  - `sizeSummary(item): string`, giving the Pantry detail-line text from the spec.
  - `lineDetail(line): string`, giving "1 × $6.49" or "About 3 lb × $2.49/lb".
  - `pickDefaultSize(item): Size`, following Ruling 5.
- `receipt-name.js`: `guessName(raw): string`, following Ruling 4.
- `trip.js`: keys become strings, `s:<id>` and `o:<id>`. Old numeric ticks are dropped once.
- `thumb(item, px)`: photo, then emoji, then initial.
- **App shell:**
  - Two-tab glass bar with the List badge, following Ruling 2.
  - Icon-only Receipt FAB on the Pantry.
  - `#/receipt` as a full-screen route with a back link.
  - A cog icon on the title line, via a shared `titleRow(title, onSettings)` helper.
  - The `#/settings` route removed.
  - New store colour tokens.
- **`openSheet`:** no input autofocus (it focuses the container), plus visualViewport keyboard avoidance as in the spec.

- [ ] **Step 1: Write the failing tests:**
  - `sizeSummary_cases`
  - `lineDetail_each_and_weight`
  - `pickDefaultSize_prefers_last_then_default`
  - `guessName_strips_counts_sizes_price`, run on the owner's real receipt lines from the spec mockup
  - `trip_string_keys_and_legacy_drop`
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Views that break from the shape change may show the existing error state until Tasks 5–7.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Check in the browser:**
  - Two tabs with the badge.
  - The Receipt FAB on the Pantry only.
  - The cog sits on the title line with no fill.
  - A sheet with a text field opens with no keyboard.
  - With the viewport shrunk to simulate the keyboard (`window.visualViewport` in devtools, or resizing the emulated height), the focused field stays visible.
- [ ] **Step 6: Commit** `feat: two-tab shell, receipt button, title cog, keyboard-safe sheets`.

### Task 5: Pantry, staple sheet and Pantry settings
**Files:**
- Modify: `public/views/pantry.js`, `public/views/staple-sheet.js`, `public/views/store-sheet.js`, `public/app.css`, `public/sw.js`
- New: `public/views/size-sheet.js`, `public/views/size-picker.js`, `public/ui/emoji-sheet.js`, `public/views/pantry-settings.js`, `public/views/category-sheet.js`, `public/views/aisle-sheet.js`, `public/views/archived-sheet.js`
**Interfaces:**
- Pantry rows use `thumb()` and `sizeSummary()`. The "View list" line is removed. The basket opens the size picker when a staple has more than one size.
- The staple sheet has the picture menu (photo or emoji), a Sizes section saved on Save (Ruling 9), "Archive staple", and the archived-name 409 with **Restore it**.
- The Pantry settings sheet has the Stores, Organise (Categories, Aisles, Archived) and About sections from the spec, each with its empty states.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Check in the browser:**
  - Add a second size and set it as default.
  - The basket opens the picker with the right size preselected.
  - Set and remove an emoji.
  - Archive, then restore from settings.
  - Rename and delete a category (delete is blocked while in use).
  - Rename an aisle.
  - About shows the version.
- [ ] **Step 4: Commit** `feat: sizes, emoji, archive and pantry settings`.

### Task 6: Shopping List with one-offs and List settings
**Files:**
- Modify: `public/views/list.js`, `public/views/finish-sheet.js`, `public/app.css`, `public/sw.js`
- New: `public/views/line-sheet.js`, `public/views/list-settings.js`
**Interfaces:**
- **List:**
  - The title is "Shopping List", with no photos on rows.
  - Size tags and `lineDetail()` on every row.
  - One-off tag and inline price box (decimal input, saved on blur or Enter).
  - "+ Add an item" shows staple suggestions and otherwise creates a one-off.
- Tapping a row opens the line sheet (staple or one-off variant).
- **Finish** sends `oneOffIds`.
- **List settings sheet**, following Ruling 1.
- The badge refreshes on tick and untick.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Check in the browser:**
  - Add a one-off and price it on the number pad: the total updates.
  - A staple suggestion appears while typing.
  - Switch a size from the line sheet: the line total changes.
  - A by-weight item reads "About 3 lb × $2.49/lb".
  - Finish removes the ticked one-off and keeps the unticked one.
  - "Clear unbought one-offs" works.
  - Inline inputs stay above the simulated keyboard.
- [ ] **Step 4: Commit** `feat: shopping list one-offs, line sheet and list settings`.

### Task 7: Receipt screen
**Files:** `public/views/receipt.js`, `public/app.css`, `public/sw.js`, new `public/views/new-staple-sheet.js`
**Interfaces:**
- **Layout** as in the spec: grouped cards, a two-line mono clamp, the price inside the card, text-button actions, and a sticky save bar with bottom padding.
- **Pick item** then asks for a size, and a by-weight size shows a weight field.
- **New staple** is held locally and created on Save (Ruling 12), with the name from `guessName()`.
- Confirm sends `sizeId` and `weightLb`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Check in the browser** with `FAKE_OCR` and a text file of the owner's receipt lines from the screenshot:
  - No horizontal overflow.
  - The last line isn't hidden by the save bar.
  - A new staple is created only on Save, and Undo leaves nothing behind.
  - A weight match without a weight keeps the price.
- [ ] **Step 4: Commit** `feat: receipt layout, sizes and new staples`.

### Task 8: Browser checks, docs and final pass
**Files:** `tests/e2e/run.py`, `DEPLOY.md`, `scripts/seed-demo.mjs`
- [ ] **Step 1: Update the seed** with multi-size and by-weight staples, one-offs and an archived staple.
- [ ] **Step 2: Update `run.py`** to the new selectors. Python isn't installed here, so check it by reading.
- [ ] **Step 3: Do a full browser pass** at 375×812 comparing every screen with the mockup and spec. Save screenshots, fix small CSS differences, and list larger ones in the report.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `test: browser checks and docs for sizes and one-offs`.
