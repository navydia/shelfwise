import path from 'node:path';

export type Config = { port: number; dataDir: string; dbPath: string };

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);
  const dataDir = env.SHELFWISE_DATA ? path.resolve(env.SHELFWISE_DATA) : path.resolve('data');
  return { port, dataDir, dbPath: path.join(dataDir, 'shelfwise.db') };
}
