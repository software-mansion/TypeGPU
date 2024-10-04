#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { exit } from 'node:process';
import arg from 'arg';
import chokidar from 'chokidar';
import { glob } from 'glob';
import color from './colors.mjs';
import generate from './gen.mjs';

const args = arg({
  '--version': Boolean,
  '--help': Boolean,
  '--input': String,
  '--output': String,
  '--watch': Boolean,

  '-v': '--version',
  '-h': '--help',
  '-i': '--input',
  '-o': '--output',
  '-w': '--watch',
});

const COMMANDS = {
  gen: {
    help: () =>
      console.log(`\
Generate a ts file from a wgsl file.

Usage:
  tgpu-cli gen --input <input> [--output <output>] [--watch]
  tgpu-cli gen <input> [--output <output>] [--watch]

Options:
  --input, -i   The input file or glob pattern.
  --output, -o  The output file. If not provided, the input file will be used with a .ts extension. Cannot be used with glob patterns.
  --watch, -w   Watch for changes in the input file(s) and regenerate the output file(s)`),
    execute: async () => {
      const input = args['--input'] ?? args._[1];
      const output = args['--output'];
      const watch = args['--watch'] ?? false;

      if (!input) {
        console.error(
          `${color.Red}Error: Missing required argument: ${color.Yellow}--input${color.Reset}`,
        );
        exit(1);
      }

      const files = await glob(input);

      if (files.length === 0) {
        console.warn(
          `${color.Yellow}Warning: No files found for pattern: "${input}"${color.Reset}`,
        );
        exit(0);
      }

      if (!output && !input.endsWith('.wgsl')) {
        console.error(
          `${color.Red}Error: No output name provided and provided input doesn't end with .wgsl ${color.Reset}`,
        );
        exit(1);
      }

      if (output && files.length > 1) {
        console.error(
          `${color.Red}Error: More than one file found, while a single output name was provided ${color.Reset}`,
        );
        exit(1);
      }

      const processFiles = async ({ exitOnError, files }) => {
        const results = await Promise.allSettled(
          files.map(async (file) => {
            const out = output ?? file.replace('.wgsl', '.ts');
            console.log(`Generating ${file} >>> ${out}`);
            return generate(file, out).catch((error) => {
              error.file = file;
              throw error;
            });
          }),
        );

        const errors = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        );

        if (errors.length > 0) {
          for (const error of errors) {
            console.error(
              error.token?.line
                ? `${color.Red}Error in file ${error.file} at line ${error.token.line}: ${error.message}${color.Reset}`
                : `${color.Red}Error in file ${error.file}: ${error.message}${color.Reset}`,
            );
          }
          if (exitOnError) {
            exit(1);
          }
        }
      };

      processFiles({ exitOnError: !watch, files });

      if (watch) {
        console.log(`${color.Yellow}Watching for changes...${color.Reset}`);
        const watcher = chokidar.watch(files);
        watcher.on('change', async (file) => {
          await processFiles({ exitOnError: false, files: [file] });
        });
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
  const command = args._[0];
  if (command) {
    if (command in COMMANDS) {
      COMMANDS[command].help();
      exit(0);
    } else {
      console.error(
        `${color.Red}Unknown command: ${color.Yellow}${command}${color.Reset}`,
      );
    }
  }
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
