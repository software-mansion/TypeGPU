#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import mri from 'mri';
import * as p from '@clack/prompts';
import { detect, type Agent } from 'package-manager-detector';
import { type } from 'arktype';

import { PackageJsonSchema, type PackageJson } from './utils/types.ts';
import { pmInstall } from './utils/pm.ts';

import { cancelExit, failAndExit } from './utils/prompts.ts';
import { ensureWebgpuTypes } from './steps/webgpu-types.ts';
import { ensureTypegpu } from './steps/typegpu.ts';
import { ensureVite } from './steps/vite.ts';

async function runViteFlow(cwd: string, pm: Agent, pkg: PackageJson): Promise<void> {
  await ensureWebgpuTypes(cwd, pm, pkg);
  await ensureVite(cwd, pm, pkg);
  await ensureTypegpu(pm, pkg);
}

// async function runReactNativeFlow(cwd: string, pm: Agent, pkg: PackageJson | null): Promise<void> {
//   const isExpo = isExpoProject(pkg);

//   await ensureWebgpuTypes(cwd, pm, pkg);
//   await ensureReactNativeWgpu(pm, pkg);
//   await ensureBabel(cwd, pm, pkg);

//   if (isExpo) await expoCustomize(cwd, pm);

//   await ensureTypegpu(pm, pkg);

//   if (isExpo) {
//     await expoClearCache(cwd, pm);
//     await expoPrebuild(cwd, pm);
//     await podInstall(cwd);
//   }
// }

// real script starts here
const argv = mri(process.argv.slice(2), {
  alias: { h: 'help' },
  boolean: ['help'],
});

if (argv.help) {
  console.log('Usage: node tgpu'); // TODO: change this after publish
  process.exit(0);
}

p.intro('Enhancing project with TypeGPU');

const cwd = process.cwd();
const pm = await detect({ cwd });
if (!pm) {
  failAndExit('Could not detect package manager.');
}
const pmAgent = pm.agent;
p.log.info(`Detected package manager: ${pmAgent}`);

const pkgPath = path.join(cwd, 'package.json');
if (!fs.existsSync(pkgPath)) {
  failAndExit('No package.json found in the current directory.');
}
const pkg = PackageJsonSchema(JSON.parse(fs.readFileSync(pkgPath, 'utf-8')));
if (pkg instanceof type.errors) {
  failAndExit('Could not parse package.json', pkg.summary);
}

const projectKind = await p.select({
  message: 'What kind of project is this?',
  options: [
    { value: 'vite', label: 'Vite' },
    { value: 'react-native', label: 'React Native' },
  ],
});
if (p.isCancel(projectKind)) {
  cancelExit();
}

switch (projectKind) {
  case 'vite':
    await runViteFlow(cwd, pm.agent, pkg);
    break;
  case 'react-native':
    // await runReactNativeFlow(cwd, pm.agent, pkg);
    break;
  default:
    failAndExit('Unsupported project kind.');
}
await pmInstall(pm.agent);
p.outro('Done! Get ready for shaderful experience.');
