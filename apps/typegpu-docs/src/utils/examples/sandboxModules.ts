import { atom } from 'jotai';

interface SandboxModuleDefinition {
  typeDef:
    | { filename?: string; content: string }
    | { reroute: string };
  import?:
    | { filename?: string; content: string }
    | { reroute: string }
    | undefined;
}

async function srcFileToModule(
  [filepath, sourceImport]: [string, () => Promise<string>],
  baseUrl: string,
): Promise<[moduleKey: string, moduleDef: SandboxModuleDefinition]> {
  const filename = filepath.replace(baseUrl, '');
  const def = {
    filename,
    content: await sourceImport(),
  };

  return [
    filename,
    {
      typeDef: def,
      import: def,
    },
  ] as const;
}

async function dtsFileToModule(
  [filepath, sourceImport]: [string, () => Promise<string>],
  baseUrl: string,
): Promise<[moduleKey: string, moduleDef: SandboxModuleDefinition]> {
  const filename = filepath.replace(baseUrl, '');

  return [
    filename,
    {
      typeDef: {
        filename,
        content: await sourceImport(),
      },
    },
  ] as const;
}

const allPackagesSrcImports = import.meta.glob<string>([
  '../../../../../packages/*/src/**/*.ts',
  '../../../../../packages/*/package.json',
], {
  query: 'raw',
  import: 'default',
});

const threeImports = import.meta.glob<string>(
  '../../../node_modules/@types/three/**/*.d.ts',
  {
    query: 'raw',
    import: 'default',
  },
);

const mediacaptureImports = import.meta.glob<string>(
  '../../../node_modules/@types/dom-mediacapture-transform/**/*.d.ts',
  {
    query: 'raw',
    import: 'default',
  },
);

// Using an async atom so that the async computation is cached
export const sandboxModulesAtom = atom(async () => {
  const [dtsWebGPU, dtsWgpuMatrix] = await Promise.all([
    import('@webgpu/types/dist/index.d.ts?raw'),
    import('wgpu-matrix/dist/3.x/wgpu-matrix.d.ts?raw'),
  ]);

  const allPackagesSrcFiles = Object.fromEntries(
    await Promise.all(
      Object.entries(allPackagesSrcImports).map((dtsFile) =>
        srcFileToModule(dtsFile, '../../../../../packages/')
      ),
    ),
  );

  const threeModules = Object.fromEntries(
    await Promise.all(
      Object.entries(threeImports).map((dtsFile) =>
        dtsFileToModule(dtsFile, '../../../node_modules/')
      ),
    ),
  );

  const mediacaptureModules = Object.fromEntries(
    await Promise.all(
      Object.entries(mediacaptureImports).map((dtsFile) =>
        dtsFileToModule(dtsFile, '../../../node_modules/')
      ),
    ),
  );

  const SANDBOX_MODULES: Record<string, SandboxModuleDefinition> = {
    ...allPackagesSrcFiles,
    ...threeModules,
    ...mediacaptureModules,

    '@webgpu/types': {
      typeDef: { content: dtsWebGPU.default },
    },
    'wgpu-matrix': {
      typeDef: { filename: 'wgpu-matrix.d.ts', content: dtsWgpuMatrix.default },
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

    // Three.js, for examples of @typegpu/three
    'three': {
      typeDef: { reroute: '@types/three/build/three.module.d.ts' },
    },
    'three/webgpu': {
      typeDef: { reroute: '@types/three/build/three.webgpu.d.ts' },
    },
    'three/tsl': {
      typeDef: { reroute: '@types/three/build/three.tsl.d.ts' },
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
    '@typegpu/three': {
      typeDef: { reroute: 'typegpu-three/src/index.ts' },
    },
  };

  return SANDBOX_MODULES;
});
