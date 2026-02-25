#!/usr/bin/env node

// @ts-check

import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
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

const printHelp = () =>
  console.log(`${color.Cyan}\
----------------------------

  TypeGPU Generator CLI

----------------------------
${color.Reset}
Generate TypeGPU objects from a WGSL file.

Usage:
  tgpu-gen <input> [--output <output>] [--watch] [--commonjs] [--overwrite | --keep]

Arguments:
  <input>       The input file or glob pattern.

Options:
  --output, -o              The output name or pattern for generated file(s). 
                            If pattern doesn't include a directory, generated files will be in the same directory as their respective inputs.
                            Placeholder for file name (without extension): *, for directory: **
                            Default: "*.ts"
  --watch, -w               Watch for changes in the input file(s) and regenerate the output file(s).
  --commonjs                Generate a CommonJS style file.

  --overwrite               Overwrite existing files.
  --keep                    Keep existing files.
`);

const execute = async () => {
  const input = /** @type string */ (args._[0]);
  const output = args['--output'] ?? '*.ts';
  const moduleSyntax = args['--commonjs'] ? 'commonjs' : 'esmodule';
  const watch = args['--watch'] ?? false;

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

  if (extension === '' || !ALLOWED_EXTENSIONS.includes(extension.toLowerCase())) {
    console.error(
      `${color.Red}Error: output pattern: ${output} has unsupported extension. Allowed: ${ALLOWED_EXTENSIONS.join(
        ', ',
      )}`,
    );
    exit(1);
  }

  const toTs = extension.toLowerCase().endsWith('ts');
  const allMatchedFiles = await glob(input);

  if (allMatchedFiles.length === 0) {
    console.warn(`${color.Yellow}Warning: No files found for pattern: "${input}"${color.Reset}`);
    exit(0);
  }

  if (allMatchedFiles.length > 1 && !output.includes('*')) {
    console.error(
      `${color.Red}Error: More than one file found (${allMatchedFiles.join(
        ', ',
      )}), while a non-pattern output name was provided ${color.Reset}`,
    );
    exit(1);
  }

  const fileNames = allMatchedFiles.map((file) => path.parse(file).name);
  const duplicates = fileNames.filter((name, index) => fileNames.indexOf(name) !== index);
  if (duplicates.length > 0 && output.includes(path.sep) && !/\*\*\/.*\*.*/.test(output)) {
    console.error(
      `${color.Red}Error: Duplicates found with name(s): [${duplicates.join(
        ', ',
      )}], while a single directory output pattern was provided. Make sure your pattern contains "**/*" to keep the original directory structure. ${color.Reset}`,
    );
    exit(1);
  }

  const outputPathCompiler = createOutputPathCompiler(input, output);

  const existingFilesIO =
    existingFileStrategy === 'overwrite'
      ? []
      : await Promise.all(
          allMatchedFiles
            .map((input) => ({ input, output: outputPathCompiler(input) }))
            .map(({ input, output }) =>
              access(output)
                .then(() => ({ input, output }))
                .catch(() => null),
            ),
        ).then((existsResultsIO) =>
          existsResultsIO.filter(
            /** @returns {file is {input: string, output: string}} */ (file) => !!file,
          ),
        );

  if (existingFilesIO.length > 0 && existingFileStrategy === undefined) {
    console.error(
      `Error: The following file(s) already exist: [${existingFilesIO
        .map(({ output }) => output)
        .join(', ')}]. Use --overwrite option to replace existing files or --keep to skip them.`,
    );

    exit(1);
  }

  const inputFiles =
    existingFileStrategy === 'keep'
      ? allMatchedFiles.filter((file) => !existingFilesIO.map(({ input }) => input).includes(file))
      : allMatchedFiles;

  if (inputFiles.length === 0) {
    console.warn(
      `${color.Yellow}Warning: All output files already exist, while the option was set to keep existing files. Exiting..."${color.Reset}`,
    );
    exit(0);
  }

  /**
   * @param {{ exitOnError: boolean, inputFiles: string[] }} options
   */
  const processFiles = async ({ exitOnError, inputFiles }) => {
    const results = await Promise.allSettled(
      inputFiles.map(async (file) => {
        const outputPath = outputPathCompiler(file);

        console.log(`Generating ${file} >>> ${outputPath}`);
        return generate({
          inputPath: file,
          outputPath,
          toTs,
          moduleSyntax,
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

  await processFiles({ exitOnError: !watch, inputFiles });

  if (watch) {
    console.log(`${color.Cyan}Watching for changes...${color.Reset}`);
    const watcher = chokidar.watch(inputFiles);
    watcher.on('change', async (file) => {
      await processFiles({
        exitOnError: false,
        inputFiles: [file],
      });
    });
  }
};

function printVersion() {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
    );
    console.log(`${color.Green}TypeGPU Generator CLI version ${packageJson.version}${color.Reset}`);
  } catch (error) {
    console.error(
      `${color.Red}Error reading version: ${/** @type Error */ (error).message}${color.Reset}`,
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

if (!args._[0]) {
  console.error(`${color.Red}Error: Missing required positional argument (<input>)${color.Reset}`);

  printHelp();
  exit(1);
}

void execute();
