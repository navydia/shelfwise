import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { makeApp } from './helpers/app';

describe('ui smoke', () => {
  it('index_served', async () => {
    const res = await makeApp().api.get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Shelfwise');
    expect(res.text).toContain('rel="manifest"');
  });
  it('manifest_has_name_shelfwise_and_standalone_display', async () => {
    const res = await makeApp().api.get('/manifest.webmanifest');
    expect(res.status).toBe(200);
    const m = JSON.parse(res.text);
    expect(m.name).toBe('Shelfwise');
    expect(m.display).toBe('standalone');
  });
  it('static_assets_served', async () => {
    const { api } = makeApp();
    for (const f of ['/app.js', '/app.css', '/api.js', '/views/pantry.js']) {
      expect((await api.get(f)).status, f).toBe(200);
    }
  });
  it('list_view_module_served', async () => {
    expect((await makeApp().api.get('/views/list.js')).status).toBe(200);
  });
  it('receipt_view_module_served', async () => {
    expect((await makeApp().api.get('/views/receipt.js')).status).toBe(200);
  });
  it('service_worker_served_with_javascript_type', async () => {
    const res = await makeApp().api.get('/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });
  it('sw_precache_list_includes_all_view_modules', async () => {
    const sw = (await makeApp().api.get('/sw.js')).text;
    for (const dir of ['views', 'ui', 'lib', 'fonts']) {
      for (const f of fs.readdirSync(`public/${dir}`)) expect(sw, f).toContain(`/${dir}/${f}`);
    }
    for (const f of ['/', '/app.js', '/api.js', '/app.css', '/manifest.webmanifest']) expect(sw, f).toContain(`'${f}'`);
  });
  it('fonts_served_as_woff2', async () => {
    const res = await makeApp().api.get('/fonts/figtree-800.woff2');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe("font/woff2");
  });
  it('tokens_css_has_store_colours', async () => {
    const css = (await makeApp().api.get('/tokens.css')).text;
    for (const hex of ['#4A3242', '#5A2E36', '#553423', '#40402A', '#2D4334', '#22434A', '#2E3A55', '#3A3D45']) {
      expect(css.toUpperCase(), hex).toContain(hex);
    }
  });
  it('no_uppercase_text_transform', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    for (const f of walk('public').filter((f) => f.endsWith('.css'))) expect(fs.readFileSync(f, 'utf8'), f).not.toContain('uppercase');
  });
});
