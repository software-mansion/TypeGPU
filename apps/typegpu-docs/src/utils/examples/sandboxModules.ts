import { entries, fromEntries, map, pipe } from 'remeda';

import dtsWebGPU from '@webgpu/types/dist/index.d.ts?raw';
import dtsWgpuMatrix from 'wgpu-matrix/dist/3.x/wgpu-matrix.d.ts?raw';

interface SandboxModuleDefinition {
  typeDef:
    | { filename?: string; content: string }
    | { reroute: string };
  import?:
    | { filename?: string; content: string }
    | { reroute: string }
    | undefined;
}

function srcFileToModule(
  [filepath, content]: [string, string],
  baseUrl: string,
): [moduleKey: string, moduleDef: SandboxModuleDefinition] {
  const filename = filepath.replace(baseUrl, '');
  const def = {
    filename,
    content,
  };

  return [
    filename,
    {
      typeDef: def,
      import: def,
    },
  ] as const;
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
    import.meta.glob([
      '../../../../../packages/*/src/**/*.ts',
      '../../../../../packages/*/package.json',
    ], {
      query: 'raw',
      eager: true,
      import: 'default',
    }) as Record<string, string>,
  ),
  map((dtsFile) => srcFileToModule(dtsFile, '../../../../../packages/')),
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
  ...mediacaptureModules,

  '@webgpu/types': {
    typeDef: { content: dtsWebGPU },
  },
  'wgpu-matrix': {
    typeDef: { filename: 'wgpu-matrix.d.ts', content: dtsWgpuMatrix },
  },
  tinyest: {
    import: { reroute: 'tinyest/src/index.ts' },
    typeDef: { reroute: 'tinyest/src/index.ts' },
  },
  typegpu: {
    import: { reroute: 'typegpu/src/index.ts' },
    typeDef: { reroute: 'typegpu/src/index.ts' },
  },
  'typegpu/data': {
    import: { reroute: 'typegpu/src/data/index.ts' },
    typeDef: { reroute: 'typegpu/src/data/index.ts' },
  },
  'typegpu/std': {
    import: { reroute: 'typegpu/src/std/index.ts' },
    typeDef: { reroute: 'typegpu/src/std/index.ts' },
  },

  // Utility modules
  '@typegpu/noise': {
    import: { reroute: 'typegpu-noise/src/index.ts' },
    typeDef: { reroute: 'typegpu-noise/src/index.ts' },
  },
  '@typegpu/color': {
    import: { reroute: 'typegpu-color/src/index.ts' },
    typeDef: { reroute: 'typegpu-color/src/index.ts' },
  },
};
