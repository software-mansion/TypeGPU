import type { PackageLocator } from './parameter-set.js';

export type TypeGPUModule = typeof import('typegpu');
export type TypeGPUDataModule = typeof import('typegpu/data');
export type TypeGPUStdModule = typeof import('typegpu/std');

export function importTypeGPU(locator: PackageLocator): Promise<TypeGPUModule> {
  if (locator.type === 'local') {
    return import('typegpu');
  }

  if (locator.type === 'npm') {
    return import(
      /* @vite-ignore */ `https://esm.sh/typegpu@${locator.version}/`
    );
  }

  if (locator.type === 'pr') {
    return import(
      /* @vite-ignore */ `https://esm.sh/pr/typegpu@${locator.version}/`
    );
  }

  throw new Error('Unsupported import of `typegpu`');
}

export function importTypeGPUData(
  locator: PackageLocator,
): Promise<TypeGPUDataModule> {
  if (locator.type === 'local') {
    return import('typegpu/data');
  }

  if (locator.type === 'npm') {
    return import(
      /* @vite-ignore */ `https://esm.sh/typegpu@${locator.version}/data`
    );
  }

  if (locator.type === 'pr') {
    return import(
      /* @vite-ignore */ `https://esm.sh/pr/typegpu@${locator.version}/data`
    );
  }

  throw new Error('Unsupported import of `typegpu/data`');
}
