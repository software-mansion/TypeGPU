import type { Agent } from 'package-manager-detector';
import { pmExec } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';

export function addAgentSkills(pm: Agent, options: { nonInteractive?: boolean } = {}) {
  const args = ['skills', 'add', 'software-mansion-labs/skills', '-s', 'typegpu'];
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
