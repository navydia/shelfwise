import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db';
import { createApp } from '../src/server';

describe('server', () => {
  it('health_returns_ok', async () => {
    const res = await request(createApp(openDb(':memory:'))).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
  it('health_reports_version', async () => {
    const res = await request(createApp(openDb(':memory:'))).get('/api/health');
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
