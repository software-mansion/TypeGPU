import * as p from '@clack/prompts';
import { cancelExit } from './prompts.ts';
import type { PackageJson } from './types.ts';
import { hasDependency, typegpuPkgs, VERSION } from './pkg.ts';

function isValidProjectDirectory(projectDir: string) {
  return !/[<>:"\\|?*\s]|\/+$/.test(projectDir.trim());
}

function isValidPackageName(packageName: string) {
  return /^(?:@[a-z\d][a-z\d\-._]*\/)?[a-z\d][a-z\d\-._]*$/.test(packageName.trim());
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
