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
  it('fresh_database_is_version_2', () => {
    const db = openDb(':memory:');
    expect(version(db)).toBe(2);
    const cats = (db.prepare('select name from categories order by id').all() as { name: string }[]).map((r) => r.name);
    expect(cats).toEqual(SEED_CATEGORIES);
    const cols = (t: string) => (db.prepare(`pragma table_info(${t})`).all() as { name: string }[]).map((r) => r.name);
    expect(cols('stores')).toContain('color');
    for (const c of ['category_id', 'aisle', 'price_source', 'price_receipt_id', 'price_updated_at', 'changed_at', 'emoji', 'archived_at', 'list_size_id', 'list_amount']) {
      expect(cols('items')).toContain(c);
    }
    expect(tables(db)).toContain('sizes');
    expect(tables(db)).toContain('oneoffs');
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
      expect((db.prepare('select color from stores').get() as { color: string }).color).toBe('berry');
      expect(count(db, 'receipts')).toBe(1);
      const kept = () => db.prepare('select name, last_price_cents, photo, usual_qty from items order by id').all();
      expect(kept()).toEqual([
        { name: 'a', last_price_cents: 399, photo: 'a.jpg', usual_qty: 2 },
        { name: 'b', last_price_cents: null, photo: null, usual_qty: 3 },
        { name: 'c', last_price_cents: 1250, photo: 'c.jpg', usual_qty: 1 },
      ]);
      expect(version(db)).toBe(2);
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
  it('migrates_v1_to_v2_sizes_and_colours', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelfwise-'));
    const file = path.join(dir, 'v1.db');
    const open: { close(): void }[] = [];
    try {
      const raw = new DatabaseSync(file);
      open.push(raw);
      raw.exec(V0_SCHEMA);
      raw.exec(`
        create table categories (id integer primary key, name text not null unique collate nocase);
        alter table items add column category_id integer references categories(id) on delete set null;
        alter table items add column aisle text;
        alter table items add column price_source text check (price_source in ('receipt','manual'));
        alter table items add column price_receipt_id integer references receipts(id) on delete set null;
        alter table items add column price_updated_at text;
        alter table items add column changed_at text not null default '';
        alter table stores add column color text not null default 'fig';
        insert into stores(name, color) values ('A','fig'),('B','harbor'),('C','claret'),('D','cinnamon'),('E','olive'),('F','forest'),('G','teal'),('H','slate');
        insert into receipts(store_id,created_at,status) values (1,'2026-01-01','confirmed');
        insert into items(name,store_id,usual_qty,last_price_cents,on_list,price_source,price_receipt_id,price_updated_at) values
          ('a',1,2,399,1,'receipt',1,'2026-01-01'),
          ('b',1,3,null,1,null,null,null),
          ('c',1,1,1250,0,'manual',null,'2026-02-02');
        pragma user_version = 1;
      `);
      raw.close();
      open.pop();

      const db = openDb(file);
      open.push(db);
      expect(version(db)).toBe(2);
      const sizes = db.prepare('select item_id, name, sold_by, last_price_cents, price_source, price_receipt_id, price_updated_at, usual_amount, is_default from sizes order by item_id').all();
      expect(sizes).toEqual([
        { item_id: 1, name: '', sold_by: 'each', last_price_cents: 399, price_source: 'receipt', price_receipt_id: 1, price_updated_at: '2026-01-01', usual_amount: 2, is_default: 1 },
        { item_id: 2, name: '', sold_by: 'each', last_price_cents: null, price_source: null, price_receipt_id: null, price_updated_at: null, usual_amount: 3, is_default: 1 },
        { item_id: 3, name: '', sold_by: 'each', last_price_cents: 1250, price_source: 'manual', price_receipt_id: null, price_updated_at: '2026-02-02', usual_amount: 1, is_default: 1 },
      ]);
      const items = db.prepare('select name, on_list, list_size_id, list_amount, emoji, archived_at, last_price_cents from items order by id').all();
      expect(items).toEqual([
        { name: 'a', on_list: 1, list_size_id: 1, list_amount: null, emoji: null, archived_at: null, last_price_cents: 399 },
        { name: 'b', on_list: 1, list_size_id: 2, list_amount: null, emoji: null, archived_at: null, last_price_cents: null },
        { name: 'c', on_list: 0, list_size_id: null, list_amount: null, emoji: null, archived_at: null, last_price_cents: 1250 },
      ]);
      const colours = (db.prepare('select color from stores order by id').all() as { color: string }[]).map((r) => r.color);
      expect(colours).toEqual(['berry', 'blue', 'tomato', 'pumpkin', 'green', 'green', 'teal', 'slate']);
      db.close();
      open.pop();

      const again = openDb(file);
      open.push(again);
      expect((again.prepare('select count(*) n from sizes').get() as { n: number }).n).toBe(3);
      expect(version(again)).toBe(2);
    } finally {
      for (const d of open) d.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
