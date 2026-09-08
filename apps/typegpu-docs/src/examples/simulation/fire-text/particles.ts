import { tgpu, d, std } from 'typegpu';
import { randf } from '@typegpu/noise';
import { particleComputeLayout, particleRenderLayout } from './layouts.ts';
import { clockAccess, Particle } from './params.ts';
import { tintByFireColor } from './render.ts';
import { textureWidth } from './utils.ts';

const SPARK_COLOR = d.vec3f(1, 0.5, 0.1);

export const updateParticles = tgpu.computeFn({
  workgroupSize: [256],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const idx = gid.x;
  const dt = clockAccess.$.dt;
  const time = clockAccess.$.time;

  const size = textureWidth(particleComputeLayout.$.inTex);
  let p = Particle(particleComputeLayout.$.particles[idx]);
  p.life -= dt;

  if (p.life <= 0) {
    randf.seed2(d.vec2f(idx, time));
    const randU = randf.sample();
    const randV = randf.sample();
    const testUv = d.vec2f(randU, randV);
    const texel = d.vec2i(testUv * size);
    const fluidState = std.textureLoad(particleComputeLayout.$.inTex, texel, 0);
    const temperature = fluidState.w;
    const spawnChance = randf.sample();

    const maskVal = std.textureLoad(particleComputeLayout.$.textTex, texel, 0).x;

    if (temperature > 0.8 && spawnChance < 0.4 && maskVal < 0.05) {
      p.pos = testUv * size;
      p.vel = d.vec2f((randU * 2 - 1) * 160, -50 - randf.sample() * 50);
      p.maxLife = 0.3 + randf.sample();
      p.life = p.maxLife;
    }
  } else {
    const uv = p.pos / size;
    const fluidState = std.textureSampleLevel(
      particleComputeLayout.$.inTex,
      particleComputeLayout.$.linearSampler,
      uv,
      0,
    );
    p.vel = p.vel * 0.7 + fluidState.xy * 0.3;
    p.pos += p.vel * dt;
  }

  particleComputeLayout.$.particles[idx] = Particle(p);
});

export const particleSizeAccess = tgpu.accessor(d.f32);
export const particleVertex = tgpu.vertexFn({
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

  if (p.life <= 0) {
    return {
      pos: d.vec4f(-2000, -2000, 0, 1),
      life: 0,
      offset: d.vec2f(),
      texUv: d.vec2f(),
    };
  }

  const size = textureWidth(particleRenderLayout.$.textTex);
  const offset = [d.vec2f(-1, -1), d.vec2f(1, -1), d.vec2f(-1, 1), d.vec2f(1, 1)][input.vIdx];
  const screenPos = (p.pos / size) * 2 - 1;
  const finalPos = screenPos + (offset * particleSizeAccess.$) / size;
  return {
    pos: d.vec4f(finalPos.x, -finalPos.y, 0, 1),
    life: p.life / p.maxLife,
    offset,
    texUv: finalPos * 0.5 + 0.5,
  };
});

export const particleFragment = tgpu.fragmentFn({
  in: { life: d.f32, offset: d.vec2f, texUv: d.vec2f },
  out: { color: d.vec4f },
})((input) => {
  'use gpu';
  const dist = std.length(input.offset);
  const falloff = d.f32(1) - std.smoothstep(0, 1, dist);
  const intensity = std.max(0, input.life);

  const size = textureWidth(particleRenderLayout.$.textTex);
  const uvC = std.clamp(input.texUv, d.vec2f(), d.vec2f(0.9999));
  const mask = std.textureLoad(particleRenderLayout.$.textTex, d.vec2i(uvC * size), 0).x;
  const occlusion = d.f32(1) - std.smoothstep(0.15, 0.45, mask);

  const a = intensity * falloff * occlusion;
  return { color: d.vec4f(tintByFireColor(SPARK_COLOR) * a, 1) };
});
