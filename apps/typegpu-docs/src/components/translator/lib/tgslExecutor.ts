import rolldownPlugin from 'unplugin-typegpu/rolldown-browser';
import { bundle } from './rolldown.ts';

const moduleImports = {
  'typegpu': 'https://esm.sh/typegpu@latest/?bundle=false',
  'typegpu/data': 'https://esm.sh/typegpu@latest/data/?bundle=false',
  'typegpu/std': 'https://esm.sh/typegpu@latest/std/?bundle=false',
} as Record<string, string>;

type TgslModule = Record<string, unknown>;

async function executeTgslModule(tgslCode: string): Promise<TgslModule> {
  const result = await bundle(
    {
      '/shader.js': tgslCode,
      '/index.ts': `
        import tgpu from 'typegpu';
        import * as exports from './shader.js';

        const shaderCode = tgpu.resolve({ externals: exports });
        export default shaderCode;
      `,
    },
    ['./index.ts'],
    {
      plugins: [rolldownPlugin({})],
    },
  );

  const output = result.output['index.js'];

  const importMap = { imports: moduleImports };

  const importMapScript = document.createElement('script');
  importMapScript.type = 'importmap';
  importMapScript.textContent = JSON.stringify(importMap);
  document.head.appendChild(importMapScript);

  try {
    const userBlob = new Blob([output], { type: 'text/javascript' });
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
    const shaderCode = await executeTgslModule(tgslCode);
    return shaderCode.default as string;
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
