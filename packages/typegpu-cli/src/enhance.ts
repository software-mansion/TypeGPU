import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { detect, type Agent } from 'package-manager-detector';
import { type } from 'arktype';

import { PackageJsonSchema, type PackageJson } from './utils/types.ts';
import { pmInstall } from './utils/pm.ts';
import { cancelExit, confirmStep, failAndExit, rgbText } from './utils/prompts.ts';
import { askForWebgpuTypes } from './steps/webgpu-types.ts';
import { askForPkgs, ensureTypegpu } from './steps/typegpu.ts';
import { askForVite } from './steps/vite.ts';
import { askForAgentSkills } from './steps/skills.ts';

const PROJECT_KINDS = [{ value: 'vite', label: rgbText('Vite', 175, 105, 245) }];

async function runViteFlow(cwd: string, pm: Agent, pkg: PackageJson) {
  await askForWebgpuTypes(cwd, pm, pkg);
  await askForVite(cwd, pm, pkg);
  if (!(await ensureTypegpu(pm, pkg))) {
    return;
  }
  await askForPkgs(pm, pkg);
  await askForAgentSkills(pm);
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
  const pkg = PackageJsonSchema(JSON.parse(fs.readFileSync(pkgPath, 'utf-8')));
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
    default:
      failAndExit('Unsupported project kind.');
  }

  if (await confirmStep('Do you want to install the dependencies now?')) {
    pmInstall(pm.agent);
  }

  p.outro('Done! Get ready for a shaderful experience.');
}
