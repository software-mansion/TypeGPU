import * as p from '@clack/prompts';
import { cancelExit } from './prompts.ts';

function isValidProjectDirectory(projectDir: string) {
  return !/[<>:"\\|?*\s]|\/+$/.test(projectDir.trim());
}

function isValidPackageName(packageName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(packageName.trim());
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

export async function getPackageName(initialValue: string) {
  const packageName = await p.text({
    message: 'Package name:',
    placeholder: initialValue,
    initialValue,
    validate: (value) => {
      return !value || !isValidPackageName(value) ? 'Invalid package name.' : undefined;
    },
  });

  if (p.isCancel(packageName)) {
    cancelExit();
  }

  return packageName.trim();
}
