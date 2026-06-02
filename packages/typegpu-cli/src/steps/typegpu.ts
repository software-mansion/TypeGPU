import type { Agent } from 'package-manager-detector';
import * as p from '@clack/prompts';

import { appendVersion, hasDependency, VERSION } from '../utils/pkg.ts';
import type { PackageJson } from '../utils/types.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';
import { multiselectPkgs } from '../utils/inputs.ts';

export function setupTypegpu(pm: Agent, pkg: PackageJson) {
  if (hasDependency(pkg, 'typegpu')) {
    p.log.info('typegpu is already installed.');
    return;
  }

  pmAdd(pm, ['typegpu'], false);
}

export async function ensureTypegpu(pm: Agent, pkg: PackageJson): Promise<boolean> {
  if (hasDependency(pkg, 'typegpu')) {
    p.log.info('typegpu is already installed.');
    return true;
  }
  if (!(await confirmStep('Install typegpu?'))) return false;
  setupTypegpu(pm, pkg);
  return true;
}

export function addTypegpuPkgs(pm: Agent, pkg: PackageJson, packageNames: string[]) {
  if (packageNames.length === 0) {
    return;
  }

  const pkgs = packageNames
    .filter((pkgName) => !hasDependency(pkg, pkgName))
    .map((pkgName) => appendVersion(pkgName, VERSION));
  pmAdd(pm, pkgs, false);
}

export async function askForPkgs(pm: Agent, pkg: PackageJson) {
  const pkgs = (await multiselectPkgs(pkg))?.map(({ pkg, ver }) => appendVersion(pkg, ver));
  if (pkgs) {
    pmAdd(pm, pkgs, false);
  }
}
