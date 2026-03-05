#!/usr/bin/env node
import { exit } from 'node:process';
import arg from 'arg';

import color from './colors.mjs';
import { Frog } from './log.mjs';
import prepack from './prepack.mjs';
import changes from './changes.mjs';

if (!process.env.npm_config_user_agent.startsWith('pnpm')) {
  console.error(
    'This script must be executed by pnpm! Make sure to `pnpm run ...` instead of `npm run ...`',
  );
  process.exit(1);
}

const args = arg({}, { permissive: true });

const COMMANDS = {
  prepack: {
    execute: prepack,
  },
  changes: {
    execute: changes,
  },
};

function printHelp() {
  console.log(`${color.Blue}\
----------------------------

  ${Frog} TypeGPU Dev CLI

----------------------------
${color.Reset}

${color.Bold}Commands:${color.Reset}
  tgpu-dev-cli prepack   Builds and prepares a package for publishing.
  tgpu-dev-cli changes   Prints files (and packages) changed between 'release' and 'main'.
`);
}

/** @type {keyof typeof COMMANDS} */
const command = args._[0]; // first positional argument
if (!command) {
  printHelp();
  exit(1);
}

if (!(command in COMMANDS)) {
  console.log(`\n${Frog}: Unknown command: ${color.Yellow}${command}${color.Reset}\n`);
  exit(1);
}

await COMMANDS[command].execute();
