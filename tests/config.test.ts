import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../src/config';

describe('config', () => {
  it('uses_env_data_dir', () => {
    // path.resolve makes the expectation correct on both Linux/macOS and Windows (where it adds a drive letter).
    const dataDir = path.resolve('/srv/shelfwise-data');
    const c = loadConfig({ SHELFWISE_DATA: '/srv/shelfwise-data', PORT: '4100' });
    expect(c).toEqual({ port: 4100, dataDir, dbPath: path.join(dataDir, 'shelfwise.db') });
  });
  it('defaults_to_local_data_dir_and_port_3000', () => {
    const c = loadConfig({});
    expect(c.port).toBe(3000);
    expect(c.dataDir).toBe(path.resolve('data'));
  });
  it('rejects_invalid_port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
