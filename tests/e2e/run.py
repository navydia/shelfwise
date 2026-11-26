"""Browser checks for the phone UI. Usage: python3 tests/e2e/run.py <baseUrl> <delayFlagPath> [name...]
Needs a server from tests/e2e/serve.ts (fresh data dir) and Playwright for Python."""
import json, sys, time, os, urllib.request
from playwright.sync_api import sync_playwright

BASE, FLAG = sys.argv[1], sys.argv[2]
ONLY = sys.argv[3:]

def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        t = r.read(); return json.loads(t) if t else None

def items(s, archived=False):
    return api('GET', f"/api/items?storeId={s['id']}" + ('&archived=1' if archived else ''))

def milk(s):
    return [i for i in items(s) if i['name'] in ('Milk', 'Whole milk')][0]

def seed():
    s = api('POST', '/api/stores', {'name': 'Main', 'isMain': True})
    # One size, $4.00, on the list. The single-price body still creates one default (Standard) size.
    api('POST', '/api/items', {'name': 'Milk', 'storeId': s['id'], 'lastPriceCents': 400, 'onList': True})
    return s

def reset(s):
    """Known state before every check: only Milk, one Standard size at $4.00, on the list; no one-offs."""
    m = milk(s)
    for it in items(s) + items(s, archived=True):
        if it['id'] != m['id']: api('DELETE', f"/api/items/{it['id']}")
    for o in api('GET', f"/api/stores/{s['id']}/oneoffs"): api('DELETE', f"/api/oneoffs/{o['id']}")
    api('PATCH', f"/api/items/{m['id']}", {'name': 'Milk', 'onList': False})  # leaving the list forgets the amount
    api('PATCH', f"/api/items/{m['id']}", {'onList': True})
    api('PATCH', f"/api/sizes/{m['sizes'][0]['id']}", {'lastPriceCents': 400, 'usualAmount': 1})

def phone(b):
    ctx = b.new_context(viewport={'width': 375, 'height': 812}); return ctx, ctx.new_page()

def first_launch_offline(b, s):
    ctx, pg = phone(b)
    pg.goto(BASE + '/'); pg.wait_for_selector('.row .nm'); pg.wait_for_timeout(2500)
    ctx.set_offline(True); pg.reload()
    pg.wait_for_selector('.row .nm, #first', timeout=8000)
    ok = pg.locator('#first').count() == 0 and pg.locator('.row .nm').count() > 0
    ctx.close(); return ok, 'offline after first launch shows saved items, not the first-run form'

def two_tabs_badge_and_receipt_button(b, s):
    ctx, pg = phone(b)
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row .nm')
    pg.wait_for_function("document.querySelector('nav .badge') && !document.querySelector('nav .badge').hidden")
    tabs = pg.locator('nav a[data-tab]').count()
    badge = pg.inner_text('nav .badge')
    on_pantry = pg.locator('#fab').is_visible()
    label = pg.get_attribute('#fab', 'aria-label')
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.lst .row'); pg.wait_for_timeout(300)
    on_list = pg.locator('#fab').is_visible()
    ctx.close()
    return tabs == 2 and badge == '1' and on_pantry and label == 'Scan a receipt' and not on_list, \
        'two tabs, a badge of 1 on List, and the round receipt button shows on the Pantry only'

def finish_shopping_via_ui(b, s):
    ctx, pg = phone(b)
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('[data-list]'); pg.wait_for_selector('.lst .row .tick')
    pg.click('.row .tick')
    # One finish action at a time: the dock pill while items are left to get, the empty-state button once everything is in the cart.
    finish = pg.locator('.finish-pill, .empty-state .es-primary:has-text("Finish shopping")').first
    finish.wait_for(); finish.click()
    pg.wait_for_selector('.sheet .btn-main:has-text("Finish shopping")', timeout=3000)
    pg.click('.sheet .btn-main:has-text("Finish shopping")'); pg.wait_for_timeout(800)
    pg.goto(BASE + '/#/list'); pg.reload()
    # An empty List hides the budget tag, so wait for the List content itself.
    pg.wait_for_selector('.lst .row, .lst .empty-state')
    ok = (pg.locator('.row:has-text("Milk")').count() == 0 and pg.locator('.finish-pill').count() == 0
          and pg.locator('.empty-state .es-title:has-text("Nothing to buy here")').count() == 1)
    ctx.close(); return ok, 'tick Milk, Finish shopping, and the List shows "Nothing to buy here"'

def pantry_toggle_on_list(b, s):
    ctx, pg = phone(b)
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row .onlist-btn')
    btn = pg.locator('.row:has-text("Milk") .onlist-btn')
    before = btn.get_attribute('aria-pressed')
    btn.click(); pg.wait_for_timeout(500)
    after = btn.get_attribute('aria-pressed')
    ctx.close(); return before != after, 'the basket button on a one-size Pantry row adds and removes it from the list'

def edit_item_and_line_total(b, s):
    ctx, pg = phone(b)
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row .row-main')
    pg.click('.row .row-main')
    pg.wait_for_selector('.sheet input[name=name]', timeout=3000)
    pg.fill('.sheet input[name=name]', 'Whole milk')
    pg.click('.sheet .btn-main:has-text("Save")'); pg.wait_for_timeout(600)
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.lst .row')
    pg.click('.lst .row-main:has-text("Whole milk")')
    pg.wait_for_selector('.sheet button[aria-label="One more"]', timeout=3000)
    pg.click('.sheet button[aria-label="One more"]'); pg.click('.sheet button[aria-label="One more"]')
    pg.click('.sheet .btn-main:has-text("Done")'); pg.wait_for_timeout(600)
    txt = pg.inner_text('#view')
    ctx.close(); return '$12.00' in txt and '3 × $4.00' in txt, 'rename shows on the list, and quantity 3 in the line sheet gives 3 × $4.00 = $12.00'

def delete_item(b, s):
    ctx, pg = phone(b)
    api('POST', '/api/items', {'name': 'Bananaz', 'storeId': s['id']})
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row .row-main')
    pg.click('.row:has-text("Bananaz") .row-main'); pg.wait_for_selector('.sheet button:has-text("Delete staple")', timeout=3000)
    pg.click('.sheet button:has-text("Delete staple")'); pg.click('.sheet button:has-text("Tap again to delete")')
    pg.wait_for_timeout(800)
    ok = pg.locator('.row:has-text("Bananaz")').count() == 0
    ctx.close(); return ok, 'a mistyped staple can be deleted from the app'

def archive_and_restore(b, s):
    ctx, pg = phone(b)
    api('POST', '/api/items', {'name': 'Old cereal', 'storeId': s['id']})
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row:has-text("Old cereal")')
    pg.click('.row:has-text("Old cereal") .row-main'); pg.wait_for_selector('.sheet button:has-text("Archive staple")', timeout=3000)
    pg.click('.sheet button:has-text("Archive staple")'); pg.wait_for_timeout(800)
    gone = pg.locator('.row:has-text("Old cereal")').count() == 0
    pg.click('button.cog'); pg.wait_for_selector('.sheet:has-text("Pantry settings")', timeout=3000)
    pg.click('.sheet :text("Archived staples")'); pg.wait_for_selector('.sheet button[aria-label="Restore Old cereal"]', timeout=3000)
    pg.click('.sheet button[aria-label="Restore Old cereal"]'); pg.wait_for_timeout(800)
    ctx.close()
    back = [i for i in items(s) if i['name'] == 'Old cereal']
    return gone and len(back) == 1, 'Archive hides a staple from the Pantry, and Restore in Pantry settings brings it back'

def size_picker_for_multi_size(b, s):
    ctx, pg = phone(b)
    y = api('POST', '/api/items', {'name': 'Yogurt', 'storeId': s['id'], 'sizes': [
        {'name': '6-pack', 'lastPriceCents': 599, 'isDefault': True}, {'name': '4-pack', 'lastPriceCents': 449}]})
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row:has-text("Yogurt")')
    pg.click('.row:has-text("Yogurt") .onlist-btn')
    pg.wait_for_selector('.sheet:has-text("Which size this time?")', timeout=3000)
    pg.click('.sheet .opt:has-text("4-pack")'); pg.click('.sheet .btn-main:has-text("Add 4-pack to list")'); pg.wait_for_timeout(800)
    got = [i for i in items(s) if i['id'] == y['id']][0]
    chosen = next((z['name'] for z in got['sizes'] if z['id'] == got['listSizeId']), None)
    ctx.close(); return got['onList'] and chosen == '4-pack', 'the basket on a multi-size staple asks which size, and the list gets the chosen one'

def oneoff_price_and_finish(b, s):
    ctx, pg = phone(b)
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.lst .row')
    pg.click('.addrow'); pg.fill('input[aria-label="Add item to list"]', 'Gift tape'); pg.keyboard.press('Enter')
    pg.wait_for_selector('.row:has-text("Gift tape") .oneoff', timeout=3000)
    pg.fill('input[aria-label="Price for Gift tape"]', '2.50'); pg.keyboard.press('Enter'); pg.wait_for_timeout(800)
    priced = '$2.50' in pg.inner_text('.row:has-text("Gift tape")')
    pg.click('.row:has-text("Gift tape") .tick')
    pg.click('.finish-pill'); pg.wait_for_selector('.sheet:has-text("One-offs, removed from the list")', timeout=3000)
    pg.click('.sheet .btn-main:has-text("Finish shopping")'); pg.wait_for_timeout(800)
    left = api('GET', f"/api/stores/{s['id']}/oneoffs")
    ctx.close(); return priced and left == [], 'a one-off is added, priced in the price box, ticked, and deleted by Finish shopping'

def settings_cogs(b, s):
    ctx, pg = phone(b)
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('button.cog')
    pg.click('button.cog'); pg.wait_for_selector('.sheet:has-text("Pantry settings")', timeout=3000)
    a = pg.locator('.sheet:has-text("Categories")').count() == 1 and pg.locator('.sheet:has-text("Archived staples")').count() == 1
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('button.cog')
    pg.click('button.cog'); pg.wait_for_selector('.sheet:has-text("List settings")', timeout=3000)
    c = pg.locator('.sheet:has-text("Clear unbought one-offs")').count() == 1
    ctx.close(); return a and c, 'each screen has its own cog: Pantry settings (organise) and List settings (one-offs)'

def slow_network_falls_back(b, s):
    if os.path.exists(FLAG): os.remove(FLAG)
    ctx, pg = phone(b)
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.lst .row'); pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_selector('.lst .row'); pg.wait_for_timeout(1500)
    open(FLAG, 'w').close()
    t = time.time(); pg.reload(); pg.wait_for_selector('.lst .row', timeout=14000)
    dt = time.time() - t; os.remove(FLAG)
    ctx.close(); return dt < 8, f'saved list shown within 8s when the server stalls (took {dt:.1f}s)'

CHECKS = [first_launch_offline, two_tabs_badge_and_receipt_button, finish_shopping_via_ui, pantry_toggle_on_list, edit_item_and_line_total,
          delete_item, archive_and_restore, size_picker_for_multi_size, oneoff_price_and_finish, settings_cogs, slow_network_falls_back]
if __name__ == '__main__':
    with sync_playwright() as p:
        b = p.chromium.launch(); failed = 0
        for fn in CHECKS:
            if ONLY and fn.__name__ not in ONLY: continue
            try:
                st = api('GET', '/api/stores')
                s = st[0] if st else seed()
                reset(s)
                ok, what = fn(b, s)
            except Exception as e:
                ok, what = False, f'{fn.__name__} raised {type(e).__name__}: {str(e).splitlines()[0][:90]}'
            print(('PASS ' if ok else 'FAIL ') + fn.__name__ + ': ' + what); failed += (not ok)
        b.close(); sys.exit(1 if failed else 0)
