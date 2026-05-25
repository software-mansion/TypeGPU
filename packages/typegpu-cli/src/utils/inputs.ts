import * as p from '@clack/prompts';
import { cancelExit } from './prompts.ts';

function isValidProjectDirectory(projectDir: string) {
  return !/[<>:"\\|?*\s]|\/+$/.test(projectDir.trim());
}

function isValidPackageName(packageName: string) {
  return /^(?:@[a-z\d][a-z\d\-._]*\/)?[a-z\d][a-z\d\-._]*$/.test(packageName.trim());
}

export async function getProjectName(initialValue: string) {
  const projectName = await p.text({
    message: 'Project name:',
    placeholder: initialValue,
    initialValue,
    validate: (value) => {
      if (!value) {
        return 'Invalid project name.';
      }

      return !isValidProjectDirectory(value) || !isValidPackageName(value)
        ? 'Invalid project name.'
        : undefined;
    },
  });

  if (p.isCancel(projectName)) {
    cancelExit();
  }

  return projectName.trim();
}
