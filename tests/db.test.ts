import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db';

const SEED_CATEGORIES = ['Produce', 'Dairy & eggs', 'Meat & fish', 'Bakery', 'Pasta & grains', 'Oils & condiments', 'Canned & jarred', 'Baking', 'Snacks', 'Frozen', 'Drinks', 'Household'];

// The v0 schema, frozen as a fixture for the migration test.
const V0_SCHEMA = `
create table if not exists stores (
  id integer primary key,
  name text not null unique,
  is_main integer not null default 0
);
create table if not exists items (
  id integer primary key,
  name text not null,
  store_id integer not null references stores(id),
  state text not null default 'stocked' check (state in ('stocked','low','out')),
  usual_qty integer not null default 1,
  photo text,
  last_price_cents integer,
  on_list integer not null default 0,
  unique (store_id, name collate nocase)
);
create table if not exists aliases (
  id integer primary key,
  item_id integer not null references items(id) on delete cascade,
  label text not null unique
);
create table if not exists receipts (
  id integer primary key,
  store_id integer not null references stores(id),
  created_at text not null,
  status text not null check (status in ('pending','confirmed')),
  raw_text text not null default '',
  photo text
);
create table if not exists receipt_lines (
  id integer primary key,
  receipt_id integer not null references receipts(id) on delete cascade,
  raw_text text not null,
  price_cents integer not null,
  item_id integer
);
`;

const tables = (db: ReturnType<typeof openDb>) =>
  (db.prepare("select name from sqlite_master where type='table'").all() as { name: string }[]).map((r) => r.name);

const version = (db: ReturnType<typeof openDb>) =>
  (db.prepare('pragma user_version').get() as { user_version: number }).user_version;

describe('schema', () => {
  it('creates_all_tables', () => {
    const t = tables(openDb(':memory:'));
    for (const n of ['stores', 'items', 'aliases', 'receipts', 'receipt_lines']) expect(t).toContain(n);
  });
  it('rejects_duplicate_name_same_store_case_insensitive', () => {
    const db = openDb(':memory:');
    db.prepare("insert into stores(name) values ('S')").run();
    db.prepare("insert into items(name,store_id) values ('Rice',1)").run();
    expect(() => db.prepare("insert into items(name,store_id) values ('RICE',1)").run()).toThrow();
  });
  it('allows_same_name_in_different_stores', () => {
    const db = openDb(':memory:');
    db.prepare("insert into stores(name) values ('A'),('B')").run();
    db.prepare("insert into items(name,store_id) values ('Rice',1)").run();
    expect(() => db.prepare("insert into items(name,store_id) values ('Rice',2)").run()).not.toThrow();
  });
  it('fresh_database_is_version_1', () => {
    const db = openDb(':memory:');
    expect(version(db)).toBe(1);
    const cats = (db.prepare('select name from categories order by id').all() as { name: string }[]).map((r) => r.name);
    expect(cats).toEqual(SEED_CATEGORIES);
    const cols = (t: string) => (db.prepare(`pragma table_info(${t})`).all() as { name: string }[]).map((r) => r.name);
    expect(cols('stores')).toContain('color');
    for (const c of ['category_id', 'aisle', 'price_source', 'price_receipt_id', 'price_updated_at', 'changed_at']) {
      expect(cols('items')).toContain(c);
    }
  });
  it('migrates_old_database_once', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelfwise-'));
    const file = path.join(dir, 'old.db');
    const open: { close(): void }[] = [];
    try {
      const raw = new DatabaseSync(file);
      open.push(raw);
      raw.exec(V0_SCHEMA);
      raw.exec("insert into stores(name) values ('S')");
      raw.exec("insert into items(name,store_id,state,usual_qty,photo,last_price_cents) values ('a',1,'low',2,'a.jpg',399),('b',1,'out',3,null,null),('c',1,'stocked',1,'c.jpg',1250)");
      raw.exec("insert into receipts(store_id,created_at,status) values (1,'2026-01-01','confirmed')");
      raw.close();
      open.pop();

      const onList = (db: ReturnType<typeof openDb>) =>
        (db.prepare('select on_list from items order by id').all() as { on_list: number }[]).map((r) => r.on_list);
      const count = (db: ReturnType<typeof openDb>, t: string) =>
        (db.prepare(`select count(*) as n from ${t}`).get() as { n: number }).n;

      const db = openDb(file);
      open.push(db);
      expect(onList(db)).toEqual([1, 1, 0]);
      expect((db.prepare('select color from stores').get() as { color: string }).color).toBe('fig');
      expect(count(db, 'receipts')).toBe(1);
      const kept = () => db.prepare('select name, last_price_cents, photo, usual_qty from items order by id').all();
      expect(kept()).toEqual([
        { name: 'a', last_price_cents: 399, photo: 'a.jpg', usual_qty: 2 },
        { name: 'b', last_price_cents: null, photo: null, usual_qty: 3 },
        { name: 'c', last_price_cents: 1250, photo: 'c.jpg', usual_qty: 1 },
      ]);
      expect(version(db)).toBe(1);
      const stamp = (db.prepare('select changed_at from items order by id').get() as { changed_at: string }).changed_at;
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      db.close();
      open.pop();

      const again = openDb(file);
      open.push(again);
      expect(count(again, 'categories')).toBe(12);
      expect(onList(again)).toEqual([1, 1, 0]);
    } finally {
      for (const d of open) d.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
