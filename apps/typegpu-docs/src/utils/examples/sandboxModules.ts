import { entries, fromEntries, map, pipe } from 'remeda';

import dtsTypeGPUNoise from '@typegpu/noise?raw';
import dtsWebGPU from '@webgpu/types/dist/index.d.ts?raw';
import dtsTypedBinary from 'typed-binary/dist/index.d.ts?raw';
import dtsWgpuMatrix from 'wgpu-matrix/dist/3.x/wgpu-matrix.d.ts?raw';

interface SandboxModuleDefinition<TModuleType> {
  importer?: () => Promise<TModuleType>;
  typeDef: { filename?: string; content: string } | { reroute: [string] };
}

function dtsFileToModule(
  [filepath, content]: [string, string],
  baseUrl: string,
): [moduleKey: string, moduleDef: SandboxModuleDefinition<unknown>] {
  const filename = filepath.replace(baseUrl, '');

  return [
    filename,
    {
      typeDef: {
        filename,
        content,
      },
    },
  ] as const;
}

const typegpuModules = pipe(
  entries(
    import.meta.glob('../../../../../packages/typegpu/dist/**/*.d.ts', {
      query: 'raw',
      eager: true,
      import: 'default',
    }) as Record<string, string>,
  ),
  map((dtsFile) => dtsFileToModule(dtsFile, '../../../../../packages/')),
  fromEntries(),
);

const mediacaptureModules = pipe(
  entries(
    import.meta.glob(
      '../../../node_modules/@types/dom-mediacapture-transform/**/*.d.ts',
      {
        query: 'raw',
        eager: true,
        import: 'default',
      },
    ) as Record<string, string>,
  ),
  map((dtsFile) => dtsFileToModule(dtsFile, '../../../node_modules/')),
  fromEntries(),
);

export const SANDBOX_MODULES: Record<
  string,
  SandboxModuleDefinition<unknown>
> = {
  ...typegpuModules,
  ...mediacaptureModules,

  '@webgpu/types': {
    typeDef: { content: dtsWebGPU },
  },
  'typed-binary': {
    typeDef: { filename: 'typed-binary.d.ts', content: dtsTypedBinary },
  },
  'wgpu-matrix': {
    typeDef: { filename: 'wgpu-matrix.d.ts', content: dtsWgpuMatrix },
  },
  typegpu: {
    importer: () => import('typegpu'),
    typeDef: { reroute: ['typegpu/src/index.ts'] },
  },
  'typegpu/data': {
    importer: () => import('typegpu/data'),
    typeDef: { reroute: ['typegpu/src/data/index.ts'] },
  },
  'typegpu/std': {
    importer: () => import('typegpu/std'),
    typeDef: { reroute: ['typegpu/src/std/index.ts'] },
  },

  // Utility modules
  '@typegpu/noise': {
    importer: () => import('@typegpu/noise'),
    typeDef: { filename: '@typegpu-noise.d.ts', content: dtsTypeGPUNoise },
  },
};
