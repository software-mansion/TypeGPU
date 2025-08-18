import * as Babel from '@babel/standalone';
import plugin from 'unplugin-typegpu/babel';
import { bundle } from './rolldown.ts';

function translateTGSL(
  code: string,
): string {
  const result = Babel.transform(code, {
    'presets': ['typescript'],
    'filename': 'example.ts',
    plugins: [plugin],
  }).code;
  return result || '';
}

const moduleImports = {
  'typegpu': 'https://esm.sh/typegpu@latest/?bundle=false',
  'typegpu/data': 'https://esm.sh/typegpu@latest/data/?bundle=false',
  'typegpu/std': 'https://esm.sh/typegpu@latest/std/?bundle=false',
} as Record<string, string>;

type TgslModule = Record<string, unknown>;

async function executeTgslModule(tgslCode: string): Promise<TgslModule> {
  const translatedCode = translateTGSL(tgslCode);

  const { output } = await bundle(
    {
      '/utils.ts':
        'export function add(a: number, b: number): number { return a + b; }',
      '/index.ts':
        `import {add} from './utils.ts'; console.log('Hello, World!');`,
    },
    ['./index.ts'],
  );

  console.log(output);

  const importMap = { imports: moduleImports };

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

    const tgpuModule = await import(
      //@ts-expect-error
      'https://esm.sh/typegpu@latest?bundle=false'
    );

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
