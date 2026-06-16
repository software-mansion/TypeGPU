import { comptime } from 'comptime';
import { pathToExampleKey } from './pathToExampleKey.ts';

export const usedApis = comptime(async () => {
  const sourceFiles = import.meta.glob(['./*/**/*.ts', './*/**/*.tsx'], {
    import: 'default',
    eager: true,
    query: 'raw',
  }) as Record<string, string>;

  const apiRules: { id: string; pattern: RegExp }[] = [
    { id: 'compute', pattern: /\.(computeFn|createComputePipeline|createGuardedComputePipeline)/ },
    { id: 'textures', pattern: /d\.texture/ },
    { id: 'storage textures', pattern: /d\.textureStorage|storageTexture:/ },
    { id: 'samplers', pattern: /createSampler|d\.sampler/ },
    { id: 'atomics', pattern: /d\.atomic/ },
    { id: 'vertex layouts', pattern: /tgpu\.vertexLayout/ },
    { id: 'bind group layouts', pattern: /tgpu\.bindGroupLayout/ },
    { id: 'storage buffers', pattern: /\$usage\([\s\S]*?'storage'/ },
    { id: 'index buffers', pattern: /withIndexBuffer|setIndexBuffer|\$usage\('index'/ },
    {
      id: 'instancing',
      pattern: /instanceCount|drawInstanced|builtin\.instanceIndex|vertexLayout[^\n]*'instance'/,
    },
    { id: 'bindless buffers', pattern: /\.createUniform|\.createReadonly|\.createMutable/ },
    { id: 'subgroups', pattern: /subgroups/ },
    { id: 'timestamp query', pattern: /timestamp-query/ },
    { id: 'external texture', pattern: /importExternalTexture|externalTexture/ },
    { id: 'stencil', pattern: /stencilFront|stencilBack/ },
    { id: 'unwrap', pattern: /\.unwrap\(/ },
    { id: 'raw shaders', pattern: /rawCodeSnippet/ },
    { id: 'three.js', pattern: /from ['"]three['"/]/ },
    { id: '~unstable', pattern: /\['~unstable'\]/ },
    { id: '@typegpu/noise', pattern: /@typegpu\/noise/ },
    { id: '@typegpu/sdf', pattern: /@typegpu\/sdf/ },
    { id: '@typegpu/color', pattern: /@typegpu\/color/ },
    { id: '@typegpu/react', pattern: /@typegpu\/react/ },
    { id: 'wgpu-matrix', pattern: /wgpu-matrix/ },
  ];

  const exampleToUsedApis: Record<string, string[]> = {};

  for (const [path, content] of Object.entries(sourceFiles)) {
    const key = pathToExampleKey(path);
    const apisInFile = apiRules.filter((r) => r.pattern.test(content)).map((r) => r.id);
    const apis = (exampleToUsedApis[key] ??= []);

    for (const api of apisInFile) {
      if (!apis.includes(api)) {
        apis.push(api);
      }
    }
  }

  return exampleToUsedApis;
});
