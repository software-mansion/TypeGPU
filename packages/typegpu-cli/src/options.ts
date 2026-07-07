import type { Agent } from 'package-manager-detector';

import { typegpuPkgs } from './utils/pkg.ts';
import { failAndExit } from './utils/prompts.ts';

export const DEFAULT_PROJECT_DIR = 'tgpu-project';
export const DEFAULT_PROJECT_TEMPLATE = 'vite-bare';

export const PROJECT_TEMPLATES = [
  { value: 'vite-bare', label: 'Vite (Bare)' },
  { value: 'vite-complex', label: 'Vite (Complex - Domain Warping)' },
  { value: 'vite-react', label: 'Vite + React (Bare)' },
  { value: 'nextjs-bare', label: 'Next.js (Bare)' },
  { value: 'expo-bare', label: 'Expo RN (Bare)' },
] as const;

export const PACKAGE_MANAGERS = [
  { value: 'npm' },
  { value: 'pnpm' },
  { value: 'pnpm@6' },
  { value: 'yarn' },
  { value: 'yarn@berry' },
  { value: 'bun' },
] as const;

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number]['value'];
type PackageManager = (typeof PACKAGE_MANAGERS)[number]['value'];

type CommonOptions = {
  nonInteractive: boolean;
  packageManager?: Agent;
  addons: string[];
};

export type CreateProjectOptions = CommonOptions & {
  projectDir?: string;
  template?: ProjectTemplate;
};

export type EnhanceProjectOptions = CommonOptions;

function getStringOption(value: string | string[] | undefined, name: string) {
  if (Array.isArray(value)) {
    failAndExit(`Expected a single value for ${name}.`);
  }

  return value;
}

export function parseAddons(value: string | string[] | undefined) {
  const addons = getStringOption(value, '--addons');
  const values = (addons ? [addons] : [])
    .flatMap((entry) => entry.split(/[,\s]+/))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const knownAddons = new Set<string>(typegpuPkgs.map((pkg) => pkg.value));
  const unknown = values.filter((pkg) => !knownAddons.has(pkg));
  if (unknown.length > 0) {
    failAndExit(
      `Unknown TypeGPU add-on${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. ` +
        `Expected one of: ${Array.from(knownAddons).join(', ')}.`,
    );
  }

  return Array.from(new Set(values));
}

export function parsePackageManager(value: string | string[] | undefined): Agent | undefined {
  const packageManager = getStringOption(value, '--package-manager');
  if (!packageManager) {
    return undefined;
  }

  const knownPackageManagers = PACKAGE_MANAGERS.map((entry) => entry.value);
  if (!knownPackageManagers.includes(packageManager as PackageManager)) {
    failAndExit(
      `Unknown package manager: ${packageManager}. Expected one of: ${knownPackageManagers.join(', ')}.`,
    );
  }

  return packageManager as Agent;
}

export function parseTemplate(value: string | string[] | undefined): ProjectTemplate | undefined {
  const template = getStringOption(value, '--template');
  if (!template) {
    return undefined;
  }

  const knownTemplates = PROJECT_TEMPLATES.map((entry) => entry.value);
  if (!knownTemplates.includes(template as ProjectTemplate)) {
    failAndExit(`Unknown template: ${template}. Expected one of: ${knownTemplates.join(', ')}.`);
  }

  return template as ProjectTemplate;
}
