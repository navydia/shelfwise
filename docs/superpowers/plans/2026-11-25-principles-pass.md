# Shelfwise Principles Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved design-principles pass: Figtree everywhere, sentence case, soft depth, grouped cards, one focal point per screen, and an empty state with a call to action on every screen.

**Architecture:**
- The screens are restyled in place in the existing vanilla ES modules.
- Two new shared UI helpers: an empty-state component and skeleton rows.
- One new pure-logic module that decides which empty state to show and what it says, so that logic is unit-tested.
- No server or API changes.

**Tech Stack:** vanilla JS/CSS PWA (`public/`), vitest, self-hosted fonts from `@fontsource/figtree`.

**Spec:** `docs/superpowers/specs/2026-11-25-principles-pass-design.md`. Mockup: `docs/superpowers/specs/2026-11-25-principles-mockups.html`. The earlier `docs/superpowers/specs/2026-11-23-redesign-design.md` still governs anything this spec doesn't change. Read the spec before any task. It holds every string and size this plan refers to.

## Global Constraints

- Presentation only. Server routes, data, ticks, trips and Finish shopping behave exactly as now. The common-staple chips use the existing `createItem`.
- **Fonts:**
  - Figtree 400/600/700/800 for all UI text.
  - Bricolage Grotesque only for the wordmark and the big budget figure.
  - IBM Plex Mono only for raw receipt lines.
  - No system font.
  - Fonts are self-hosted in `public/fonts/` and listed in the `sw.js` SHELL.
- **No `text-transform: uppercase`** anywhere in `public/`. All UI copy is in sentence case.
- **Colours and contrast:**
  - Only existing tokens in `public/tokens.css`. New shadow tokens may be added, built from Fig 950 at low alpha and white highlights.
  - Text must be at least 4.5:1 and controls at least 3:1.
- **Empty states:**
  - Every one uses the shared empty-state component.
  - Every one has exactly one primary button, in Fig 950 with Butter text.
  - The exact copy comes from the spec's table.
- **Offline cache:** every file added or removed under `public/` is reflected in `sw.js` SHELL, and `VERSION` is bumped in each task that changes shell files.
- **Commits:** on branch `redesign` with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not change git config. **Do not push.**
- **Tests:** `npm test` and `npx tsc --noEmit` stay green at every commit.
- **Browser checks:** use a dev server like `SHELFWISE_DATA=<scratch>/x PORT=31xx npx tsx tests/e2e/serve.ts` plus `node scripts/seed-demo.mjs <url>`, at 375×812. Stop servers afterwards.

## Review Focus

1. **Common staples already in the pantry.** A chip must not appear for a name the picked store already has, compared case-insensitively. Tapping a chip twice quickly must not create a duplicate, because the server returns 409. *Test: Task 1, `remainingCommonStaples_hides_existing_case_insensitive`. Task 2 disables a chip while its request is pending.*
2. **List state edges.**
   - Nothing to get and nothing ticked gives the "empty" state, with the budget tag hidden.
   - Nothing to get but some ticked gives "allTicked", with Finish shopping as the main button.
   - Unpriced items count as "to get".

   *Test: Task 1, `listState_cases`.*
3. **Search versus filters.** When both a search query and filters are active and nothing matches, the search message wins ("No “x” yet"), because it offers the add. *Test: Task 1, `pantryEmptyKind_search_beats_filters`.*
4. **Uppercase creeping back.** A smoke test fails if any `public/**/*.css` contains `uppercase`. *Test: Task 1, `no_uppercase_text_transform`.*
5. **Loading never blank, and errors not hidden behind a skeleton.** If the first request fails, the existing error toast or offline message must replace the skeleton. *Check: browser steps in Tasks 2 and 3, with the server stopped.*

---

### Task 1: Foundation: fonts, depth tokens, sentence case, shared empty state, screen-state logic

**Files:**
- Create:
  - `public/ui/empty-state.js`
  - `public/ui/skeleton.js`
  - `public/lib/screen-states.js`
  - `tests/client-states.test.ts`
  - `public/fonts/figtree-400.woff2`, `figtree-600.woff2`, `figtree-700.woff2`
- Modify:
  - `public/tokens.css` (`@font-face` for the three new weights; `--font-body` and `--font-disp` become Figtree; add `--lift-1`, `--lift-2`, `--lift-btn` shadow tokens)
  - `public/app.css` (remove every uppercase rule; base `.card`, `.btn-main`, `.btn-soft`, pill and search shadows use the lift tokens; body line-height 1.5 for wrapping text)
  - `scripts/copy-fonts.mjs`
  - `public/sw.js`
  - `tests/ui-smoke.test.ts`
  - Every view with uppercase copy or uppercase-looking labels, so labels read in sentence case. This includes the budget tag labels, sheet field labels, and the receipt "Needs a look" / "Matched" headers.

**Interfaces:**
- `empty-state.js`: `emptyState({ icon: string, title: string, body?: string | Node, primary: { label: string, icon?: string, onClick: () => void }, secondary?: { label: string, onClick: () => void }, extra?: Node }): HTMLElement`
  - It produces the spec's pattern: a 68px soft circle around `icon(icon)`, a title in Figtree 800 at 21px, the body in Stone at 15px with 1.5 line-height, a full-width primary button, an optional Fig text link, then `extra`.
  - All text is set via `textContent` (`body` may be a Node).
- `skeleton.js`: `skeletonRows(count = 4): HTMLElement`. A card of rows, each with a 40px block and two bars. It shimmers unless `prefers-reduced-motion`, and has `aria-busy="true"` with the label "Loading".
- `screen-states.js`:
  - `COMMON_STAPLES = ['Milk','Eggs','Bread','Butter','Bananas']`
  - `remainingCommonStaples(itemsInStore: {name:string}[]): string[]`: the common staples not already present, compared trimmed and case-insensitively.
  - `listState(toGetCount: number, inCartCount: number): 'empty' | 'allTicked' | 'normal'`
  - `pantryEmptyKind({ totalInScope, shown, query, activeFilters }): 'noStaples' | 'noSearchMatch' | 'noFilterMatch' | null`
    - `noStaples` when `totalInScope === 0`.
    - Otherwise, when `shown === 0`: `noSearchMatch` if `query.trim()`, else `noFilterMatch`.
    - `null` otherwise.
  - `describeFilters(opts, categories): string`: a sentence such as "No staples on your list in Frozen." or "No staples without a photo.", built from `show`, `categoryId` and `noPhoto`.
  - `listMeta(toGet, inCart): string`: "4 to get", or "4 to get · 2 in the cart".

- [ ] **Step 1: Write the failing tests.** `tests/client-states.test.ts` covers:
  - `remainingCommonStaples_hides_existing_case_insensitive`: with `[{name:' milk '},{name:'EGGS'}]`, the result is `['Bread','Butter','Bananas']`.
  - `listState_cases`: `(0,0)` → `empty`; `(0,3)` → `allTicked`; `(2,0)` → `normal`; `(2,3)` → `normal`.
  - `pantryEmptyKind_search_beats_filters`: with query `'oat'`, `shown` 0 and `activeFilters` 2, the result is `noSearchMatch`. Also cover `noStaples`, `noFilterMatch` and `null`.
  - `describeFilters_sentences`: the on-list + category case, the no-photo case, and the combined case.
  - `listMeta_formats`: `(4,0)` → `'4 to get'`; `(4,2)` → `'4 to get · 2 in the cart'`; `(1,1)` → `'1 to get · 1 in the cart'`.

  In `tests/ui-smoke.test.ts`, add `no_uppercase_text_transform`: no file under `public/` matching `*.css` contains `uppercase`.
- [ ] **Step 2: Run** `npx vitest run tests/client-states.test.ts tests/ui-smoke.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Copy the Figtree weights with `copy-fonts.mjs`, then update the tokens, CSS, modules and sentence-case copy, and bump the `sw.js` SHELL and `VERSION`.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Check in the browser:**
  - All text renders in Figtree, apart from the wordmark and the budget figure.
  - No all-caps text on any screen.
  - Cards and buttons show the soft lift.
- [ ] **Step 6: Commit** `feat: Figtree everywhere, sentence case, soft depth, shared empty state`.

---

### Task 2: Pantry restyle and Pantry empty states

**Files:**
- Modify: `public/views/pantry.js`, `public/views/filter-sheet.js` (only if needed for "Change filters"), `public/app.css`, `public/sw.js` (if VERSION changes)

**Interfaces:**
- Consumes from Task 1: `emptyState`, `skeletonRows`, `pantryEmptyKind`, `describeFilters`, `remainingCommonStaples`, `COMMON_STAPLES`. Also the existing `pantryView`, `pantryHooks.openStapleSheet(item|null, { name? })`, `api.createItem` and `openFilterSheet`.
  - `openStapleSheet` must accept a prefilled name for New mode. Add an optional `{ name }` to its options in `public/views/staple-sheet.js` and update its single caller.
- The look and behaviour follow the spec's **Pantry** section exactly:
  - store header: dot, name, count, chevron (folding kept)
  - one `.grp` card per store, with hairline dividers
  - the "N staples on your list · View list" line
  - filter inside the search field, and the dark **+**
  - rows: price only, "On your list" in Fig 2
  - basket off/on states, and no Butter row edge
- Empty states via `emptyState`, with the spec's table copy, decided by `pantryEmptyKind`:
  - **No staples:** chips from `remainingCommonStaples`. Each chip creates the staple, is disabled while pending, and on success re-renders. On failure it toasts and re-enables.
  - **No search match:** opens the New staple sheet with the name filled in. "Clear search" empties the field.
  - **No filter match:** **Clear filters** resets the filters. "Change filters" opens the filter sheet.
- Loading: show `skeletonRows()` until the first data arrives. On error, replace it with the existing error handling.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Check in the browser** with seeded data plus a fresh store with no staples:
  - All three empty states and their buttons work.
  - A chip creates the staple and then disappears.
  - "View list" opens the List.
  - The skeleton shows on a slow load (use the DELAY_FLAG in `serve.ts`).
  - With the server stopped, the error or offline message replaces the skeleton.
  - A long name still truncates.
- [ ] **Step 4: Commit** `feat: pantry grouped cards, quieter controls and empty states`.

---

### Task 3: List restyle and List empty states

**Files:**
- Modify: `public/views/list.js`, `public/views/budget-sheet.js` (labels only), `public/app.css`, `public/sw.js` (if VERSION changes)

**Interfaces:**
- Consumes from Task 1: `emptyState`, `skeletonRows`, `listState`, `listMeta`. Also the existing `groupList`, `budgetTag`, `openFinishSheet` / `finishForStore`, and `trips`.
- The look follows the spec's **List** section:
  - the tag keeps Bricolage and gets sentence-case labels
  - the meta line uses `listMeta`, plus a Fig "By aisle ▾" link
  - group headers in Figtree 700 at 15px, with the count
  - one `.grp` card per group
  - row prices in Figtree 600 at 16px with tabular figures
  - 26px circle ticks
  - the top add form is removed, and a "+ Add an item" row sits last, expanding to an inline field with Add and Cancel and today's add logic
- `listState(toGet, inCart)`:
  - `empty`: hide the budget tag and the meta line, then show the spec's "Nothing to buy here" state. **Check your pantry** navigates to `#/pantry`. "Add an item" opens the inline field.
  - `allTicked`: keep the tag, show "Everything's in the cart" with the count and the estimated total. **Finish shopping** opens the finish sheet for this store. The "In the cart" group stays below it.
  - `normal`: the grouped list.
- The Finish pill and forgotten-trip cards are unchanged.
- Loading: skeleton until the first data arrives. On error, replace it with the error handling.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Check in the browser:**
  - The empty list hides the tag and **Check your pantry** works.
  - Ticking everything shows the all-ticked state, its Finish shopping works, and unticking returns to normal.
  - The inline add creates and lists an item.
  - Grouping by aisle and by category both still work.
  - The skeleton shows on a slow load, and the error replaces it.
- [ ] **Step 4: Commit** `feat: list single focal point, add-item row and empty states`.

---

### Task 4: First run, Receipt, Settings, and a final pass

**Files:**
- Modify: `public/app.js` (first run), `public/views/receipt.js`, `public/views/settings.js`, `public/app.css`, `public/sw.js`, `tests/e2e/run.py` (selectors only, if any changed in Tasks 2–4)

**Interfaces:**
- **First run:**
  - The spec's three numbered steps.
  - A "Where do you shop most?" field.
  - **Get started**, which creates the main store, with today's validation and errors.
  - The tab bar and store pill stay hidden until a store exists.
- **Receipt, before upload:** `emptyState` with **Take a photo** (a file input with `accept="image/*"` and `capture="environment"`) and "Choose from photos" (a file input without `capture`). Both feed the existing upload flow, and the rest of the Receipt flow is unchanged.
- **Settings:** `emptyState` with **Manage stores**, which opens the existing store menu (`mountStorePicker` / the header pill's menu). Reuse it rather than duplicating it.
- **Receipt loading:** a skeleton while the staples load.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Do a full browser pass** at 375×812, comparing every screen and empty state with the mockup:
  - first run
  - Pantry (normal plus 3 empty states)
  - List (normal, empty, all ticked)
  - Receipt
  - Settings

  Fix small visual differences in CSS and list the rest in the report.
- [ ] **Step 4: Commit** `feat: first run, receipt and settings empty states`.
