import fs from 'node:fs';
import path from 'node:path';
import { type } from 'arktype';
import * as p from '@clack/prompts';
import { parse, stringify } from 'comment-json';
import type { Agent } from 'package-manager-detector';

import { hasDependency } from '../utils/pkg.ts';
import { findConfig } from '../utils/config.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep, failAndExit } from '../utils/prompts.ts';
import { TsConfigSchema, type PackageJson } from '../utils/types.ts';

const TS_CONFIG_NAMES = ['tsconfig.app.json', 'tsconfig.json'];

function addWebgpuTypesToTsconfig(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parse(content);
  if (!parsed) {
    failAndExit(`Could not parse tsconfig.`);
  }
  const tsconfig = TsConfigSchema(parsed);
  if (tsconfig instanceof type.errors) {
    failAndExit(`Could not parse tsconfig.`, tsconfig.summary);
  }

  if (!tsconfig.compilerOptions) {
    tsconfig.compilerOptions = {};
  }

  if (!tsconfig.compilerOptions.types) {
    tsconfig.compilerOptions.types = [];
  }

  if (tsconfig.compilerOptions.types.includes('@webgpu/types')) {
    return;
  }

  tsconfig.compilerOptions.types.push('@webgpu/types');
  fs.writeFileSync(filePath, stringify(tsconfig, null, 2) + '\n');
}

export function setupWebgpuTypes(cwd: string, pm: Agent, pkg: PackageJson) {
  if (hasDependency(pkg, '@webgpu/types')) {
    p.log.info('@webgpu/types package is already installed.');
    return;
  }

  const tsconfig = findConfig(cwd, TS_CONFIG_NAMES);
  if (!tsconfig) {
    failAndExit('No tsconfig found, cannot register @webgpu/types package.');
  }

  pmAdd(pm, ['@webgpu/types'], true);

  addWebgpuTypesToTsconfig(tsconfig);
  p.log.success(`Added @webgpu/types to ${path.basename(tsconfig)}.`);
}

export async function askForWebgpuTypes(cwd: string, pm: Agent, pkg: PackageJson) {
  if (hasDependency(pkg, '@webgpu/types')) {
    p.log.info('@webgpu/types package is already installed.');
    return;
  }

  if (!(await confirmStep('Install @webgpu/types and add to tsconfig?'))) {
    return;
  }

  setupWebgpuTypes(cwd, pm, pkg);
}
