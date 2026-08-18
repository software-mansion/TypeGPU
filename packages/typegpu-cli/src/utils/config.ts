import path from 'node:path';
import fs from 'node:fs';

export function findConfig(cwd: string, possibleNames: string[]): string | undefined {
  for (const name of possibleNames) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}
