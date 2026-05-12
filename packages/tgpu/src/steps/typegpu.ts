import type { Agent } from 'package-manager-detector';
import * as p from '@clack/prompts';

import { hasDependency } from '../utils/pkg.ts';
import type { PackageJsonWithDeps } from '../utils/types.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';

export async function ensureTypegpu(pm: Agent, pkg: PackageJsonWithDeps) {
  if (hasDependency(pkg, 'typegpu')) {
    p.log.info('typegpu is already installed.');
    return;
  }
  if (!(await confirmStep('Install typegpu?'))) return;
  pmAdd(pm, ['typegpu'], false);
  // no p.log.success because pmAdd already logs it
}
