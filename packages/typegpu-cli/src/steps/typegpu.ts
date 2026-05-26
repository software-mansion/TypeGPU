import type { Agent } from 'package-manager-detector';
import * as p from '@clack/prompts';

import { hasDependency, typegpuPkgs } from '../utils/pkg.ts';
import type { PackageJsonWithDeps } from '../utils/types.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';
import { selectPkgs } from '../utils/inputs.ts';

export async function ensureTypegpu(pm: Agent, pkg: PackageJsonWithDeps): Promise<boolean> {
  if (hasDependency(pkg, 'typegpu')) {
    p.log.info('typegpu is already installed.');
    return true;
  }
  if (!(await confirmStep('Install typegpu?'))) return false;
  pmAdd(pm, ['typegpu'], false);
  // no p.log.success because pmAdd already logs it
  return true;
}

export async function askForPkgs(pm: Agent, pkg: PackageJsonWithDeps) {
  const options = typegpuPkgs.filter((entry) => !hasDependency(pkg, entry.value));
  if (options.length === 0) {
    return;
  }
  const packages = await selectPkgs(options);
  pmAdd(pm, packages, false);
}
