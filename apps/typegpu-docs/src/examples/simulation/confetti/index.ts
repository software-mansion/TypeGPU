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

// buffers

const particleGeometryBuffer = root
  .createBuffer(
    d.arrayOf(ParticleGeometry, PARTICLE_AMOUNT),
    Array(PARTICLE_AMOUNT)
      .fill(0)
      .map(() => ({
        angle: Math.floor(Math.random() * 50) - 10,
        tilt: Math.floor(Math.random() * 10) - 10 - 10,
        color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
      })),
  )
  .$usage('vertex');

const particleDataBuffer = root
  .createBuffer(d.arrayOf(ParticleData, PARTICLE_AMOUNT))
  .$usage('storage', 'uniform', 'vertex');

const aspectRatio = root.createUniform(d.f32, canvas.width / canvas.height);
const deltaTime = root.createUniform(d.f32);
const time = root.createMutable(d.f32);

const particleDataStorage = particleDataBuffer.as('mutable');

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

const mainVert = tgpu.vertexFn({
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

  if (aspectRatio < 1) {
    pos.x /= aspectRatio;
  } else {
    pos.y *= aspectRatio;
  }

  return Out(vec4f(pos, 0.0, 1.0), in.color);
}`.$uses({
  rotate,
  aspectRatio,
});

const mainFrag = tgpu.fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
}) /* wgsl */ `{ return in.color; }`;

const mainCompute = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
}) /* wgsl */ `{
  let index = in.gid.x;
  if index == 0 {
    time += deltaTime;
  }
  let phase = (time / 300) + particleData[index].seed;
  particleData[index].position += particleData[index].velocity * deltaTime / 20 + vec2f(sin(phase) / 600, cos(phase) / 500);
}`.$uses({
  particleData: particleDataStorage,
  deltaTime,
  time,
});

// pipelines

const renderPipeline = root
  .createRenderPipeline({
    vertex: mainVert,
    fragment: mainFrag,
    attribs: {
      tilt: geometryLayout.attrib.tilt,
      angle: geometryLayout.attrib.angle,
      color: geometryLayout.attrib.color,
      center: dataLayout.attrib.position,
    },

    primitive: {
      topology: 'triangle-strip',
    },
  })
  .with(geometryLayout, particleGeometryBuffer)
  .with(dataLayout, particleDataBuffer);

const computePipeline = root.createComputePipeline({ compute: mainCompute });

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

let disposed = false;

function onFrame(loop: (deltaTime: number) => unknown) {
  let lastTime = Date.now();
  const runner = () => {
    if (disposed) {
      return;
    }
    const now = Date.now();
    const dt = now - lastTime;
    lastTime = now;
    loop(dt);
    requestAnimationFrame(runner);
  };
  requestAnimationFrame(runner);
}

onFrame((dt) => {
  deltaTime.write(dt);
  aspectRatio.write(canvas.width / canvas.height);

  computePipeline.dispatchWorkgroups(PARTICLE_AMOUNT);

  renderPipeline.withColorAttachment({ view: context }).draw(4, PARTICLE_AMOUNT);
});

// example controls and cleanup

export const controls = defineControls({
  '🎉': {
    onButtonClick: randomizePositions,
  },
});

export function onCleanup() {
  disposed = true;
  root.destroy();
}
