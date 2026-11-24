// Dev server for browser checks. Set DELAY_FLAG to a file path: while it exists, /api calls stall 15s.
import express from 'express';
import fs from 'node:fs';
import { openDb } from '../../src/db';
import { createApp } from '../../src/server';

const [dataDir, port] = [process.env.SHELFWISE_DATA!, Number(process.env.PORT)];
fs.mkdirSync(dataDir, { recursive: true });
const outer = express();
outer.use((req, res, next) => {
  if (req.path.startsWith('/api/') && process.env.DELAY_FLAG && fs.existsSync(process.env.DELAY_FLAG)) setTimeout(next, 15000);
  else next();
});
// FAKE_OCR=<path to .txt>: every receipt photo "reads" as that file's text.
const fakeOcr = process.env.FAKE_OCR;
outer.use(createApp(openDb(`${dataDir}/shelfwise.db`), {
  dataDir,
  ...(fakeOcr ? { readReceiptText: async () => fs.readFileSync(fakeOcr, 'utf8') } : {}),
}));
outer.listen(port, () => console.log('e2e server on', port));
