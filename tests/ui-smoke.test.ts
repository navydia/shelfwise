import { describe, it, expect } from 'vitest';
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
    for (const f of ['/app.js', '/app.css', '/api.js', '/views/review.js']) {
      expect((await api.get(f)).status, f).toBe(200);
    }
  });
  it('list_view_module_served', async () => {
    expect((await makeApp().api.get('/views/list.js')).status).toBe(200);
  });
});
