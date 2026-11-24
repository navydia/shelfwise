import { DatabaseSync } from 'node:sqlite';

// Uses the SQLite built into Node (22.16+), so there is no native library to compile.
export type Db = DatabaseSync;

const SCHEMA = `
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

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('pragma foreign_keys = ON');
  if (path !== ':memory:') db.exec('pragma journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

/** Wraps fn in a transaction: commits if it returns, rolls back if it throws. */
export function transaction<T>(db: Db, fn: () => T): () => T {
  return () => {
    db.exec('begin');
    try {
      const result = fn();
      db.exec('commit');
      return result;
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
  };
}
