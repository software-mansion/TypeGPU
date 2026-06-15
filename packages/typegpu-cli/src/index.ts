#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import mri from 'mri';
import { enhanceProject } from './enhance.ts';
import { createProject } from './create.ts';
import {
  PACKAGE_MANAGERS,
  PROJECT_TEMPLATES,
  parseAddons,
  parsePackageManager,
  parseTemplate,
} from './options.ts';
import { failAndExit } from './utils/prompts.ts';
import { typegpuPkgs } from './utils/pkg.ts';

function formatHelpEntries(entries: readonly { value: string; label?: string; hint?: string }[]) {
  const maxLength = Math.max(...entries.map((entry) => entry.value.length));
  return entries
    .map((entry) => {
      const description = entry.label ?? entry.hint;
      return description
        ? `  ${entry.value.padEnd(maxLength)}  ${description}`
        : `  ${entry.value}`;
    })
    .join('\n');
}

const helpMessage = `\
Usage: npx typegpu [PROJECT_DIR] [OPTION]...

Create a new TypeGPU project or enhance an existing one.

Options:
  -e, --enhance              enhance an existing TypeGPU project
  -y, --yes                  skip prompts and run the standard setup
      --template <name>      project template for new projects
      --addons <names>       comma-separated TypeGPU add-ons
      --package-manager <pm> package manager for dependency and skill commands
  -h, --help                 show this help message

Templates:
${formatHelpEntries(PROJECT_TEMPLATES)}

Add-ons:
${formatHelpEntries(typegpuPkgs)}

Package managers:
${formatHelpEntries(PACKAGE_MANAGERS)}
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

const cwd = process.cwd();
const positionals = argv._.map(String);
if (positionals.length > 1) {
  failAndExit(`Expected at most one PROJECT_DIR, received: ${positionals.join(', ')}.`);
}

const packageManager = parsePackageManager(argv['package-manager']);
const commonOptions = {
  nonInteractive: argv.yes === true,
  addons: parseAddons(argv.addons),
  ...(packageManager ? { packageManager } : {}),
};

if (argv.enhance) {
  const targetDir = positionals[0] ? path.resolve(cwd, positionals[0]) : cwd;
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    failAndExit(`Project directory does not exist: ${targetDir}`);
  }

  process.chdir(targetDir);
  await enhanceProject(targetDir, commonOptions);
} else {
  const template = parseTemplate(argv.template);
  await createProject(cwd, {
    ...commonOptions,
    ...(template ? { template } : {}),
    ...(positionals[0] ? { projectDir: positionals[0] } : {}),
  });
}
