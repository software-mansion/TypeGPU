#!/usr/bin/env node

import mri from 'mri';
import { enhanceProject } from './enhance.ts';
import { createProject } from './create.ts';
import { PROJECT_TEMPLATES, parseAddons, parsePackageManager, parseTemplate } from './options.ts';
import { failAndExit } from './utils/prompts.ts';
import { typegpuPkgs } from './utils/pkg.ts';

function formatHelpEntries(entries: readonly { value: string; label?: string; hint?: string }[]) {
  const maxLength = Math.max(...entries.map((entry) => entry.value.length));
  return entries
    .map((entry) => {
      const description = entry.label ?? entry.hint;
      return `  ${entry.value.padEnd(maxLength)}  ${description}`;
    })
    .join('\n');
}

const helpMessage = `\
Usage: tgpu [PROJECT_DIR] [OPTION]...

Create a new TypeGPU project or enhance an existing one.

Options:
  -e, --enhance              enhance an existing TypeGPU project
  -y, --yes                  skip prompts and run the standard setup
      --template <name>      project template for new projects
      --addons <names>       comma-separated TypeGPU add-ons
      --package-manager <pm> npm, pnpm, yarn, or bun
  -h, --help                 show this help message

Templates:
${formatHelpEntries(PROJECT_TEMPLATES)}

Add-ons:
${formatHelpEntries(typegpuPkgs)}
`;

const argv = mri(process.argv.slice(2), {
  alias: { e: 'enhance', h: 'help', y: 'yes' },
  boolean: ['enhance', 'help', 'yes'],
  string: ['addons', 'package-manager', 'template'],
});

if (argv.help) {
  console.log(helpMessage);
  process.exit(0);
}

if (argv.recommended !== undefined) {
  failAndExit('--recommended has been removed. Use --yes to run the standard setup.');
}
if (argv.packages !== undefined) {
  failAndExit(
    '--packages has been renamed to --addons. Pass add-ons once as a comma-separated list.',
  );
}
if (argv['agent-skills'] !== undefined) {
  failAndExit('The TypeGPU agent skill is installed automatically when using --yes.');
}

const cwd = process.cwd();
const packageManager = parsePackageManager(argv['package-manager']);
const commonOptions = {
  nonInteractive: argv.yes === true,
  addons: parseAddons(argv.addons),
  ...(packageManager ? { packageManager } : {}),
};

if (argv.enhance) {
  await enhanceProject(cwd, commonOptions);
} else {
  const template = parseTemplate(argv.template);
  await createProject(cwd, {
    ...commonOptions,
    ...(template ? { template } : {}),
    ...(argv._[0] ? { projectDir: argv._[0] } : {}),
  });
}
