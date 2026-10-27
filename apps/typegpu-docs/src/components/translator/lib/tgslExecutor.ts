import { mapValues, pipe } from 'remeda';
import rolldownPlugin from 'unplugin-typegpu/rolldown-browser';
import { bundle } from './rolldown.ts';
import type { SandboxModuleDefinition } from '../../../utils/examples/sandboxModules.ts';
import typegpuDocsPackageJson from '../../../../package.json' with { type: 'json' };

const moduleImports = {
  // Pinned, since `latest` can lag behind the major version that typegpu depends on
  'typed-binary': `https://esm.sh/typed-binary@${typegpuDocsPackageJson.dependencies['typed-binary']}`,
  'tsover-runtime': 'https://esm.sh/tsover-runtime@latest',
} as Record<string, string>;

type TgslModule = Record<string, unknown>;

async function executeTgslModule(
  tgslCode: string,
  sandboxModules: Record<string, SandboxModuleDefinition>,
): Promise<TgslModule> {
  const result = await bundle(
    {
      ...pipe(
        sandboxModules,
        mapValues((val) => val.import),
      ),
      '/shader.ts': { content: tgslCode },
      '/index.ts': {
        content: `
          import { tgpu } from 'typegpu';
          import * as exports from './shader.ts';

          const shaderCode = tgpu.resolve(Object.values(exports));
          export default shaderCode;
        `,
      },
    },
    ['./index.ts'],
    {
      plugins: [rolldownPlugin({})],
      external: ['typed-binary', 'tsover-runtime'],
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

export async function executeTgslCode(
  tgslCode: string,
  sandboxModules: Record<string, SandboxModuleDefinition>,
): Promise<string> {
  try {
    const shaderCode = await executeTgslModule(tgslCode, sandboxModules);
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
