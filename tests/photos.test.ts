import { describe, it, expect, afterEach } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveItemPhoto } from '../src/lib/photos';
import { makeApp } from './helpers/app';

const dirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#c33' } }).png().toBuffer();

describe('photos', () => {
  it('resizes_to_max_1024', async () => {
    const dir = tmp();
    const name = await saveItemPhoto(dir, await png(3000, 2000));
    const meta = await sharp(path.join(dir, 'photos', name)).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(683);
    expect(meta.format).toBe('jpeg');
  });
  it('does_not_enlarge_small_images', async () => {
    const dir = tmp();
    const name = await saveItemPhoto(dir, await png(200, 100));
    const meta = await sharp(path.join(dir, 'photos', name)).metadata();
    expect(meta.width).toBe(200);
  });
  it('upload_sets_item_photo', async () => {
    const dir = tmp();
    const { api } = makeApp({ dataDir: dir });
    const store = (await api.post('/api/stores').send({ name: 'S' })).body;
    const item = (await api.post('/api/items').send({ name: 'Rice', storeId: store.id })).body;
    const res = await api.post(`/api/items/${item.id}/photo`).attach('photo', await png(500, 500), 'a.png');
    expect(res.status).toBe(200);
    expect(res.body.photo).toMatch(/\.jpg$/);
  });
  it('non_image_returns_400', async () => {
    const dir = tmp();
    const { api } = makeApp({ dataDir: dir });
    const store = (await api.post('/api/stores').send({ name: 'S' })).body;
    const item = (await api.post('/api/items').send({ name: 'Rice', storeId: store.id })).body;
    const res = await api.post(`/api/items/${item.id}/photo`).attach('photo', Buffer.from('not an image'), 'a.txt');
    expect(res.status).toBe(400);
  });
  it('photo_is_served', async () => {
    const dir = tmp();
    const { api } = makeApp({ dataDir: dir });
    const store = (await api.post('/api/stores').send({ name: 'S' })).body;
    const item = (await api.post('/api/items').send({ name: 'Rice', storeId: store.id })).body;
    const up = await api.post(`/api/items/${item.id}/photo`).attach('photo', await png(300, 300), 'a.png');
    const res = await api.get(`/photos/${up.body.photo}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
  });
});
