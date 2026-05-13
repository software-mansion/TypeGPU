import { sdBox2d } from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';

const PARTICLE_COUNT = 96;
const PARTICLE_HALF_SIZE = 0.0065;

const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});
const ParticleArray = d.arrayOf(Particle, PARTICLE_COUNT);

export type ParticleValue = {
  position: d.v2f;
  velocity: d.v2f;
};

export type BufferIndex = 0 | 1 | 2;

export const BUFFER_COLORS = [
  d.vec3f(0.4, 0.91, 0.98),
  d.vec3f(0.98, 0.66, 0.83),
  d.vec3f(0.75, 0.95, 0.39),
] as const;

function createOrbitState(): ParticleValue[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const t = (i / PARTICLE_COUNT) * Math.PI * 2;
    const radius = 0.28 + Math.sin(i * 0.7) * 0.045;
    const tangent = t + Math.PI / 2;

    return {
      position: d.vec2f(0.5 + Math.cos(t) * radius, 0.5 + Math.sin(t) * radius),
      velocity: d.vec2f(Math.cos(tangent) * 0.0065, Math.sin(tangent) * 0.0065),
    };
  });
}

function createDriftState(): ParticleValue[] {
  const columns = 12;
  const rows = PARTICLE_COUNT / columns;

  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const x = i % columns;
    const y = Math.floor(i / columns);
    const offset = Math.sin(i * 1.37) * 0.012;

    return {
      position: d.vec2f((x + 0.5) / columns, (y + 0.5) / rows + offset),
      velocity: d.vec2f(0.009, 0.004),
    };
  });
}

function createBurstState(): ParticleValue[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const t = (i / PARTICLE_COUNT) * Math.PI * 2;
    const ring = (i % 12) / 12;
    const radius = 0.03 + ring * 0.12;
    const speed = 0.004 + ring * 0.007;

    return {
      position: d.vec2f(0.5 + Math.cos(t) * radius, 0.5 + Math.sin(t) * radius),
      velocity: d.vec2f(Math.cos(t) * speed, Math.sin(t) * speed),
    };
  });
}

const INITIAL_STATES = [createOrbitState(), createDriftState(), createBurstState()] as const;

export async function createBindGroupProgram(canvas: HTMLCanvasElement) {
  const root = await tgpu.init();
  const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

  const computeLayout = tgpu.bindGroupLayout({
    particles: { storage: ParticleArray, access: 'mutable' },
  });
  const displayLayout = tgpu.bindGroupLayout({
    particles: { storage: ParticleArray },
  });

  const particleBuffers = INITIAL_STATES.map((state) =>
    root.createBuffer(ParticleArray, state).$usage('storage'),
  );
  const computeBindGroups = particleBuffers.map((particles) =>
    root.createBindGroup(computeLayout, { particles }),
  );
  const displayBindGroups = particleBuffers.map((particles) =>
    root.createBindGroup(displayLayout, { particles }),
  );

  const particleColor = root.createUniform(d.vec3f, BUFFER_COLORS[0]);

  const simulate = root.createGuardedComputePipeline((i) => {
    'use gpu';
    const particle = computeLayout.$.particles[i];
    computeLayout.$.particles[i].position = std.fract(particle.position.add(particle.velocity));
  });

  const render = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu';
      const background = d.vec3f(0.09, 0.08, 0.15);
      const gridColor = d.vec3f(0.19, 0.18, 0.29);
      const gridUv = std.fract(uv.mul(8));
      const verticalGrid = std.min(gridUv.x, 1 - gridUv.x);
      const horizontalGrid = std.min(gridUv.y, 1 - gridUv.y);
      const gridDistance = std.min(verticalGrid, horizontalGrid);
      const gridMask = 1 - std.smoothstep(0.003, 0.007, gridDistance);

      let particleDistance = d.f32(1);
      for (const particle of displayLayout.$.particles) {
        const offset = std.abs(uv.sub(particle.position));
        const wrappedOffset = std.min(offset, d.vec2f(1).sub(offset));
        particleDistance = std.min(
          particleDistance,
          sdBox2d(wrappedOffset, d.vec2f(PARTICLE_HALF_SIZE)),
        );
      }

      const particleMask = 1 - std.smoothstep(0, std.fwidth(particleDistance), particleDistance);
      const withGrid = std.mix(background, gridColor, gridMask);
      const withParticles = std.mix(withGrid, particleColor.$, particleMask);

      return d.vec4f(withParticles, 1);
    },
  });

  function resizeCanvasToDisplaySize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.min(1024, Math.max(1, Math.round(canvas.clientWidth * pixelRatio)));
    const height = Math.min(1024, Math.max(1, Math.round(canvas.clientHeight * pixelRatio)));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(bufferIndex: BufferIndex) {
    const displayBindGroup = displayBindGroups[bufferIndex];
    if (!displayBindGroup) {
      return;
    }
    resizeCanvasToDisplaySize();
    particleColor.write(BUFFER_COLORS[bufferIndex]);
    render.with(displayBindGroup).withColorAttachment({ view: context }).draw(3);
  }

  return {
    computeBindGroups,
    draw,
    particleCount: PARTICLE_COUNT,
    root,
    simulate,
  };
}
