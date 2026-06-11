import pathe from 'pathe';
import * as R from 'remeda';
import { tsContentLazy } from './importers.ts';

export function pathToExampleKey(path: string): string {
  return R.pipe(
    path,
    (p) => pathe.relative('./', p), // removing parent folder
    (p) => p.split('/'), // splitting into segments
    ([category, name]) => `${category}--${name}`,
  );
}

const API_RULES: { id: string; pattern: RegExp }[] = [
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

/**
 * This function is meant to be called as a macro, precomputed.
 * That's because we don't want to load all example source code up front
 * to determine used APIs.
 */
export async function MACRO_computeUsedApis(): Promise<Record<string, string[]>> {
  const files = await Promise.all(
    R.entries(tsContentLazy).map(
      async ([path, getContent]) => [pathToExampleKey(path), await getContent()] as const,
    ),
  );

  const exampleToUsedApis: Record<string, string[]> = {};

  for (const [key, content] of files) {
    const detectedApis = API_RULES.filter((r) => r.pattern.test(content)).map((r) => r.id);

    const usedApis = (exampleToUsedApis[key] ??= []);

    for (const api of detectedApis) {
      if (!usedApis.includes(api)) {
        usedApis.push(api);
      }
    }
  }

  return exampleToUsedApis;
}
