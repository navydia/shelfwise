import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db';

const tables = (db: ReturnType<typeof openDb>) =>
  (db.prepare("select name from sqlite_master where type='table'").all() as { name: string }[]).map((r) => r.name);

describe('schema', () => {
  it('creates_all_tables', () => {
    const t = tables(openDb(':memory:'));
    for (const n of ['stores', 'items', 'aliases', 'receipts', 'receipt_lines']) expect(t).toContain(n);
  });
  it('rejects_invalid_state', () => {
    const db = openDb(':memory:');
    db.prepare("insert into stores(name) values ('S')").run();
    expect(() => db.prepare("insert into items(name,store_id,state) values ('x',1,'empty')").run()).toThrow();
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
});
