import { FlatMaterial, Material3D, PhongMaterial } from '@pixi/3d';
import { expect } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import * as p3d from '@typegpu/pixi/3d';
import { compileEffectShaders, compileMaterialShaders } from '../utils/pixi3d.ts';

// These compile the shaders PixiJS 3D builds around generated code on a real device.
// The WebGL halves are checked by `compile.test.ts` as far as that goes without a GL context.

async function compileErrors(device: GPUDevice, code: string): Promise<string[]> {
  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const error = await device.popErrorScope();

  const errors = info.messages
    .filter((message) => message.type === 'error')
    .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`);
  return error ? [...errors, error.message] : errors;
}

const Wave = d.struct({ amp: d.f32, color: d.vec3f });
const TINT = tgpu.const(d.vec3f, d.vec3f(1, 0.5, 0.25));

const hash = tgpu.fn(
  [d.vec2f],
  d.f32,
)((p) => {
  'use gpu';
  return std.fract(std.sin(std.dot(p, d.vec2f(12.9898, 78.233))) * 43758.5453);
});

const contourUniforms = p3d.uniforms({ lowColor: d.vec3f, highColor: d.vec3f, frequency: d.f32 });

const wave = (p: d.v3f) => {
  'use gpu';
  return Wave({
    amp: std.sin(p.y * contourUniforms.$.frequency - p3d.time.$ * 2),
    color: TINT.$,
  });
};

/** Uses every value that exists on all of PixiJS 3D's materials */
const contourBit = p3d.shaderBit({
  name: 'contour',
  uniforms: contourUniforms,
  vertex: {
    beforeTransform: () => {
      'use gpu';
      const wobble = std.sin(p3d.vertex.position.$.y * 6 + p3d.time.$) * hash(p3d.vertex.uv.$);
      p3d.vertex.position.$ = d.vec4f(p3d.vertex.position.$.xyz + p3d.vertex.normal.$ * wobble, 1);
    },
    afterTransform: () => {
      'use gpu';
      const lift = d.vec4f(0, p3d.vertex.worldNormal.$.y * 0.01, 0, 0);
      p3d.vertex.worldPosition.$ += lift;
      p3d.vertex.clipPosition.$ += lift;
    },
  },
  fragment: {
    material: () => {
      'use gpu';
      const w = wave(p3d.fragment.worldPosition.$);
      p3d.fragment.albedo.$ *= std.mix(
        contourUniforms.$.lowColor,
        contourUniforms.$.highColor,
        std.step(0, w.amp),
      );
      const toCamera = std.normalize(p3d.cameraPosition.$ - p3d.fragment.worldPosition.$);
      p3d.fragment.alpha.$ = std.dot(toCamera, p3d.fragment.normal.$);
    },
    end: () => {
      'use gpu';
      p3d.fragment.finalColor.$ += hash(p3d.fragment.uv.$) * 0.01;
    },
  },
});

/** Uses the values only a PBR material declares */
const pbrBit = p3d.shaderBit({
  name: 'pbrTweaks',
  fragment: {
    material: () => {
      'use gpu';
      p3d.fragment.roughness.$ = 0.3;
      p3d.fragment.metallic.$ *= 0.5;
      p3d.fragment.occlusion.$ *= 0.9;
      p3d.fragment.emissive.$ += d.vec3f(0.1, 0, 0);
    },
  },
});

gpuIt('a bit compiles inside the shader of a Material3D', async ({ gpu }) => {
  const { wgsl } = await compileMaterialShaders(
    () => new Material3D({ roughness: 0.5, extraBits: [contourBit, pbrBit] }),
  );

  expect(wgsl).toContain('fn contour_material()');
  expect(await compileErrors(gpu.device, wgsl)).toStrictEqual([]);
});

gpuIt('a bit compiles inside the shader of a PhongMaterial', async ({ gpu }) => {
  const { wgsl } = await compileMaterialShaders(
    () => new PhongMaterial({ extraBits: [contourBit] }),
  );

  expect(wgsl).toContain('fn contour_material()');
  expect(await compileErrors(gpu.device, wgsl)).toStrictEqual([]);
});

gpuIt('a bit compiles inside the shader of a FlatMaterial', async ({ gpu }) => {
  const { wgsl } = await compileMaterialShaders(
    () => new FlatMaterial({ extraBits: [contourBit] }),
  );

  expect(wgsl).toContain('fn contour_material()');
  expect(await compileErrors(gpu.device, wgsl)).toStrictEqual([]);
});

gpuIt('two bits that share helpers compile in one shader', async ({ gpu }) => {
  const grainBit = (name: string) =>
    p3d.shaderBit({
      name,
      fragment: {
        end: () => {
          'use gpu';
          p3d.fragment.finalColor.$ += hash(p3d.fragment.uv.$) * 0.01;
        },
      },
    });

  const { wgsl } = await compileMaterialShaders(
    () => new Material3D({ extraBits: [grainBit('grainA'), grainBit('grainB')] }),
  );

  expect(wgsl).toContain('fn grainA_hash(');
  expect(wgsl).toContain('fn grainB_hash(');
  expect(await compileErrors(gpu.device, wgsl)).toStrictEqual([]);
});

gpuIt('an effect compiles inside the shader of a FullscreenPass', async ({ gpu }) => {
  const effectUniforms = p3d.uniforms({ strength: d.f32, tint: d.vec3f });

  // Calls every helper PixiJS 3D declares for effects
  const fragment = p3d.effectFragment({
    uniforms: effectUniforms,
    effect: (uv) => {
      'use gpu';
      const color =
        p3d.sampleColor(uv) + p3d.sampleColor2(uv) * 0.5 + p3d.sampleColorLod(uv, 1) * 0.1;
      const edge = std.smoothstep(0.3, 0.8, std.distance(uv, d.vec2f(0.5)));
      const depth = p3d.linearDepth(p3d.sampleDepth(uv)) + p3d.viewPos(uv).z;
      const pixel = p3d.texel() + p3d.inputTexel() + p3d.viewTexel() + p3d.depthTexel();
      const noise = hash(uv + p3d.time.$ + pixel) * std.length(p3d.cameraPosition.$);
      return d.vec4f(
        color.rgb * effectUniforms.$.tint * (1 - edge * effectUniforms.$.strength) +
          depth * noise * 0.001,
        color.a,
      );
    },
  });

  const { wgsl } = await compileEffectShaders(fragment, effectUniforms.pixiTypes);

  expect(wgsl).toContain('fn effect(uv: vec2f) -> vec4f');
  expect(await compileErrors(gpu.device, wgsl)).toStrictEqual([]);
});
