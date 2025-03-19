import { entries, fromEntries, map, pipe } from 'remeda';

import dtsWebGPU from '@webgpu/types/dist/index.d.ts?raw';
import dtsWgpuMatrix from 'wgpu-matrix/dist/3.x/wgpu-matrix.d.ts?raw';

interface SandboxModuleDefinition<TModuleType> {
  typeDef: { filename?: string; content: string } | { reroute: string[] };
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

const allPackagesSrcFiles = pipe(
  entries(
    import.meta.glob('../../../../../packages/*/src/**/*.ts', {
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
  ...allPackagesSrcFiles,
  ...mediacaptureModules,

  '@webgpu/types': {
    typeDef: { content: dtsWebGPU },
  },
  'wgpu-matrix': {
    typeDef: { filename: 'wgpu-matrix.d.ts', content: dtsWgpuMatrix },
  },
  typegpu: {
    typeDef: { reroute: ['typegpu/src/index.ts'] },
  },
  'typegpu/data': {
    typeDef: { reroute: ['typegpu/src/data/index.ts'] },
  },
  'typegpu/std': {
    typeDef: { reroute: ['typegpu/src/std/index.ts'] },
  },

  // Utility modules
  '@typegpu/noise': {
    typeDef: { reroute: ['typegpu-noise/src/index.ts'] },
  },
  '@typegpu/color': {
    typeDef: { reroute: ['typegpu-color/src/index.ts'] },
  },
};
