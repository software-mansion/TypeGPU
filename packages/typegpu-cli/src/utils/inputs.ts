import * as p from '@clack/prompts';
import { cancelExit } from './prompts.ts';
import type { PackageJson } from './types.ts';
import { hasDependency, typegpuPkgs, VERSION } from './pkg.ts';

function isValidProjectDirectory(projectDir: string) {
  const trimmedDir = projectDir.trim();
  return (
    projectDir.length === 0 || (trimmedDir.length > 0 && !/[<>:"\\|?*\s]|\/+$/.test(trimmedDir))
  );
}

export function isValidPackageName(packageName: string) {
  const trimmedName = packageName.trim();
  return /^(?:@[a-z\d][a-z\d\-._]*\/)?[a-z\d][a-z\d\-._]*$/.test(trimmedName);
}

export function sanitizeToExpoSlug(packageName: string) {
  const baseName = packageName.includes('/') ? packageName.split('/').pop() : packageName;

  const slug = baseName
    ?.replace(/[._]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'typegpu-expo-simple-project';
}

export async function getProjectName(initialValue: string) {
  let projectName = await p.text({
    message: 'Project name:',
    placeholder: initialValue,
    defaultValue: initialValue,
    validate: (value) => {
      return value && !isValidProjectDirectory(value) ? 'Invalid project name.' : undefined;
    },
  });

  if (p.isCancel(projectName)) {
    cancelExit();
  }

  return projectName.trim();
}

export async function getPackageName() {
  const packageName = await p.text({
    message: 'Package name:',
    validate: (value) => {
      return value && !isValidPackageName(value) ? 'Invalid package name.' : undefined;
    },
  });

  if (p.isCancel(packageName)) {
    cancelExit();
  }

  return packageName.trim();
}

export async function multiselectPkgs(pkg: PackageJson) {
  const options = typegpuPkgs.filter((entry) => !hasDependency(pkg, entry.value));
  if (options.length === 0) {
    p.log.info('All typegpu ecosystem packages are already installed.');
    return;
  }

  const packages = await p.multiselect({
    message: "Pick packages to add ('space' to select, 'enter' to confirm):",
    options: options,
    required: false,
  });

  if (p.isCancel(packages)) {
    cancelExit();
  }

  return packages.map((pkgName) => ({ pkg: pkgName, ver: VERSION }));
}
