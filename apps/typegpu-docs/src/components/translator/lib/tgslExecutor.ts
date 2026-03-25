import { mapValues, pipe } from 'remeda';
import rolldownPlugin from 'unplugin-typegpu/rolldown-browser';
import { bundle } from './rolldown.ts';
import { SANDBOX_MODULES } from '../../../utils/examples/sandboxModules.ts';

const moduleImports = {
  'typed-binary': 'https://esm.sh/typed-binary@latest',
} as Record<string, string>;

type TgslModule = Record<string, unknown>;

async function executeTgslModule(tgslCode: string): Promise<TgslModule> {
  const result = await bundle(
    {
      ...pipe(
        SANDBOX_MODULES,
        mapValues((val) => val.import),
      ),
      '/shader.ts': { content: tgslCode },
      '/index.ts': {
        content: `
          import tgpu from 'typegpu';
          import * as exports from './shader.ts';

          const shaderCode = tgpu.resolve({ externals: exports });
          export default shaderCode;
        `,
      },
    },
    ['./index.ts'],
    {
      plugins: [rolldownPlugin({})],
      external: ['typed-binary'],
    },
  );

  const translatedCode = result.output['index.js'];

  const importMap = { imports: moduleImports };
  const importMapScript = document.createElement('script');
  importMapScript.type = 'importmap';
  importMapScript.textContent = JSON.stringify(importMap);
  document.head.appendChild(importMapScript);

  try {
    const userBlob = new Blob([translatedCode], { type: 'text/javascript' });
    const userModuleUrl = URL.createObjectURL(userBlob);

    const module = await import(/* @vite-ignore */ userModuleUrl);

    URL.revokeObjectURL(userModuleUrl);
    return module;
  } finally {
    document.head.removeChild(importMapScript);
  }
}

export async function executeTgslCode(tgslCode: string): Promise<string> {
  try {
    const shaderCode = await executeTgslModule(tgslCode);
    return shaderCode.default as string;
  } catch (error) {
    console.error(error);
    throw new Error(
      `Failed to execute TGSL code: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
