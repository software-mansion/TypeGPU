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
import { createOutputPathCompiler } from './outputPathCompiler.mjs';

const args = arg({
  '--version': Boolean,
  '--help': Boolean,
  '--output': String,
  '--commonjs': Boolean,
  '--overwrite': Boolean,
  '--keep': Boolean,
  '--watch': Boolean,

  '-v': '--version',
  '-h': '--help',
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
  tgpu-cli gen <input> [--output <output>] [--watch] [--commonjs] [--overwrite | --keep]

Arguments:
  <input>       The input file or glob pattern.

Options:
  --output, -o  The output name or pattern for generated file(s). 
                If pattern doesn't include a directory, generated files will be in the same directory as their respective inputs.
                Placeholder for file name (without extension): *, for directory: **
                Default: "*.ts"
  --watch, -w   Watch for changes in the input file(s) and regenerate the output file(s).
  --commonjs    Generate a CommonJS style file.

  --overwrite   Overwrite existing files.
  --keep        Keep existing files.
`),

    execute: async () => {
      const input = args._[1];
      const output = args['--output'] ?? '*.ts';
      const moduleSyntax = args['--commonjs'] ? 'commonjs' : 'esmodule';

      const watch = args['--watch'] ?? false;

      if (!input) {
        console.error(
          `${color.Red}Error: Missing required positional argument (<input>)${color.Reset}`,
        );
        exit(1);
      }

      if (args['--overwrite'] && args['--keep']) {
        console.error(
          `${color.Red}The options: --overwrite and --keep are mutually exclusive'${color.Reset}`,
        );
        exit(1);
      }

      const existingFileStrategy = args['--overwrite']
        ? 'overwrite'
        : args['--keep']
          ? 'keep'
          : undefined;

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

      const fileNames = files.map((file) => path.parse(file).name);
      const duplicates = fileNames.filter(
        (name, index) => fileNames.indexOf(name) !== index,
      );
      if (
        duplicates.length > 0 &&
        output.includes(path.sep) &&
        !/\*\*\/.*\*.*/.test(output)
      ) {
        console.error(
          `${color.Red}Error: Duplicates found with name(s): [${duplicates.join(', ')}], while a single directory output pattern was provided. Make sure your pattern contains "**/*" to keep the original directory structure. ${color.Reset}`,
        );
        exit(1);
      }

      const outputPathCompiler = createOutputPathCompiler(input, output);

      /**
       * @param {{ exitOnError: boolean, files: string[], checkExisting: boolean }} options
       */
      const processFiles = async ({ exitOnError, files, checkExisting }) => {
        const results = await Promise.allSettled(
          files.map(async (file) => {
            const outputPath = outputPathCompiler(file);

            console.log(`Generating ${file} >>> ${outputPath}`);
            return generate({
              inputPath: file,
              outputPath,
              toTs,
              moduleSyntax,
              existingFileStrategy: checkExisting
                ? existingFileStrategy
                : 'overwrite',
            }).catch((error) => {
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

      processFiles({ exitOnError: !watch, files, checkExisting: true });

      if (watch) {
        console.log(`${color.Cyan}Watching for changes...${color.Reset}`);
        const watcher = chokidar.watch(files);
        watcher.on('change', async (file) => {
          await processFiles({
            exitOnError: false,
            files: [file],
            checkExisting: false,
          });
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
