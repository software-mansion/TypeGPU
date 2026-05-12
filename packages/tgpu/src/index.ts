#!/usr/bin/env node

import mri from 'mri';
import { enhanceProject } from './enhance.ts';

const helpMessage = `\
Usage: tgpu [OPTION]...

Create a new TypeGPU project or enhance an existing one.

Options:
  -e, --enhance           enhance an existing TypeGPU project
`;

// real script starts here
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
}
