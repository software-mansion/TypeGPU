import { extractUrlFromViteImport } from '../import-helpers.ts';

function importToUrl(importFn: () => unknown): string {
  const url = extractUrlFromViteImport(importFn);
  if (!url) {
    throw new Error(`Could not retrieve URL from import: ${importFn}`);
  }
  return url.href;
}

export function importMap(): Record<string, string> {
  return {
    'typegpu': importToUrl(() => import('./typegpu-reexport.ts')),
    'typegpu/data': importToUrl(() => import('./typegpu-data-reexport.ts')),
    'typegpu/std': importToUrl(() => import('./typegpu-std-reexport.ts')),
  };
}
