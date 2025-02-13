import tgpu from 'typegpu';
import * as d from 'typegpu/data';

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
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

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

const canvasAspectRatioUniform = root['~unstable'].createUniform(
  d.f32,
  canvas.width / canvas.height,
);

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
  .$name('geometry')
  .$usage('vertex');

const particleDataBuffer = root
  .createBuffer(d.arrayOf(ParticleData, PARTICLE_AMOUNT))
  .$usage('storage', 'uniform', 'vertex');

const deltaTimeUniform = root['~unstable'].createUniform(d.f32);
const timeStorage = root['~unstable'].createMutable(d.f32);

const particleDataStorage = particleDataBuffer.as('mutable');

// layouts

const geometryLayout = tgpu
  .vertexLayout((n: number) => d.arrayOf(ParticleGeometry, n), 'instance')
  .$name('geometry');

const dataLayout = tgpu
  .vertexLayout((n: number) => d.arrayOf(ParticleData, n), 'instance')
  .$name('data');

// functions

const rotate = tgpu['~unstable'].fn([d.vec2f, d.f32], d.vec2f).does(/* wgsl */ `
  (v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
      (v.x * cos(angle)) - (v.y * sin(angle)),
      (v.x * sin(angle)) + (v.y * cos(angle))
    );

    return pos;
  }
`);

const mainVert = tgpu['~unstable']
  .vertexFn({
    in: {
      tilt: d.f32,
      angle: d.f32,
      color: d.vec4f,
      center: d.vec2f,
      index: d.builtin.vertexIndex,
    },
    out: VertexOutput,
  })
  .does(
    /* wgsl */ `(input: VertexInput) -> VertexOutput {
    let width = input.tilt;
    let height = input.tilt / 2;

    var pos = rotate(array<vec2f, 4>(
      vec2f(0, 0),
      vec2f(width, 0),
      vec2f(0, height),
      vec2f(width, height),
    )[input.index] / 350, input.angle) + input.center;

    if (canvasAspectRatio < 1) {
      pos.x /= canvasAspectRatio;
    } else {
      pos.y *= canvasAspectRatio;
    }

    return VertexOutput(vec4f(pos, 0.0, 1.0), input.color);
  }`,
  )
  .$uses({
    rotate,
    canvasAspectRatio: canvasAspectRatioUniform,
  });

const mainFrag = tgpu['~unstable']
  .fragmentFn({ in: VertexOutput, out: d.vec4f })
  .does(/* wgsl */ `
  (input: FragmentInput) -> @location(0) vec4f {
    return input.color;
  }`);

const mainCompute = tgpu['~unstable']
  .computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [1] })
  .does(
    /* wgsl */ `(input: ComputeInput) {
    let index = input.gid.x;
    if index == 0 {
      time += deltaTime;
    }
    let phase = (time / 300) + particleData[index].seed;
    particleData[index].position += particleData[index].velocity * deltaTime / 20 + vec2f(sin(phase) / 600, cos(phase) / 500);
  }`,
  )
  .$uses({
    particleData: particleDataStorage,
    deltaTime: deltaTimeUniform,
    time: timeStorage,
  });

// pipelines

const renderPipeline = root['~unstable']
  .withVertex(mainVert, {
    tilt: geometryLayout.attrib.tilt,
    angle: geometryLayout.attrib.angle,
    color: geometryLayout.attrib.color,
    center: dataLayout.attrib.position,
  })
  .withFragment(mainFrag, {
    format: presentationFormat,
  })
  .withPrimitive({
    topology: 'triangle-strip',
  })
  .createPipeline()
  .$name('draw confetti')
  .with(geometryLayout, particleGeometryBuffer)
  .with(dataLayout, particleDataBuffer);

const computePipeline = root['~unstable']
  .withCompute(mainCompute)
  .createPipeline()
  .$name('move particles');

// compute and draw

function randomizePositions() {
  particleDataBuffer.write(
    Array(PARTICLE_AMOUNT)
      .fill(0)
      .map(() => ({
        position: d.vec2f(Math.random() * 2 - 1, Math.random() * 2 + 1),
        velocity: d.vec2f(
          (Math.random() * 2 - 1) / 50,
          -(Math.random() / 25 + 0.01),
        ),
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

onFrame((deltaTime) => {
  deltaTimeUniform.write(deltaTime);
  canvasAspectRatioUniform.write(canvas.width / canvas.height);

  computePipeline.dispatchWorkgroups(PARTICLE_AMOUNT);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    })
    .draw(4, PARTICLE_AMOUNT);

  root['~unstable'].flush();
});

// example controls and cleanup

export const controls = {
  '🎉': {
    onButtonClick: () => randomizePositions(),
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
}
