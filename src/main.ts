import fs from 'node:fs';
import { loadConfig } from './config';
import { openDb } from './db';
import { createApp } from './server';

const config = loadConfig(process.env);
fs.mkdirSync(config.dataDir, { recursive: true });
const db = openDb(config.dbPath);
const app = createApp(db, { dataDir: config.dataDir });
// Bind to localhost only: Tailscale Serve provides the HTTPS front door.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Shelfwise listening on http://127.0.0.1:${config.port} (data: ${config.dataDir})`);
});

// Close cleanly on stop so SQLite folds its write-ahead log into shelfwise.db.
// A leftover -wal file next to a restored database can silently undo a restore.
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => { db.close(); process.exit(0); }, 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
