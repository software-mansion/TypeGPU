import * as p from '@clack/prompts';
import { cancelExit } from './prompts.ts';

function isValidProjectDirectory(projectDir: string) {
  return !/[<>:"\\|?*\s]|\/+$/.test(projectDir.trim());
}

export async function getProjectDirectory(initialValue: string) {
  let projectDir = await p.text({
    message: 'Project directory:',
    placeholder: initialValue,
    initialValue,
    validate: (value) => {
      return value && !isValidProjectDirectory(value) ? 'Invalid project directory.' : undefined;
    },
  });

  if (p.isCancel(projectDir)) {
    cancelExit();
  }

  projectDir ??= '.';
  return projectDir.trim();
}
