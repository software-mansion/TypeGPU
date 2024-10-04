#!/usr/bin/env node

// @ts-check

import { readFileSync } from 'node:fs';
import path from 'node:path';
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
  '--commonjs': Boolean,

  '-v': '--version',
  '-h': '--help',
  '-i': '--input',
  '-o': '--output',
});

const ALLOWED_EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts'];

const COMMANDS = {
  gen: {
    execute: async () => {
      const input = args['--input'] ?? args._[1];
      const output = args['--output'];
      const toCjs = args['--commonjs'] ?? false;

      if (!input) {
        console.error(
          `${color.Red}Error: Missing required argument: ${color.Yellow}--input${color.Reset}`,
        );
        exit(1);
      }

      if (!output) {
        console.error(
          `${color.Red}Error: Missing required argument: ${color.Yellow}--output${color.Reset}`,
        );
        exit(1);
      }

      const extension = path.extname(output);

      if (
        extension === '' ||
        !ALLOWED_EXTENSIONS.includes(extension.toLowerCase())
      ) {
        console.error(
          `${color.Red}Error: output pattern: ${output} has unsupported extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
        );
        exit(1);
      }

      const toTs = extension.toLowerCase().endsWith('ts');
      const files = await glob(input);

      if (files.length === 0) {
        console.warn(
          `${color.Yellow}Warning: No files found for pattern: "${input}"${color.Reset}`,
        );
        exit(0);
      }

      if (files.length > 1 && !output.includes('*')) {
        console.error(
          `${color.Red}Error: More than one file found: ${files.join(', ')}, while a non-pattern output name was provided ${color.Reset}`,
        );
        exit(1);
      }

      const results = await Promise.allSettled(
        files.map((file) => {
          const parsed = path.parse(file);
          const out = output.replace('*', parsed.name);

          console.log(`Generating ${file} >>> ${out}`);
          return generate(file, out, toTs, toCjs);
        }),
      );

      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );

      if (errors.length > 0) {
        for (const error of errors) {
          console.error(`${color.Red}Error: ${error.message}${color.Reset}`);
        }
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

--help, -h\t list all commands and their options
--version, -v\t print tgpu-cli version

${color.Bold}Commands:${color.Reset}
  ${color.Cyan}tgpu-cli gen ${color.Reset} Generate a js/ts file from a wgsl file.
    --commonjs\t\t generate a CommonJS style file
    --input, -i\t\t a single input name or a glob pattern to generate js/ts from all matching files
    --output, -o\t an output name or pattern for generated file(s)
`);
}

function printVersion() {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
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
