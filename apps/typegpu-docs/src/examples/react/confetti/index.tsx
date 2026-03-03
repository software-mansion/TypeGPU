import tgpu, { d, std } from 'typegpu';
import { useFrame, useRoot, useBuffer, useUniformValue, useMutable } from '@typegpu/react';

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

const VertexOutput = {
  position: d.builtin.position,
  color: d.vec4f,
};

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

const rotate = tgpu.fn(
  [d.vec2f, d.f32],
  d.vec2f,
)((v, angle) => {
  const pos = d.vec2f(
    v.x * std.cos(angle) - v.y * std.sin(angle),
    v.x * std.sin(angle) + v.y * std.cos(angle),
  );

  return pos;
});

const mainFrag = tgpu.fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
}) /* wgsl */ `{ return in.color; }`;

// compute and draw

function createRandomPositions() {
  return Array.from({ length: PARTICLE_AMOUNT }, () => ({
    position: d.vec2f(Math.random() * 2 - 1, Math.random() * 2 + 1),
    velocity: d.vec2f((Math.random() * 2 - 1) / 50, -(Math.random() / 25 + 0.01)),
    seed: Math.random(),
  }));
}

function App() {
  const root = useRoot();
  const ctxRef = useRef<GPUCanvasContext | null>(null);

  // buffers

  const particleGeometryBuffer = useBuffer(d.arrayOf(ParticleGeometry, PARTICLE_AMOUNT), () =>
    Array.from({ length: PARTICLE_AMOUNT }, () => ({
      angle: Math.floor(Math.random() * 50) - 10,
      tilt: Math.floor(Math.random() * 10) - 10 - 10,
      color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
    })),
  ).$usage('vertex');

  const particleDataBuffer = useBuffer(
    d.arrayOf(ParticleData, PARTICLE_AMOUNT),
    createRandomPositions,
  ).$usage('storage', 'uniform', 'vertex');

  const aspectRatio = useUniformValue(d.f32, 1);
  const deltaTime = useUniformValue(d.f32);
  const time = useMutable(d.f32);

  const particleDataStorage = particleDataBuffer.as('mutable');

  const mainCompute = useMemo(
    () =>
      tgpu.computeFn({
        in: { gid: d.builtin.globalInvocationId },
        workgroupSize: [1],
      })(({ gid }) => {
        'use gpu';
        let index = gid.x;
        if (index === 0) {
          time.$ += deltaTime.$;
        }
        let phase = time.$ / 300 + particleDataStorage.$[index].seed;
        particleDataStorage.$[index].position +=
          (particleDataStorage.$[index].velocity * deltaTime.$) / 20 +
          d.vec2f(std.sin(phase) / 600, std.cos(phase) / 500);
      }),
    [particleDataStorage, deltaTime, time],
  );

  const mainVert = useMemo(
    () =>
      tgpu.vertexFn({
        in: {
          tilt: d.f32,
          angle: d.f32,
          color: d.vec4f,
          center: d.vec2f,
          index: d.builtin.vertexIndex,
        },
        out: VertexOutput,
      }) /* wgsl */ `{
      let width = in.tilt;
      let height = in.tilt / 2;

      var pos = rotate(array<vec2f, 4>(
        vec2f(0, 0),
        vec2f(width, 0),
        vec2f(0, height),
        vec2f(width, height),
      )[in.index] / 350, in.angle) + in.center;

      if (aspectRatio.$ < 1) {
        pos.x /= aspectRatio.$;
      } else {
        pos.y *= aspectRatio.$;
      }

      return Out(vec4f(pos, 0.0, 1.0), in.color);
    }`.$uses({
        rotate,
        aspectRatio,
      }),
    [rotate, aspectRatio],
  );

  // pipelines
  //
  const renderPipeline = useMemo(
    () =>
      root
        .createRenderPipeline({
          attribs: {
            tilt: geometryLayout.attrib.tilt,
            angle: geometryLayout.attrib.angle,
            color: geometryLayout.attrib.color,
            center: dataLayout.attrib.position,
          },
          // vertex: mainVert,
          vertex: (input) => {
            'use gpu';
            const width = input.tilt;
            const height = input.tilt / 2;

            const verts = [
              d.vec2f(0, 0),
              d.vec2f(width, 0),
              d.vec2f(0, height),
              d.vec2f(width, height),
            ];

            const pos = rotate(verts[input.$vertexIndex] / 350, input.angle) + input.center;

            if (aspectRatio.$ < 1) {
              pos.x /= aspectRatio.$;
            } else {
              pos.y *= aspectRatio.$;
            }

            return { $position: d.vec4f(pos, 0, 1), color: input.color };
          },
          fragment: mainFrag,
          primitive: {
            topology: 'triangle-strip',
          },
        })
        .with(geometryLayout, particleGeometryBuffer)
        .with(dataLayout, particleDataBuffer),
    [mainVert, mainFrag, particleGeometryBuffer, particleDataBuffer, aspectRatio],
  );

  const computePipeline = root.createComputePipeline({ compute: mainCompute });

  useFrame(({ deltaSeconds }) => {
    const context = ctxRef.current;
    if (!context) {
      return;
    }

    const canvas = context.canvas as HTMLCanvasElement;
    deltaTime.value = deltaSeconds * 1000;
    aspectRatio.value = canvas.width / canvas.height;

    computePipeline.dispatchWorkgroups(PARTICLE_AMOUNT);
    renderPipeline.withColorAttachment({ view: context }).draw(4, PARTICLE_AMOUNT);
  });

  const canvasRefCallback = useCallback((el: HTMLCanvasElement | null) => {
    if (el) {
      ctxRef.current = root.configureContext({ canvas: el, alphaMode: 'premultiplied' });
    } else {
      ctxRef.current = null;
    }
  }, []);

  return (
    <div>
      <canvas ref={canvasRefCallback}></canvas>
      <button type="button" onClick={() => particleDataBuffer.write(createRandomPositions())}>
        🎉
      </button>
    </div>
  );
}

// example controls and cleanup

// #region Example controls and cleanup

import { createRoot } from 'react-dom/client';
import { useCallback, useMemo, useRef } from 'react';
const reactRoot = createRoot(document.getElementById('example-app') as HTMLDivElement);
reactRoot.render(<App />);

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
