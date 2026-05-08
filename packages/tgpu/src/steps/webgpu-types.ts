import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { parse, stringify } from 'comment-json';

import { hasDependency } from '../utils/pkg.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep, failAndExit } from '../utils/prompts.ts';
import { TsConfigSchema, type PackageJson } from '../utils/types.ts';
import type { Agent } from 'package-manager-detector';
import { type } from 'arktype';

function findTsconfig(cwd: string) {
  for (const name of ['tsconfig.app.json', 'tsconfig.json']) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}

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

  if (tsconfig.compilerOptions.types?.includes('@webgpu/types')) {
    return;
  }

  tsconfig.compilerOptions.types.push('@webgpu/types');
  fs.writeFileSync(filePath, stringify(tsconfig, null, 2) + '\n');
}

export async function ensureWebgpuTypes(cwd: string, pm: Agent, pkg: PackageJson) {
  if (hasDependency(pkg, '@webgpu/types')) {
    p.log.info('@webgpu/types is already installed.');
    return;
  }

  if (!(await confirmStep('Install @webgpu/types and add to tsconfig?'))) {
    return;
  }

  const tsconfig = findTsconfig(cwd);
  if (!tsconfig) {
    failAndExit('No tsconfig found, cannot register @webgpu/types.');
  }

  await pmAdd(pm, ['@webgpu/types'], true);

  addWebgpuTypesToTsconfig(tsconfig);
  p.log.success(`Added @webgpu/types to ${path.basename(tsconfig)}.`);
}
