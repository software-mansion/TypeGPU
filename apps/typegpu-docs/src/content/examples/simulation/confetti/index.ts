import { arrayOf, f32, struct, vec2f, vec4f } from 'typegpu/data';
import tgpu, { asUniform, builtin } from 'typegpu/experimental';

// constants

const PARTICLE_AMOUNT = 200;
const COLOR_PALETTE: vec4f[] = [
  [255, 190, 11],
  [251, 86, 7],
  [255, 0, 110],
  [131, 56, 236],
  [58, 134, 255],
].map(([r, g, b]) => vec4f(r / 255, g / 255, b / 255, 1));

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
  position: builtin.position,
  color: vec4f,
};

const ParticleGeometry = struct({
  tilt: f32,
  angle: f32,
  color: vec4f,
});

const ParticleData = struct({
  position: vec2f,
  velocity: vec2f,
  seed: f32,
});

// buffers

const canvasAspectRatioBuffer = root
  .createBuffer(f32, canvas.width / canvas.height)
  .$usage('uniform');

const canvasAspectRatioData = asUniform(canvasAspectRatioBuffer);

const particleShapeBuffer = root
  .createBuffer(
    arrayOf(ParticleGeometry, PARTICLE_AMOUNT),
    Array(PARTICLE_AMOUNT)
      .fill(0)
      .map(() => ({
        angle: Math.floor(Math.random() * 50) - 10,
        tilt: Math.floor(Math.random() * 10) - 10 - 10,
        color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
      })),
  )
  .$usage('vertex');

const trianglePosBuffer = root
  .createBuffer(arrayOf(ParticleData, PARTICLE_AMOUNT))
  .$usage('storage', 'uniform', 'vertex');

// layouts and groups

const geometryLayout = tgpu.vertexLayout(
  (n: number) => arrayOf(ParticleGeometry, n),
  'instance',
);

const positionLayout = tgpu.vertexLayout(
  (n: number) => arrayOf(ParticleData, n),
  'instance',
);

const computeLayout = tgpu.bindGroupLayout({
  data: {
    storage: arrayOf(ParticleData, PARTICLE_AMOUNT),
    access: 'mutable',
  },
});

const { data } = computeLayout.bound;

const computeBindGroup = computeLayout.populate({
  data: trianglePosBuffer,
});

// functions

const rotate = tgpu.fn([vec2f, f32], vec2f).does(/* wgsl */ `
  (v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
      (v.x * cos(angle)) - (v.y * sin(angle)),
      (v.x * sin(angle)) + (v.y * cos(angle))
    );

    return pos;
  }
`);

const mainVert = tgpu
  .vertexFn(
    { tilt: f32, angle: f32, color: vec4f, center: vec2f },
    VertexOutput,
  )
  .does(
    /* wgsl */ `(
      @location(0) tilt: f32, 
      @location(1) angle: f32, 
      @location(2) color: vec4f, 
      @location(3) center: vec2f, 
      @builtin(vertex_index) index: u32
    ) -> VertexOutput {
    let width = tilt;
    let height = tilt / 2;

    var pos = rotate(array<vec2f, 6>(
      vec2f(0, 0),
      vec2f(width, 0),
      vec2f(width, height),

      vec2f(width, height),
      vec2f(0, height),
      vec2f(0, 0),
    )[index] / 350, angle) + center;

    if (canvasAspectRatio < 1) {
      pos.x /= canvasAspectRatio;
    } else {
      pos.y *= canvasAspectRatio;
    }

    return VertexOutput(vec4f(pos, 0.0, 1.0), color);
  }`,
  )
  .$uses({
    rotate,
    canvasAspectRatio: canvasAspectRatioData,
    get VertexOutput() {
      return mainVert.Output;
    },
  });

const mainFrag = tgpu.fragmentFn(VertexOutput, vec4f).does(/* wgsl */ `
  (@location(0) color: vec4f) -> @location(0) vec4f {
    return color;
  }`);

const mainCompute = tgpu
  .computeFn([1])
  .does(
    /* wgsl */ `(@builtin(global_invocation_id) gid: vec3u) {
    let index = gid.x;
    let phase = data[index].position.y * 10 + data[index].position.x * 10 + data[index].seed; 
    data[index].position += data[index].velocity + vec2f(sin(phase), cos(phase))/1000;
  }`,
  )
  .$uses({ data });

// pipelines

const renderPipeline = root
  .withVertex(mainVert, {
    tilt: geometryLayout.attrib.tilt,
    angle: geometryLayout.attrib.angle,
    color: geometryLayout.attrib.color,
    center: positionLayout.attrib.position,
  })
  .withFragment(mainFrag, {
    format: presentationFormat,
  })
  .createPipeline()
  .with(geometryLayout, particleShapeBuffer)
  .with(positionLayout, trianglePosBuffer);

const computePipeline = root.withCompute(mainCompute).createPipeline();

// compute and draw

const randomizePositions = () =>
  trianglePosBuffer.write(
    Array(PARTICLE_AMOUNT)
      .fill(0)
      .map(() => ({
        position: vec2f(Math.random() * 2 - 1, Math.random() * 2 + 1),
        velocity: vec2f(
          (Math.random() * 2 - 1) / 50,
          -(Math.random() / 25 + 0.01),
        ),
        seed: Math.random(),
      })),
  );

randomizePositions();

let disposed = false;

function frame() {
  if (disposed) {
    return;
  }

  canvasAspectRatioBuffer.write(canvas.width / canvas.height);

  computePipeline
    .with(computeLayout, computeBindGroup)
    .dispatchWorkgroups(PARTICLE_AMOUNT);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    })
    .draw(6, PARTICLE_AMOUNT);

  root.flush();

  requestAnimationFrame(frame);
}

frame();

// example controls and cleanup

export const controls = {
  '🎉': {
    onButtonClick: () => randomizePositions(),
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
  root.device.destroy();
}
