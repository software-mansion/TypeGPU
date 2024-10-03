#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { exit } from 'node:process';
import arg from 'arg';
import { glob } from 'glob';
import color from './colors.mjs';
import generate from './gen.mjs';

const args = arg({
  '--version': Boolean,
  '--help': Boolean,
  '--input': String,
  '--output': String,

  '-v': '--version',
  '-h': '--help',
  '-i': '--input',
  '-o': '--output',
});

const COMMANDS = {
  gen: {
    execute: async () => {
      const input = args['--input'];
      const output = args['--output'];

      if (!input) {
        console.error(
          `${color.Red}Error: Missing required argument: ${color.Yellow}--input${color.Reset}`,
        );
        exit(1);
      }

      try {
        const files = await glob(input);
        await Promise.all(
          files.map((file) => {
            const out = output ?? file.replace('.wgsl', '.ts');
            console.log(`${file} >>> ${out}`);
            generate(file, out);
          }),
        );
      } catch (error) {
        console.error(`${color.Red}Error: ${error.message}${color.Reset}`);
        exit(1);
      }
    },
  },
};

function printHelp() {
  console.log(`${color.Cyan}\
----------------------------

  TypeGPU CLI

----------------------------
${color.Reset}

${color.Bold}Commands:${color.Reset}
  tgpu-cli gen   Generate a ts file from a wgsl file.
`);
}

function printVersion() {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('./package.json', import.meta.url)),
    );
    console.log(
      `${color.Green}TypeGPU CLI version ${packageJson.version}${color.Reset}`,
    );
  } catch (error) {
    console.error(
      `${color.Red}Error reading version: ${error.message}${color.Reset}`,
    );
    exit(1);
  }
}

if (args['--help']) {
  printHelp();
  exit(0);
}

if (args['--version']) {
  printVersion();
  exit(0);
}

/** @type {keyof typeof COMMANDS} */
const command = args._[0]; // first positional argument
if (!command) {
  printHelp();
  exit(1);
}

if (!(command in COMMANDS)) {
  console.error(`\nUnknown command: ${color.Yellow}${command}${color.Reset}\n`);
  exit(1);
}

await COMMANDS[command].execute();
