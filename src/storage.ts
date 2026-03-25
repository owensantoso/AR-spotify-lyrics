import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT_DIR = resolve(process.cwd());

export function loadJsonFile<T>(relativePath: string, fallback: T): T {
  try {
    const filePath = resolve(ROOT_DIR, relativePath);
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJsonFile(relativePath: string, data: unknown): void {
  const filePath = resolve(ROOT_DIR, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}
