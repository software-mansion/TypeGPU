import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transformPrecompile } from '../src/compiler/transform.ts';

// Doesn't need to exist, only its directory is used to resolve imports
const filename = fileURLToPath(new URL('./fixtures/inline.ts', import.meta.url));

/** Precompiles `body`, the inside of a `precompile((root) => ...)` arrow, with `imports` above */
async function capture(imports: string, body: string) {
  const result = await transformPrecompile(
    `import { precompile } from '@typegpu/prune';
${imports}
export const gpu = precompile((root) => ${body});
`,
    filename,
  );
  expect(result?.code).toContain('@typegpu/prune/runtime');
  return result;
}

const algorithm = `import { d, std } from 'typegpu';
import { bitonicSort, prefixScan, radixSort } from '@typegpu/algorithm';`;

describe('@typegpu/algorithm definitions', () => {
  // A definition holds both the dense and the padded variant, the instance picks one by size
  it('captures bitonicSort with keys only', async () => {
    await capture(algorithm, `bitonicSort.define(root, { keyType: d.u32 })`);
  });

  it('captures bitonicSort with values', async () => {
    await capture(algorithm, `bitonicSort.define(root, { keyType: d.f32, valueType: d.u32 })`);
  });

  it('captures bitonicSort with a struct payload and a custom comparator', async () => {
    await capture(
      algorithm,
      `bitonicSort.define(root, {
        keyType: d.i32,
        valueType: d.struct({ a: d.vec2f, b: d.u32 }),
        compare: (a, b) => {
          'use gpu';
          return a > b;
        },
      })`,
    );
  });

  for (const keyType of ['u32', 'i32', 'f32']) {
    it(`captures radixSort of ${keyType} keys`, async () => {
      await capture(algorithm, `radixSort.define(root, { keyType: d.${keyType} })`);
    });
  }

  it('captures radixSort with values, descending, over a range', async () => {
    await capture(
      algorithm,
      `radixSort.define(root, {
        keyType: d.u32,
        valueType: d.vec2f,
        direction: 'descending',
        range: [0, 1000],
      })`,
    );
  });

  it('captures radixSort with a custom key', async () => {
    await capture(
      algorithm,
      `radixSort.define(root, {
        keyType: d.u32,
        keyBits: 8,
        key: (key) => {
          'use gpu';
          return key & 255;
        },
      })`,
    );
  });

  for (const elementType of ['u32', 'i32', 'f32']) {
    it(`captures prefixScan of ${elementType}`, async () => {
      await capture(
        algorithm,
        `prefixScan.define(root, {
          elementType: d.${elementType},
          operation: std.add,
          identityElement: 0,
        })`,
      );
    });
  }

  it('captures a reducing prefixScan with a custom operation', async () => {
    await capture(
      algorithm,
      `prefixScan.define(root, {
        elementType: d.f32,
        reduceOnly: true,
        operation: (a, b) => {
          'use gpu';
          return std.max(a, b);
        },
        identityElement: -1e30,
      })`,
    );
  });
});

describe('@typegpu/noise definitions', () => {
  it('captures perlin2d.cache', async () => {
    await capture(`import { perlin2d } from '@typegpu/noise';`, `perlin2d.cache.define(root, {})`);
  });

  it('captures perlin3d.cache', async () => {
    await capture(`import { perlin3d } from '@typegpu/noise';`, `perlin3d.cache.define(root, {})`);
  });
});

describe('@typegpu/sdf definitions', () => {
  it('captures jumpFlood', async () => {
    await capture(
      `import { d, std, tgpu } from 'typegpu';
import { jumpFlood } from '@typegpu/sdf';`,
      `{
        const sourceLayout = tgpu.bindGroupLayout({ source: { texture: d.texture2d() } });
        return {
          sourceLayout,
          flood: jumpFlood.define(root, {
            classify: (coord) => {
              'use gpu';
              return std.textureLoad(sourceLayout.$.source, coord, 0).w > 0.5;
            },
            getSdf: (_coord, size, signedDist) => {
              'use gpu';
              return signedDist / d.f32(std.min(size.x, size.y));
            },
            getColor: (_coord, _size, _signedDist, insidePx) => {
              'use gpu';
              return d.vec4f(std.textureLoad(sourceLayout.$.source, insidePx, 0).xyz, 1);
            },
          }),
        };
      }`,
    );
  });
});

const cascades = `import { d, std } from 'typegpu';
import * as rc from '@typegpu/radiance-cascades';
import * as hrc from '@typegpu/radiance-cascades/holographic';`;

const sdfOptions = `
  sdf: (uv) => {
    'use gpu';
    return std.length(uv - 0.5) - 0.1;
  },
  emission: () => {
    'use gpu';
    return d.vec3f(1);
  },`;

describe('@typegpu/radiance-cascades definitions', () => {
  for (const mergeMode of ['hardware', 'bilinear-fix']) {
    it(`captures the SDF runner with ${mergeMode} merging`, async () => {
      await capture(cascades, `rc.define(root, { ${sdfOptions} mergeMode: '${mergeMode}' })`);
    });
  }

  it('captures the SDF runner with more rays and a custom step', async () => {
    await capture(
      cascades,
      `rc.define(root, { ${sdfOptions} baseStoredRayDim: 2, maxRaySteps: 16, stepSafety: 0.5 })`,
    );
  });

  const medium = `medium: () => {
    'use gpu';
    return { emission: d.vec3f(0.1), extinction: 0.5 };
  },`;

  it('captures the holographic runner without a source', async () => {
    await capture(cascades, `hrc.define(root, { ${medium} })`);
  });

  it('captures the holographic runner with a source', async () => {
    await capture(
      cascades,
      `hrc.define(root, {
        ${medium}
        source: (_pixel, incident) => {
          'use gpu';
          return incident * 0.5;
        },
      })`,
    );
  });

  it('captures the holographic runner with rgb transmission', async () => {
    await capture(
      cascades,
      `hrc.define(root, {
        transmission: 'rgb',
        tracedLevels: 2,
        medium: () => {
          'use gpu';
          return { emission: d.vec3f(0.1), extinction: d.vec3f(0.5, 0.25, 0.125) };
        },
      })`,
    );
  });
});
