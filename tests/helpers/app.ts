import request from 'supertest';
import { openDb } from '../../src/db';
import { createApp } from '../../src/server';

export function makeApp(opts: Parameters<typeof createApp>[1] = {}) {
  const db = openDb(':memory:');
  const app = createApp(db, opts);
  return { db, app, api: request(app) };
}
