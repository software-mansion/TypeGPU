import fs from 'node:fs';
import path from 'node:path';
import type { Agent } from 'package-manager-detector';
import { getWorkspaceVersion } from '../utils/pkg.ts';
import { pmExec } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';

function skillVersion(cwd: string) {
  const pkgDir = path.join(cwd, 'node_modules', 'typegpu');
  if (fs.existsSync(path.join(pkgDir, 'skills', 'typegpu', 'SKILL.md'))) {
    const { version } = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
    return version as string;
  }
  return getWorkspaceVersion('typegpu');
}

export function addAgentSkills(pm: Agent, options: { nonInteractive?: boolean } = {}) {
  const source = `software-mansion/TypeGPU#v${skillVersion(process.cwd())}`;
  const args = ['skills', 'add', source, '-s', 'typegpu'];
  if (options.nonInteractive) {
    args.push('-y');
  }

  pmExec(pm, args);
}

export async function askForAgentSkills(pm: Agent) {
  const shouldAddSkills = await confirmStep(`Download agent skills for typegpu?`, true);
  if (shouldAddSkills) {
    addAgentSkills(pm);
  }
}
