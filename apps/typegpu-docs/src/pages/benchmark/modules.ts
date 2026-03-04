import type { PackageLocator } from './parameter-set.ts';

export type TypeGPUModule = typeof import('typegpu');
export type TypeGPUDataModule = typeof import('typegpu/data');
export type TypeGPUStdModule = typeof import('typegpu/std');

// Returns a promise that rejects after 5 seconds, downloading a package should be way faster than that
function timeout(pkgName: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Downloading '${pkgName}' took longer than 5 seconds`)),
      5000,
    );
  });
}

export function importTypeGPU(locator: PackageLocator): Promise<TypeGPUModule> {
  if (locator.type === 'local') {
    return Promise.race([import('typegpu'), timeout('typegpu')]);
  }

  if (locator.type === 'npm') {
    return Promise.race([
      import(/* @vite-ignore */ `https://esm.sh/typegpu@${locator.version}/?bundle=false`),
      timeout('typegpu'),
    ]);
  }

  if (locator.type === 'pr') {
    return Promise.race([
      import(
        /* @vite-ignore */ `https://esm.sh/pr/software-mansion/TypeGPU/typegpu@${locator.commit}/?bundle=false`
      ),
      timeout('typegpu'),
    ]);
  }

  throw new Error('Unsupported import of `typegpu`');
}

export function importTypeGPUData(locator: PackageLocator): Promise<TypeGPUDataModule> {
  if (locator.type === 'local') {
    return Promise.race([import('typegpu/data'), timeout('typegpu/data')]);
  }

  if (locator.type === 'npm') {
    return Promise.race([
      import(/* @vite-ignore */ `https://esm.sh/typegpu@${locator.version}/data/?bundle=false`),
      timeout('typegpu/data'),
    ]);
  }

  if (locator.type === 'pr') {
    return Promise.race([
      import(
        /* @vite-ignore */ `https://esm.sh/pr/software-mansion/TypeGPU/typegpu@${locator.commit}/data/?bundle=false`
      ),
      timeout('typegpu/data'),
    ]);
  }

  throw new Error('Unsupported import of `typegpu/data`');
}
