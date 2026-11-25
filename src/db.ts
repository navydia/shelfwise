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

export const STORE_COLORS = ['fig', 'claret', 'cinnamon', 'olive', 'forest', 'teal', 'harbor', 'slate'] as const;

const SEED_CATEGORIES = ['Produce', 'Dairy & eggs', 'Meat & fish', 'Bakery', 'Pasta & grains', 'Oils & condiments', 'Canned & jarred', 'Baking', 'Snacks', 'Frozen', 'Drinks', 'Household'];

// Ordered migration steps: MIGRATIONS[n] upgrades the schema from version n to n + 1.
// items.state is left in place from v0 but is no longer read.
const MIGRATIONS: ((db: Db) => void)[] = [
  (db) => {
    db.exec('create table categories (id integer primary key, name text not null unique collate nocase)');
    const insert = db.prepare('insert into categories(name) values (?)');
    for (const name of SEED_CATEGORIES) insert.run(name);
    db.exec(`
      alter table items add column category_id integer references categories(id) on delete set null;
      alter table items add column aisle text;
      alter table items add column price_source text check (price_source in ('receipt','manual'));
      alter table items add column price_receipt_id integer references receipts(id) on delete set null;
      alter table items add column price_updated_at text;
      alter table items add column changed_at text not null default '';
      alter table stores add column color text not null default 'fig';
      update items set on_list = 1 where state in ('low','out');
      update items set changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');
    `);
  },
];

function migrate(db: Db): void {
  const current = (db.prepare('pragma user_version').get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      MIGRATIONS[v](db);
      db.exec(`pragma user_version = ${v + 1}`);
    })();
  }
}

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('pragma foreign_keys = ON');
  if (path !== ':memory:') db.exec('pragma journal_mode = WAL');
  db.exec(SCHEMA);
  migrate(db);
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
