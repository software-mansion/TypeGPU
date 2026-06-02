#!/usr/bin/env node

import mri from 'mri';
import { enhanceProject } from './enhance.ts';
import { createProject } from './create.ts';
import { parsePackageManager, parsePackages, parseTemplate } from './options.ts';

const helpMessage = `\
Usage: tgpu [PROJECT_DIR] [OPTION]...

Create a new TypeGPU project or enhance an existing one.

Options:
  -e, --enhance              enhance an existing TypeGPU project
  -y, --yes                  skip prompts and use safe defaults
      --template <name>      project template for new projects
      --packages <name>      TypeGPU ecosystem package, repeatable
      --agent-skills         install the TypeGPU agent skill
      --package-manager <pm> npm, pnpm, yarn, or bun
      --recommended          recommended enhance setup
  -h, --help                 show this help message
`;

const argv = mri(process.argv.slice(2), {
  alias: { e: 'enhance', h: 'help', y: 'yes' },
  boolean: ['agent-skills', 'enhance', 'help', 'recommended', 'yes'],
  string: ['package-manager', 'packages', 'template'],
});

if (argv.help) {
  console.log(helpMessage);
  process.exit(0);
}

const cwd = process.cwd();
const packageManager = parsePackageManager(argv['package-manager']);
const commonOptions = {
  nonInteractive: argv.yes === true,
  packages: parsePackages(argv.packages),
  agentSkills: argv['agent-skills'] === true,
  ...(packageManager ? { packageManager } : {}),
};

if (argv.enhance) {
  await enhanceProject(cwd, {
    ...commonOptions,
    recommended: argv.recommended === true,
  });
} else {
  const template = parseTemplate(argv.template);
  await createProject(cwd, {
    ...commonOptions,
    ...(template ? { template } : {}),
    ...(argv._[0] ? { projectDir: argv._[0] } : {}),
  });
}
