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

def seed():
    s = api('POST', '/api/stores', {'name': 'Main', 'isMain': True})
    m = api('POST', '/api/items', {'name': 'Milk', 'storeId': s['id']})
    api('PATCH', f"/api/items/{m['id']}", {'onList': True, 'lastPriceCents': 400})
    return s, m

def first_launch_offline(b, s, m):
    ctx = b.new_context(viewport={'width': 390, 'height': 780}); pg = ctx.new_page()
    pg.goto(BASE + '/'); pg.wait_for_selector('.row .nm'); pg.wait_for_timeout(2500)
    ctx.set_offline(True); pg.reload()
    pg.wait_for_selector('.row .nm, #first', timeout=8000)
    ok = pg.locator('#first').count() == 0 and pg.locator('.row .nm').count() > 0
    ctx.close(); return ok, 'offline after first launch shows saved items, not the first-run form'

def unreachable_without_cache(b, s, m):
    ctx = b.new_context(viewport={'width': 390, 'height': 780}, service_workers='block'); pg = ctx.new_page()
    pg.goto(BASE + '/'); pg.wait_for_selector('.row .nm'); ctx.set_offline(True); pg.reload(); pg.wait_for_timeout(1500)
    ctx.close(); return True, 'n/a'

def finish_shopping_via_ui(b, s, m):
    ctx = b.new_context(viewport={'width': 390, 'height': 780}); pg = ctx.new_page()
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.budget-tag'); pg.wait_for_selector('.row .tick')
    pg.click('.row .tick'); pg.wait_for_selector('.finish-pill')
    pg.click('.finish-pill'); pg.wait_for_selector('.sheet .btn-main:has-text("Finish shopping")', timeout=3000)
    pg.click('.sheet .btn-main:has-text("Finish shopping")'); pg.wait_for_timeout(800)
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.budget-tag')
    ok = pg.locator('.row:has-text("Milk")').count() == 0 and pg.locator('.finish-pill').count() == 0
    ctx.close(); return ok, 'tick Milk, Finish shopping, and it is no longer on the list'

def pantry_toggle_on_list(b, s, m):
    ctx = b.new_context(viewport={'width': 390, 'height': 780}); pg = ctx.new_page()
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row .onlist-btn')
    btn = pg.locator('.row:has-text("Milk") .onlist-btn')
    before = btn.get_attribute('aria-pressed')
    btn.click(); pg.wait_for_timeout(500)
    after = btn.get_attribute('aria-pressed')
    ctx.close(); return before != after, 'the basket button on a Pantry row adds and removes it from the list'

def edit_item(b, s, m):
    ctx = b.new_context(viewport={'width': 390, 'height': 780}); pg = ctx.new_page()
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row .row-main')
    pg.click('.row .row-main')
    pg.wait_for_selector('.sheet input[name=name]', timeout=3000)
    pg.click('.sheet .inc'); pg.click('.sheet .inc'); pg.fill('.sheet input[name=name]', 'Whole milk')
    pg.click('.sheet button:has-text("Save")'); pg.wait_for_timeout(600)
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.budget-tag')
    txt = pg.inner_text('#view')
    ok = '$12.00' in txt and 'Whole milk' in txt
    ctx.close(); return ok, 'quantity 3 x $4.00 = $12.00 and rename shows on the list'

def delete_item(b, s, m):
    ctx = b.new_context(viewport={'width': 390, 'height': 780}); pg = ctx.new_page()
    api('POST', '/api/items', {'name': 'Bananaz', 'storeId': s['id']})
    pg.goto(BASE + '/#/pantry'); pg.wait_for_selector('.row .row-main')
    pg.click('.row:has-text("Bananaz") .row-main'); pg.wait_for_selector('.sheet button:has-text("Delete staple")', timeout=3000)
    pg.click('.sheet button:has-text("Delete staple")'); pg.click('.sheet button:has-text("Tap again to delete")')
    pg.wait_for_timeout(800)
    ok = pg.locator('.row:has-text("Bananaz")').count() == 0
    ctx.close(); return ok, 'a mistyped staple can be deleted from the app'

def slow_network_falls_back(b, s, m):
    if os.path.exists(FLAG): os.remove(FLAG)
    ctx = b.new_context(viewport={'width': 390, 'height': 780}); pg = ctx.new_page()
    pg.goto(BASE + '/#/list'); pg.wait_for_selector('.budget-tag'); pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_selector('.budget-tag'); pg.wait_for_timeout(1500)
    open(FLAG, 'w').close()
    t = time.time(); pg.reload(); pg.wait_for_selector('.budget-tag', timeout=14000)
    dt = time.time() - t; os.remove(FLAG)
    ctx.close(); return dt < 8, f'saved list shown within 8s when the server stalls (took {dt:.1f}s)'

CHECKS = [first_launch_offline, finish_shopping_via_ui, pantry_toggle_on_list, edit_item, delete_item, slow_network_falls_back]
if __name__ == '__main__':
    with sync_playwright() as p:
        b = p.chromium.launch(); failed = 0
        for fn in CHECKS:
            if ONLY and fn.__name__ not in ONLY: continue
            try:
                s, m = (None, None)
                st = api('GET', '/api/stores')
                s = st[0] if st else None
                if not s: s, m = seed()
                else: m = [i for i in api('GET', f"/api/items?storeId={s['id']}") if i['name'] in ('Milk', 'Whole milk')][0]
                # reset milk to a known state
                api('PATCH', f"/api/items/{m['id']}", {'onList': True, 'lastPriceCents': 400, 'usualQty': 1, 'name': 'Milk'})
                ok, what = fn(b, s, m)
            except Exception as e:
                ok, what = False, f'{fn.__name__} raised {type(e).__name__}: {str(e).splitlines()[0][:90]}'
            print(('PASS ' if ok else 'FAIL ') + fn.__name__ + ': ' + what); failed += (not ok)
        b.close(); sys.exit(1 if failed else 0)
