import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { detect, type Agent } from 'package-manager-detector';
import { type } from 'arktype';

import { PackageJsonSchema, type PackageJson } from './utils/types.ts';
import { pmFromUserAgent, pmInstall } from './utils/pm.ts';
import { cancelExit, confirmStep, failAndExit, rgbText } from './utils/prompts.ts';
import { askForWebgpuTypes, setupWebgpuTypes } from './steps/webgpu-types.ts';
import { addTypegpuPkgs, askForPkgs, ensureTypegpu, setupTypegpu } from './steps/typegpu.ts';
import { askForVite, setupVite } from './steps/vite.ts';
import { addAgentSkills, askForAgentSkills } from './steps/skills.ts';
import type { EnhanceProjectOptions } from './options.ts';

const PROJECT_KINDS = [{ value: 'vite', label: rgbText('Vite', 221, 169, 255) }];

async function runViteFlow(
  cwd: string,
  pm: Agent,
  pkg: PackageJson,
  options?: EnhanceProjectOptions,
) {
  await askForWebgpuTypes(cwd, pm, pkg);
  await askForVite(cwd, pm, pkg);

  if (options?.addons.length) {
    setupTypegpu(pm, pkg);
    addTypegpuPkgs(pm, pkg, options.addons);
  } else {
    if (!(await ensureTypegpu(pm, pkg))) {
      return;
    }
    await askForPkgs(pm, pkg);
  }

  await askForAgentSkills(pm);
}

async function runNonInteractiveEnhance(
  cwd: string,
  pm: Agent,
  pkg: PackageJson,
  options: EnhanceProjectOptions,
) {
  setupWebgpuTypes(cwd, pm, pkg);
  await setupVite(cwd, pm, pkg, { createConfigIfMissing: true });
  setupTypegpu(pm, pkg);
  addTypegpuPkgs(pm, pkg, options.addons);
  addAgentSkills(pm, { nonInteractive: true });
}

export async function enhanceProject(cwd: string, options?: EnhanceProjectOptions) {
  p.intro('Enhancing project with TypeGPU.');

  const userAgentPm = process.env.npm_config_user_agent
    ? pmFromUserAgent(process.env.npm_config_user_agent)
    : undefined;
  const pmAgent = options?.packageManager ?? userAgentPm ?? (await detect({ cwd: cwd }))?.agent;
  if (!pmAgent) {
    failAndExit('Could not detect package manager. Pass --package-manager <pm>.');
  }

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

  if (options?.nonInteractive) {
    await runNonInteractiveEnhance(cwd, pmAgent, pkg, options);
    p.outro('Done! Get ready for a shaderful experience.');
    return;
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
      await runViteFlow(cwd, pmAgent, pkg, options);
      break;
    default:
      failAndExit('Unsupported project kind.');
  }

  if (await confirmStep('Do you want to install the dependencies now?')) {
    pmInstall(pmAgent);
  }

  p.outro('Done! Get ready for a shaderful experience.');
}
