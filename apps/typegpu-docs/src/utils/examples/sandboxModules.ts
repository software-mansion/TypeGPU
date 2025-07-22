import { entries, fromEntries, map, pipe } from 'remeda';

import dtsWebGPU from '@webgpu/types/dist/index.d.ts?raw';
import dtsWgpuMatrix from 'wgpu-matrix/dist/3.x/wgpu-matrix.d.ts?raw';

interface SandboxModuleDefinition {
  typeDef: { filename?: string; content: string } | { reroute: string[] };
}

function dtsFileToModule(
  [filepath, content]: [string, string],
  baseUrl: string,
): [moduleKey: string, moduleDef: SandboxModuleDefinition] {
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

const threeModules = pipe(
  entries(
    import.meta.glob(
      '../../../node_modules/@types/three/**/*.d.ts',
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

export const SANDBOX_MODULES: Record<string, SandboxModuleDefinition> = {
  ...allPackagesSrcFiles,
  ...threeModules,
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

  // Three.js, for examples of @typegpu/three
  'three': {
    typeDef: { reroute: ['@types/three/build/three.module.d.ts'] },
  },
  'three/webgpu': {
    typeDef: { reroute: ['@types/three/build/three.webgpu.d.ts'] },
  },
  'three/tsl': {
    typeDef: { reroute: ['@types/three/build/three.tsl.d.ts'] },
  },

  // Utility modules
  '@typegpu/noise': {
    typeDef: { reroute: ['typegpu-noise/src/index.ts'] },
  },
  '@typegpu/color': {
    typeDef: { reroute: ['typegpu-color/src/index.ts'] },
  },
  '@typegpu/three': {
    typeDef: { reroute: ['typegpu-three/src/index.ts'] },
  },
};
