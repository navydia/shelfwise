import { createWorker } from 'tesseract.js';
import path from 'node:path';

export async function readReceiptText(imagePath: string): Promise<string> {
  const worker = await createWorker('eng', 1, { cachePath: path.join(process.env.SHELFWISE_DATA ?? path.resolve('data'), 'tessdata') });
  try {
    const { data } = await worker.recognize(imagePath);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
