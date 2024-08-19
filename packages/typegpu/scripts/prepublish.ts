/*
 * Used before publishing the `typegpu` package.
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';

const packageJsonUrl = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(await fs.readFile(packageJsonUrl, 'utf-8'));

console.log(packageJson);

function promiseExec(command: string) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

await promiseExec(
  'pnpm build && pnpm -w test:spec && pnpm test:types && biome check .',
);
