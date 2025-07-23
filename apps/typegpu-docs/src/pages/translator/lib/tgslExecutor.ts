import * as Babel from '@babel/standalone';
import plugin from 'unplugin-typegpu/babel';
import { extractUrlFromViteImport } from '../../../utils/examples/exampleContent.ts';

function translateTGSL(
  code: string,
): string {
  const result = Babel.transform(code, {
    plugins: [plugin],
  }).code;
  return result || '';
}

const moduleImports = {
  'typegpu':
    Object.values(import.meta.glob('/node_modules/typegpu/src/index.ts'))[0] ||
    Object.values(import.meta.glob('../../packages/typegpu/src/index.ts'))[0],
  'typegpu/data': Object.values(
    import.meta.glob('/node_modules/typegpu/src/data/index.ts'),
  )[0] ||
    Object.values(
      import.meta.glob('../../packages/typegpu/src/data/index.ts'),
    )[0],
} as Record<string, () => Promise<unknown>>;

type TgslModule = Record<string, unknown>;

async function executeTgslModule(tgslCode: string): Promise<TgslModule> {
  const translatedCode = translateTGSL(tgslCode);

  const imports: Record<string, string> = {};

  for (const [moduleName, importFn] of Object.entries(moduleImports)) {
    if (importFn) {
      const [url, isRelative] = extractUrlFromViteImport(importFn);
      if (url) {
        imports[moduleName] = `${isRelative ? '.' : ''}${url.pathname}`;
      }
    }
  }

  const importMap = { imports };

  const importMapScript = document.createElement('script');
  importMapScript.type = 'importmap';
  importMapScript.textContent = JSON.stringify(importMap);
  document.head.appendChild(importMapScript);

  try {
    const userBlob = new Blob([translatedCode], { type: 'text/javascript' });
    const userModuleUrl = URL.createObjectURL(userBlob);

    const module = await import(userModuleUrl);

    URL.revokeObjectURL(userModuleUrl);
    return module;
  } finally {
    document.head.removeChild(importMapScript);
  }
}

export async function executeTgslCode(tgslCode: string): Promise<string> {
  try {
    const exports = await executeTgslModule(tgslCode);

    const tgpuModule = await import('typegpu');

    return tgpuModule.default.resolve({
      externals: exports as Record<string, object>,
    });
  } catch (error) {
    throw new Error(
      `Failed to execute TGSL code: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
