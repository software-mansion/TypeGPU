import type { Agent } from 'package-manager-detector';

import { typegpuPkgs } from './utils/pkg.ts';
import { failAndExit } from './utils/prompts.ts';

export const DEFAULT_PROJECT_DIR = 'tgpu-project';
export const DEFAULT_PROJECT_TEMPLATE = 'vite-simple';

export const PROJECT_TEMPLATES = [
  { value: 'vite-simple', label: 'Vite (Bare)' },
  { value: 'vite-complex', label: 'Vite (Complex - Domain Warping)' },
  { value: 'vite-react', label: 'Vite + React (Bare)' },
  { value: 'expo-simple', label: 'Expo RN (Bare)' },
] as const;

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'pnpm@6', 'yarn', 'yarn@berry', 'bun'] as const;

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number]['value'];

type CommonOptions = {
  nonInteractive: boolean;
  packageManager?: Agent;
  packages: string[];
  agentSkills: boolean;
};

export type CreateProjectOptions = CommonOptions & {
  projectDir?: string;
  template?: ProjectTemplate;
};

export type EnhanceProjectOptions = CommonOptions & {
  recommended: boolean;
};

function getStringOption(value: string | string[] | undefined, name: string) {
  if (Array.isArray(value)) {
    failAndExit(`Expected a single value for ${name}.`);
  }

  return value;
}

export function parsePackages(value: string | string[] | undefined) {
  const values = (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const knownPackages = new Set<string>(typegpuPkgs.map((pkg) => pkg.value));
  const unknown = values.filter((pkg) => !knownPackages.has(pkg));
  if (unknown.length > 0) {
    failAndExit(
      `Unknown TypeGPU package${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. ` +
        `Expected one of: ${Array.from(knownPackages).join(', ')}.`,
    );
  }

  return Array.from(new Set(values));
}

export function parsePackageManager(value: string | string[] | undefined): Agent | undefined {
  const packageManager = getStringOption(value, '--package-manager');
  if (!packageManager) {
    return undefined;
  }

  if (!PACKAGE_MANAGERS.includes(packageManager as (typeof PACKAGE_MANAGERS)[number])) {
    failAndExit(
      `Unknown package manager: ${packageManager}. Expected one of: ${PACKAGE_MANAGERS.join(', ')}.`,
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
