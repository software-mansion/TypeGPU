import { extractUrlFromViteImport } from '../import-helpers.ts';

function importToUrl(importFn: () => unknown, options: { hasDefaultExport?: boolean }): string {
  const href = extractUrlFromViteImport(importFn);
  if (!href) {
    throw new Error(`Could not retrieve URL from import: ${importFn}`);
  }
  const absoluteUrl = new URL(href, import.meta.url);
  const importFnCode = String(importFn);
  console.log(absoluteUrl.href, importFnCode);
  let interModuleCode: string;
  // For some reason, Vite introduces indirection when importing some
  // modules (e.g. "typegpu", but not "typegpu/data")
  // The following conditions are meant to work around these
  // code transformations.
  if (importFnCode.includes('.then')) {
    // The import code resembles something like:
    // () => import(...).then(foo=>foo.bar)
    const indirectionProperty = '???';
    interModuleCode = `\
import mod from '${absoluteUrl.href}'
export 
`;
    if (options.hasDefaultExport) {
      interModuleCode += '';
    }
    // interModuleCode = `...`;
  } else {
    interModuleCode = '';
  }

  // console.log(interModuleCode);

  const userBlob = new Blob([interModuleCode], { type: 'text/javascript' });
  const userModuleUrl = URL.createObjectURL(userBlob);

  // const module = await import(userModuleUrl);

  // URL.revokeObjectURL(userModuleUrl);
  // return module;

  // console.log(userModuleUrl);

  return userModuleUrl;
}

export function importMap(): Record<string, string> {
  return {
    'typegpu': importToUrl(() => import('./typegpu-reexport.ts'), { hasDefaultExport: true }),
    'typegpu/data': importToUrl(() => import('./typegpu-data-reexport.ts'), {}),
    'typegpu/std': importToUrl(() => import('./typegpu-std-reexport.ts'), {}),
  };
}
