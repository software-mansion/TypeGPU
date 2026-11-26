#!/usr/bin/env bun
import arg from 'arg';
import { exit } from 'node:process';

import bump from './bump.ts';
import changes from './changes.ts';
import color from './colors.ts';
import { Frog } from './log.ts';
import prepack from './prepack.ts';

if (!process.env.npm_config_user_agent?.startsWith('pnpm')) {
  console.error(
    'This script must be executed by pnpm! Make sure to `pnpm run ...` instead of `npm run ...`',
  );
  exit(1);
}

const args = arg({}, { permissive: true });

const COMMANDS = {
  prepack: {
    execute: prepack,
  },
  changes: {
    execute: changes,
  },
  bump: {
    execute: bump,
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
  tgpu-dev-cli changes   Lists packages changed on 'origin/main' since the latest release tag (e.g. v0.12.9),
                         and which of them need a release (with their next patch versions).
                         --base <ref>, --head <ref>  Compare other refs.
                         --verbose                   Also list the changed files.
  tgpu-dev-cli bump      Bumps the versions of packages that need a release (see 'changes'),
                         along with packages that have to be released with them.
                         --patch        Bump patch versions (e.g. 0.12.9 → 0.12.10).
                         --minor        Bump minor versions (e.g. 0.12.9 → 0.13.0). Every package on
                                        typegpu's minor line moves to its next minor, changed or not.
                                        One of the two is required.
                         --skip <name>  Don't bump this package (repeatable).
                         --dry-run      Only print what would be bumped.
                         --base <ref>   Compare against this ref instead of the latest release tag.
`);
}

const command = args._[0]; // first positional argument
if (!command) {
  printHelp();
  exit(1);
}

if (!(command in COMMANDS)) {
  console.log(`\n${Frog}: Unknown command: ${color.Yellow}${command}${color.Reset}\n`);
  exit(1);
}

await COMMANDS[command as keyof typeof COMMANDS].execute();
