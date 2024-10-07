#!/usr/bin/env node

// @ts-check

import { readFileSync } from 'node:fs';
import path from 'node:path';
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
  '--commonjs': Boolean,
  '--overwrite': Boolean,
  '--watch': Boolean,

  '-v': '--version',
  '-h': '--help',
  '-i': '--input',
  '-o': '--output',
  '-w': '--watch',
});

const ALLOWED_EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts'];

const COMMANDS = {
  gen: {
    help: () =>
      console.log(`\
Generate a ts/js file from a wgsl file.

Usage:
  tgpu-cli gen --input <input> --output <output> [--watch] [--commonjs]
  tgpu-cli gen <input> --output <output> [--watch] [--commonjs]

Options:
  --input, -i\t The input file or glob pattern.
  --output, -o\t The output name or pattern for generated file(s).
  --watch, -w\t Watch for changes in the input file(s) and regenerate the output file(s).
  --commonjs\t Generate a CommonJS style file.
`),

    execute: async () => {
      const input = args['--input'] ?? args._[1];
      const output = args['--output'];
      const toCommonJs = args['--commonjs'] ?? false;
      const overwriteExisting = args['--overwrite'] ?? false;
      const watch = args['--watch'] ?? false;

      if (!input || !output) {
        console.error(
          `${color.Red}Error: Missing some of the required arguments: ${color.Yellow}--input, --output${color.Reset}`,
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
          `${color.Red}Error: More than one file found (${files.join(', ')}), while a non-pattern output name was provided ${color.Reset}`,
        );
        exit(1);
      }

      const processFiles = async ({ exitOnError, files }) => {
        const results = await Promise.allSettled(
          files.map(async (file) => {
            const parsed = path.parse(file);

            const out = output.includes('**/*')
              ? output.replace('**/*', path.join(parsed.dir, parsed.name))
              : output.replace('*', parsed.name);

            console.log(`Generating ${file} >>> ${out}`);
            return generate(
              file,
              out,
              toTs,
              toCommonJs,
              overwriteExisting,
            ).catch((error) => {
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
  ${color.Cyan}tgpu-cli gen ${color.Reset} Generate a js/ts file from a wgsl file.
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
