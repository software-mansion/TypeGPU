import type { Agent } from 'package-manager-detector';
import { pmExec } from '../utils/pm.ts';
import { confirmStep } from '../utils/prompts.ts';

export async function askForAgentSkills(pm: Agent) {
  const shouldAddSkills = await confirmStep(`Download agent skills for typegpu?`, true);
  if (shouldAddSkills) {
    pmExec(pm, ['skills', 'add', 'software-mansion-labs/skills', '-s', 'typegpu']);
  }
}
