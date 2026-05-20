#!/usr/bin/env node

import mri from 'mri';
import { enhanceProject } from './enhance.ts';
import { createProject } from './create.ts';

const helpMessage = `\
Usage: tgpu [OPTION]...

Create a new TypeGPU project or enhance the existing one.

Options:
  -e, --enhance           enhance the existing TypeGPU project
`;

const argv = mri<{ enhance?: boolean; help?: boolean }>(process.argv.slice(2), {
  alias: { e: 'enhance', h: 'help' },
  boolean: ['enhance', 'help'],
});

if (argv.help) {
  console.log(helpMessage);
  process.exit(0);
}

const cwd = process.cwd();

if (argv.enhance) {
  await enhanceProject(cwd);
} else {
  await createProject(cwd);
}
