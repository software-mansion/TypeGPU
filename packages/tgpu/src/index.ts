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

// 0-255 range
function rgbText(text: string, r: number, g: number, b: number) {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

async function runViteFlow(cwd: string, pm: Agent, pkg: PackageJson) {
  await ensureWebgpuTypes(cwd, pm, pkg);
  await ensureVite(cwd, pm, pkg);
  await ensureTypegpu(pm, pkg);
}

async function runReactNativeFlow(cwd: string, pm: Agent, pkg: PackageJson) {
  await ensureWebgpuTypes(cwd, pm, pkg);
}

// real script starts here
const argv = mri(process.argv.slice(2), {
  alias: { h: 'help' },
  boolean: ['help'],
});

if (argv.help) {
  console.log('Usage: node tgpu');
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
    { value: 'vite', label: rgbText('Vite', 175, 105, 245) },
    { value: 'react-native', label: rgbText('React Native', 100, 108, 238) },
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
p.outro('Done! Get ready for a shaderful experience.');
