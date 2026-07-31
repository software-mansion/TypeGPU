import {
  tgpu,
  d,
  std,
  type SampledFlag,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import { randf } from '@typegpu/noise';
import { Config, defaults } from './config.ts';
import { smokeLayout } from './fluid.ts';

type R32Texture = TgpuTexture & SampledFlag & StorageFlag;

export const MAX_PARTICLES = defaults.maxParticles;

export const Particle = d.struct({
  pos: d.vec2f,
  vel: d.vec2f,
  life: d.f32,
  maxLife: d.f32,
});

const ParticleArray = d.arrayOf(Particle, MAX_PARTICLES);

export const particleComputeLayout = tgpu.bindGroupLayout({
  particles: { storage: ParticleArray, access: 'mutable' },
});

export const particleRenderLayout = tgpu.bindGroupLayout({
  particles: { storage: ParticleArray, access: 'readonly' },
  textTex: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
});

export function createParticles(root: TgpuRoot, configUniform: TgpuUniform<typeof Config>) {
  const particleBuffer = root.createBuffer(ParticleArray).$usage('storage').$name('particles');

  const particleComputeBg = root.createBindGroup(particleComputeLayout, {
    particles: particleBuffer,
  });

  const updateParticles = root.createGuardedComputePipeline((idx: number) => {
    'use gpu';
    const dt = configUniform.$.dt;
    let p = Particle(particleComputeLayout.$.particles[idx]);
    p.life -= dt;

    if (p.life <= 0.0) {
      randf.seed2(d.vec2f(d.f32(idx), configUniform.$.time));
      const randU = randf.sample();
      const randV = randf.sample();
      const testUv = d.vec2f(randU, randV);
      const fluidState = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.linearSampler,
        testUv,
        0.0,
      );
      const temperature = fluidState.w;
      const spawnChance = randf.sample();

      const maskVal = std.textureLoad(
        smokeLayout.$.textSourceTex,
        d.vec2u(testUv * configUniform.$.textureSize),
      ).x;

      if (temperature > 0.8 && spawnChance < 0.4 && maskVal < 0.05) {
        p.pos = testUv * configUniform.$.textureSize;
        p.vel = d.vec2f((randU * 2.0 - 1.0) * 160.0, -50.0 - randf.sample() * 50.0);
        p.maxLife = 0.3 + randf.sample() * 1.0;
        p.life = p.maxLife;
      }
    } else {
      const uv = p.pos / configUniform.$.textureSize;
      const fluidState = std.textureSampleLevel(
        smokeLayout.$.inTex,
        smokeLayout.$.linearSampler,
        uv,
        0.0,
      );
      const fluidVel = fluidState.xy;
      p.vel = p.vel * 0.7 + fluidVel * 0.3;

      p.pos += p.vel * dt;
    }

    particleComputeLayout.$.particles[idx] = Particle(p);
  });

  const particleVertex = tgpu.vertexFn({
    in: {
      vIdx: d.builtin.vertexIndex,
      iIdx: d.builtin.instanceIndex,
    },
    out: {
      pos: d.builtin.position,
      life: d.f32,
      offset: d.vec2f,
      texUv: d.vec2f,
    },
  })((input) => {
    'use gpu';
    const p = Particle(particleRenderLayout.$.particles[input.iIdx]);

    if (p.life <= 0.0) {
      return {
        pos: d.vec4f(-2000.0, -2000.0, 0.0, 1.0),
        life: 0.0,
        offset: d.vec2f(0.0),
        texUv: d.vec2f(0.0),
      };
    }

    const size = configUniform.$.particleSize;
    let offset = d.vec2f(0.0);
    if (input.vIdx === 0) offset = d.vec2f(-1.0, -1.0);
    if (input.vIdx === 1) offset = d.vec2f(1.0, -1.0);
    if (input.vIdx === 2) offset = d.vec2f(-1.0, 1.0);
    if (input.vIdx === 3) offset = d.vec2f(-1.0, 1.0);
    if (input.vIdx === 4) offset = d.vec2f(1.0, -1.0);
    if (input.vIdx === 5) offset = d.vec2f(1.0, 1.0);
    const screenPos = (p.pos / configUniform.$.textureSize) * 2.0 - d.vec2f(1.0);
    const finalPos = screenPos + (offset * size) / configUniform.$.textureSize;
    return {
      pos: d.vec4f(finalPos.x, -finalPos.y, 0.0, 1.0),
      life: p.life / p.maxLife,
      offset: offset,
      texUv: finalPos * 0.5 + d.vec2f(0.5),
    };
  });

  const particleFragment = tgpu.fragmentFn({
    in: { life: d.f32, offset: d.vec2f, texUv: d.vec2f },
    out: { color: d.vec4f },
  })((input) => {
    'use gpu';
    const dist = std.length(input.offset);
    const falloff = d.f32(1.0) - std.smoothstep(0.0, 1.0, dist);
    const intensity = std.max(0.0, input.life);

    // letters occlude sparks (same edge curve as the text overlay in render.ts)
    const uvC = std.clamp(input.texUv, d.vec2f(0.0), d.vec2f(0.9999));
    const mask = std.textureLoad(
      particleRenderLayout.$.textTex,
      d.vec2u(uvC * configUniform.$.textureSize),
    ).x;
    const occlusion = d.f32(1.0) - std.smoothstep(0.15, 0.45, mask);

    const a = intensity * falloff * occlusion;
    return { color: d.vec4f(1.0 * a, 0.5 * a, 0.1 * a, 1.0) };
  });

  const particlePipeline = root.createRenderPipeline({
    vertex: particleVertex,
    fragment: particleFragment,
    targets: {
      color: {
        format: navigator.gpu.getPreferredCanvasFormat(),
        blend: {
          color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
          alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
        },
      },
    },
  });

  return {
    particleBuffer,
    particleComputeBg,
    updateParticles,
    particlePipeline,
    particleVertex,
    particleFragment,
    MAX_PARTICLES,
  };
}

export function createParticleRenderBindGroup(
  root: TgpuRoot,
  {
    particleBuffer,
    textSourceGrid,
  }: {
    particleBuffer: TgpuBuffer<typeof ParticleArray> & StorageFlag;
    textSourceGrid: R32Texture;
  },
) {
  return root.createBindGroup(particleRenderLayout, {
    particles: particleBuffer,
    textTex: textSourceGrid,
  });
}
