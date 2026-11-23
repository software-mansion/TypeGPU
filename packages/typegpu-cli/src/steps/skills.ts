import fs from 'node:fs';
import path from 'node:path';
import type { Agent } from 'package-manager-detector';
import { getWorkspaceVersion } from '../utils/pkg.ts';
import { pmExec } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';

function findInstalledSkill(cwd: string) {
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    const skillDir = path.join(dir, 'node_modules', 'typegpu', 'skills', 'typegpu');
    if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
      return skillDir;
    }
    if (dir === path.dirname(dir)) {
      return undefined;
    }
  }
}

function skillSource(cwd: string) {
  const skillDir = findInstalledSkill(cwd);
  if (!skillDir) {
    return ['software-mansion/TypeGPU#v' + getWorkspaceVersion('typegpu'), '-s', 'typegpu'];
  }
  const relative = path.relative(cwd, skillDir);
  return [relative.startsWith('.') ? relative : `./${relative}`];
}

export function addAgentSkills(pm: Agent, options: { nonInteractive?: boolean } = {}) {
  const args = ['skills', 'add', ...skillSource(process.cwd())];
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
