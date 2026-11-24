// Usage: node scripts/backup.mjs [backupDir]
// Snapshots the database with SQLite's online backup (safe while the server runs)
// and archives it together with photos into <backupDir>/shelfwise-YYYY-MM-DD.tar.gz.
import { DatabaseSync, backup } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = path.resolve(process.env.SHELFWISE_DATA ?? 'data');
const outDir = path.resolve(process.argv[2] ?? path.join(dataDir, '..', 'shelfwise-backups'));
const stamp = new Date().toISOString().slice(0, 10);
fs.mkdirSync(outDir, { recursive: true });

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'shelfwise-backup-'));
try {
  const src = new DatabaseSync(path.join(dataDir, 'shelfwise.db'), { readOnly: true });
  await backup(src, path.join(stage, 'shelfwise.db'));
  src.close();
  const photos = path.join(dataDir, 'photos');
  if (fs.existsSync(photos)) fs.cpSync(photos, path.join(stage, 'photos'), { recursive: true });
  const archive = path.join(outDir, `shelfwise-${stamp}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', stage, '.']);
  console.log(archive);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
