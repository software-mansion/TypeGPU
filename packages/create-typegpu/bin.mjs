#!/usr/bin/env node
// @ts-check

import { spawn } from 'node:child_process';

function asyncSpawn(/** @type {Parameters<typeof spawn>} */ ...args) {
  return new Promise((resolve, _reject) => {
    const child = spawn(...args);

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        process.exit(0);
        return;
      }

      resolve(code);
    });
  });
}

(async () => {
  const code = await asyncSpawn('npx', [`@typegpu/cli@latest`, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  process.exit(code ?? 0);
})();
