import tgpu, { d, std, type TgpuVertexFn } from 'typegpu';
import {
  useFrame,
  useRoot,
  useBuffer,
  useUniformValue,
  useConfigureContext,
  useBindGroup,
} from '@typegpu/react';
import { useMemo } from 'react';

// constants

const PARTICLE_AMOUNT = 200;
const COLOR_PALETTE: d.v4f[] = [
  [255, 190, 11],
  [251, 86, 7],
  [255, 0, 110],
  [131, 56, 236],
  [58, 134, 255],
].map(([r, g, b]) => d.vec4f(r / 255, g / 255, b / 255, 1));

// data types

const ParticleGeometry = d.struct({
  tilt: d.f32,
  angle: d.f32,
  color: d.vec4f,
});

const ParticleData = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
  seed: d.f32,
});

// layouts

const geometryLayout = tgpu.vertexLayout(d.arrayOf(ParticleGeometry), 'instance');
const dataLayout = tgpu.vertexLayout(d.arrayOf(ParticleData), 'instance');

// functions

const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const pos = d.vec2f(
    v.x * std.cos(angle) - v.y * std.sin(angle),
    v.x * std.sin(angle) + v.y * std.cos(angle),
  );

  return pos;
};

function createRandomPositions() {
  return Array.from({ length: PARTICLE_AMOUNT }, () => ({
    position: d.vec2f(Math.random() * 2 - 1, Math.random() * 2 + 1),
    velocity: d.vec2f((Math.random() * 2 - 1) / 50, -(Math.random() / 25 + 0.01)),
    seed: Math.random(),
  }));
}

const computeLayout = tgpu.bindGroupLayout({
  time: { uniform: d.f32 },
  deltaTime: { uniform: d.f32 },
  particleData: { storage: d.arrayOf(ParticleData), access: 'mutable' },
});

const simulate = (idx: number) => {
  'use gpu';
  const particleData = computeLayout.$.particleData[idx];
  const phase = computeLayout.$.time / 300 + particleData.seed;

  particleData.position +=
    (particleData.velocity * computeLayout.$.deltaTime) / 20 +
    d.vec2f(std.sin(phase) / 600, std.cos(phase) / 500);
};

const renderLayout = tgpu.bindGroupLayout({
  time: { uniform: d.f32 },
  aspectRatio: { uniform: d.f32 },
});

const attribs = {
  ...geometryLayout.attrib,
  center: dataLayout.attrib.position,
};

const vertexShader = (input: TgpuVertexFn.AutoIn<typeof attribs>) => {
  'use gpu';
  const width = input.tilt;
  const height = input.tilt / 2;

  const verts = [d.vec2f(0, 0), d.vec2f(width, 0), d.vec2f(0, height), d.vec2f(width, height)];

  const pos = rotate(verts[input.$vertexIndex] / 350, input.angle) + input.center;

  if (renderLayout.$.aspectRatio < 1) {
    pos.x /= renderLayout.$.aspectRatio;
  } else {
    pos.y *= renderLayout.$.aspectRatio;
  }

  return {
    $position: d.vec4f(pos, 0, 1),
    color: input.color,
  } satisfies TgpuVertexFn.AutoOut;
};

function App() {
  const root = useRoot();
  const { canvasRefCallback, ctxRef } = useConfigureContext();

  // buffers

  const particleGeometryBuffer = useBuffer(d.arrayOf(ParticleGeometry, PARTICLE_AMOUNT), {
    initial: () =>
      Array.from({ length: PARTICLE_AMOUNT }, () => ({
        angle: Math.floor(Math.random() * 50) - 10,
        tilt: Math.floor(Math.random() * 10) - 10 - 10,
        color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
      })),
  }).$usage('vertex');

  const particleDataBuffer = useBuffer(d.arrayOf(ParticleData, PARTICLE_AMOUNT), {
    initial: createRandomPositions,
  }).$usage('storage', 'uniform', 'vertex');

  const aspectRatio = useUniformValue(d.f32, 1);
  const deltaTime = useUniformValue(d.f32);
  const time = useUniformValue(d.f32);

  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        attribs,
        vertex: vertexShader,
        fragment: ({ color }) => {
          'use gpu';
          return color;
        },
        primitive: {
          topology: 'triangle-strip',
        },
      }),
    [],
  );

  const computePipeline = useMemo(() => root.createGuardedComputePipeline(simulate), []);

  const computeGroup = useBindGroup(computeLayout, {
    deltaTime,
    particleData: particleDataBuffer,
    time,
  });

  const renderGroup = useBindGroup(renderLayout, { time, aspectRatio });

  useFrame(({ deltaSeconds, elapsedSeconds }) => {
    const context = ctxRef.current;
    if (!context) {
      return;
    }

    const canvas = context.canvas as HTMLCanvasElement;
    time.value = elapsedSeconds * 1000;
    deltaTime.value = deltaSeconds * 1000;
    aspectRatio.value = canvas.width / canvas.height;

    computePipeline.with(computeGroup).dispatchThreads(PARTICLE_AMOUNT);
    renderPipeline
      .with(renderGroup)
      .with(geometryLayout, particleGeometryBuffer)
      .with(dataLayout, particleDataBuffer)
      .withColorAttachment({ view: context })
      .draw(4, PARTICLE_AMOUNT);
  });

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRefCallback}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          className="text-4xl shadow rounded p-4"
          onClick={() => particleDataBuffer.write(createRandomPositions())}
        >
          🎉
        </button>
      </div>
    </div>
  );
}

// example controls and cleanup

// #region Example controls and cleanup

import { createRoot } from 'react-dom/client';
const reactRoot = createRoot(document.getElementById('example-app') as HTMLDivElement);
reactRoot.render(<App />);

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
