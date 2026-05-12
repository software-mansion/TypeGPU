import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { detect, type Agent } from 'package-manager-detector';
import { type } from 'arktype';

import { PackageJsonWithDepsSchema, type PackageJsonWithDeps } from './utils/types.ts';
import { pmInstall } from './utils/pm.ts';
import { cancelExit, confirmStep, failAndExit, rgbText } from './utils/prompts.ts';
import { ensureWebgpuTypes } from './steps/webgpu-types.ts';
import { ensureTypegpu } from './steps/typegpu.ts';
import { ensureVite } from './steps/vite.ts';

const PROJECT_KINDS = [
  { value: 'vite', label: rgbText('Vite', 175, 105, 245) },
  { value: 'react-native', label: rgbText('React Native', 100, 108, 238) },
];

async function runViteFlow(cwd: string, pm: Agent, pkg: PackageJsonWithDeps) {
  await ensureWebgpuTypes(cwd, pm, pkg);
  await ensureVite(cwd, pm, pkg);
  await ensureTypegpu(pm, pkg);
}

export async function enhanceProject(cwd: string) {
  p.intro('Enhancing project with TypeGPU.');

  const pm = await detect({ cwd });
  if (!pm) {
    failAndExit('Could not detect package manager.');
  }
  const pmAgent = pm.agent;
  p.log.info(`Detected package manager: ${pmAgent}.`);

  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    failAndExit('No package.json found in the current directory.');
  }

  // normal JSON.parse is fine because package.json cannot contain comments
  const pkg = PackageJsonWithDepsSchema(JSON.parse(fs.readFileSync(pkgPath, 'utf-8')));
  if (pkg instanceof type.errors) {
    failAndExit('Could not parse package.json.', pkg.summary);
  }

  const projectKind = await p.select({
    message: 'What kind of project is this?',
    options: PROJECT_KINDS,
  });
  if (p.isCancel(projectKind)) {
    cancelExit();
  }

  switch (projectKind) {
    case 'vite':
      await runViteFlow(cwd, pm.agent, pkg);
      break;
    // case 'react-native':
    //   break;
    default:
      failAndExit('Unsupported project kind.');
  }

  if (await confirmStep('Do you want to install the dependencies now?')) {
    pmInstall(pm.agent);
  }

  p.outro('Get ready for a shaderful experience.');
}
