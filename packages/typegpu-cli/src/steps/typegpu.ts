import type { Agent } from 'package-manager-detector';
import * as p from '@clack/prompts';

import { appendVersion, hasDependency } from '../utils/pkg.ts';
import type { PackageJson } from '../utils/types.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';
import { multiselectPkgs } from '../utils/inputs.ts';

export async function ensureTypegpu(pm: Agent, pkg: PackageJson): Promise<boolean> {
  if (hasDependency(pkg, 'typegpu')) {
    p.log.info('typegpu is already installed.');
    return true;
  }
  if (!(await confirmStep('Install typegpu?'))) return false;
  pmAdd(pm, ['typegpu'], false);
  // no p.log.success because pmAdd already logs it
  return true;
}

export async function askForPkgs(pm: Agent, pkg: PackageJson) {
  const pkgs = (await multiselectPkgs(pkg))?.map(({ pkg, ver }) => appendVersion(pkg, ver));
  if (pkgs) {
    pmAdd(pm, pkgs, false);
  }
}
