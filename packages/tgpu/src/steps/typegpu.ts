import type { Agent } from 'package-manager-detector';
import * as p from '@clack/prompts';

import { hasDependency } from '../utils/pkg.ts';
import type { PackageJson } from '../utils/types.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';

export async function ensureTypegpu(pm: Agent, pkg: PackageJson) {
  if (hasDependency(pkg, 'typegpu')) {
    p.log.info('typegpu is already installed.');
    return;
  }
  if (!(await confirmStep('Install typegpu?'))) return;
  await pmAdd(pm, ['typegpu'], false);
}
