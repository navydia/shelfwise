import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

async function save(dataDir: string, buffer: Buffer, maxEdge: number, quality: number): Promise<string> {
  const dir = path.join(dataDir, 'photos');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  await sharp(buffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toFile(path.join(dir, name));
  return name;
}

export const saveItemPhoto = (dataDir: string, buffer: Buffer) => save(dataDir, buffer, 1024, 82);
export const saveReceiptPhoto = (dataDir: string, buffer: Buffer) => save(dataDir, buffer, 2000, 90);
