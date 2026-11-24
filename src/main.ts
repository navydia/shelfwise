import fs from 'node:fs';
import { loadConfig } from './config';
import { openDb } from './db';
import { createApp } from './server';

const config = loadConfig(process.env);
fs.mkdirSync(config.dataDir, { recursive: true });
const app = createApp(openDb(config.dbPath), { dataDir: config.dataDir });
// Bind to localhost only: Tailscale Serve provides the HTTPS front door.
app.listen(config.port, '127.0.0.1', () => {
  console.log(`Shelfwise listening on http://127.0.0.1:${config.port} (data: ${config.dataDir})`);
});
