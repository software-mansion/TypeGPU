import tgpu, { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

// constants

const PARTICLE_AMOUNT = 200;
const COLOR_PALETTE: d.v4f[] = [
  [255, 190, 11],
  [251, 86, 7],
  [255, 0, 110],
  [131, 56, 236],
  [58, 134, 255],
].map(([r, g, b]) => d.vec4f(r / 255, g / 255, b / 255, 1));

// setup

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// data types

const ParticleGeometry = d.struct({
  color: d.vec4f,
  tilt: d.f32,
  angle: d.f32,
});

const ParticleData = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
  seed: d.f32,
});

// buffers

const particleGeometryBuffer = root
  .createBuffer(
    d.arrayOf(ParticleGeometry, PARTICLE_AMOUNT),
    Array.from({ length: PARTICLE_AMOUNT }, () => ({
      color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
      tilt: Math.floor(Math.random() * 10) - 10 - 10,
      angle: Math.floor(Math.random() * 50) - 10,
    })),
  )
  .$usage('vertex');

const particleDataBuffer = root
  .createBuffer(d.arrayOf(ParticleData, PARTICLE_AMOUNT))
  .$usage('storage', 'uniform', 'vertex');

let elapsedTime = 0;
const aspectRatio = root.createUniform(d.f32, canvas.width / canvas.height);
const deltaTime = root.createUniform(d.f32);
const time = root.createUniform(d.f32);

const particleDataStorage = particleDataBuffer.as('mutable');

// layouts

const geometryLayout = tgpu.vertexLayout(d.arrayOf(ParticleGeometry), 'instance');
const dataLayout = tgpu.vertexLayout(d.arrayOf(ParticleData), 'instance');

// functions

const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  return d.vec2f(
    v.x * std.cos(angle) - v.y * std.sin(angle),
    v.x * std.sin(angle) + v.y * std.cos(angle),
  );
};

// pipelines

const renderPipeline = root
  .createRenderPipeline({
    attribs: {
      ...geometryLayout.attrib,
      center: dataLayout.attrib.position,
    },
    vertex: ({ tilt, angle, color, center, $vertexIndex }) => {
      'use gpu';
      const width = tilt / 350;
      const height = width / 2;

      const local = [d.vec2f(0, 0), d.vec2f(width, 0), d.vec2f(0, height), d.vec2f(width, height)];
      const pos = rotate(local[$vertexIndex], angle) + center;

      if (aspectRatio.$ < 1) {
        pos.x /= aspectRatio.$;
      } else {
        pos.y *= aspectRatio.$;
      }

      return { $position: d.vec4f(pos, 0, 1), color };
    },
    fragment: ({ color }) => {
      'use gpu';
      return color;
    },
    primitive: { topology: 'triangle-strip' },
  })
  .with(geometryLayout, particleGeometryBuffer)
  .with(dataLayout, particleDataBuffer);

const computePipeline = root.createGuardedComputePipeline((index) => {
  'use gpu';
  const phase = time.$ / 300 + particleDataStorage.$[index].seed;
  particleDataStorage.$[index].position +=
    (particleDataStorage.$[index].velocity * deltaTime.$) / 20 +
    d.vec2f(std.sin(phase) / 600, std.cos(phase) / 500);
});

// compute and draw

function randomizePositions() {
  particleDataBuffer.write(
    Array(PARTICLE_AMOUNT)
      .fill(0)
      .map(() => ({
        position: d.vec2f(Math.random() * 2 - 1, Math.random() * 2 + 1),
        velocity: d.vec2f((Math.random() * 2 - 1) / 50, -(Math.random() / 25 + 0.01)),
        seed: Math.random(),
      })),
  );
}

randomizePositions();

let animationFrameId: number;
let lastTime: number | null = null;

const runner = (timestamp: number) => {
  const dt = lastTime !== null ? timestamp - lastTime : 0;
  lastTime = timestamp;

  elapsedTime += dt;
  time.write(elapsedTime);
  deltaTime.write(dt);
  aspectRatio.write(canvas.width / canvas.height);

  // Simulating the physics
  computePipeline.dispatchThreads(PARTICLE_AMOUNT);

  // Drawing the particles
  renderPipeline.withColorAttachment({ view: context }).draw(4, PARTICLE_AMOUNT);
  animationFrameId = requestAnimationFrame(runner);
};

animationFrameId = requestAnimationFrame(runner);

// example controls and cleanup

export const controls = defineControls({
  '🎉': {
    onButtonClick: randomizePositions,
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  root.destroy();
}
