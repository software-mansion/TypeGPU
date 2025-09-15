import tgpu, {
  type TgpuBindGroup,
  type TgpuBuffer,
  type VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import * as std from 'typegpu/std';

// == BORING ROOT STUFF ==
const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// == DATA STRUCTURES ==
const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
});

const Camera = d.struct({
  position: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const Transform = d.struct({
  model: d.mat4x4f,
});

const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

// == SCENE ==
const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(12, 5, 12, 1);

const cameraInitial: d.Infer<typeof Camera> = {
  position: cameraInitialPos,
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

// == GEOMETRY ==
const getColor = (_: number): d.Infer<typeof Vertex>['color'] => {
  return d.vec4f(d.vec3f(Math.random()), 1);
};

const hardcodedTwoTriangles = [
  [-1, 0, 1, 1],
  [1, 0, 1, 1],
  [1, 0, -1, 1],
  [-1, 0, 1, 1],
  [1, 0, -1, 1],
  [-1, 0, -1, 1],
];

const createPlane = (
  width: number,
  height: number,
): d.Infer<typeof Vertex>[] => {
  return hardcodedTwoTriangles.map((pos) => ({
    position: d.vec4f(...(pos as [number, number, number, number])),
    color: getColor(0),
  }));
};

const getPlaneTransform = (
  translation: d.v3f,
  scale: d.v3f,
): d.Infer<typeof Transform> => {
  return {
    model: m.mat4.scale(
      m.mat4.translate(m.mat4.identity(d.mat4x4f()), translation, d.mat4x4f()),
      scale,
      d.mat4x4f(),
    ),
  };
};

// == BUFFERS ==
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

const planeBuffer = root
  .createBuffer(vertexLayout.schemaForCount(6), createPlane(0, 0))
  .$usage('vertex');

const planeTransformBuffer = root
  .createBuffer(
    Transform,
    getPlaneTransform(d.vec3f(0, -2, 0), d.vec3f(5, 1, 5)),
  )
  .$usage('uniform');

const layout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  transform: { uniform: Transform },
});

const planeBindGroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: planeTransformBuffer,
});

// == TEXTURES ==
let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let msaaTexture: GPUTexture;
let msaaTextureView: GPUTextureView;

// definitely not pure function
const createDepthAndMsaaTextures = () => {
  if (depthTexture) {
    depthTexture.destroy();
  }
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  depthTextureView = depthTexture.createView();

  if (msaaTexture) {
    msaaTexture.destroy();
  }
  msaaTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: presentationFormat,
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  msaaTextureView = msaaTexture.createView();
};
createDepthAndMsaaTextures();

// == SHADERS ==
const vertex = tgpu['~unstable'].vertexFn({
  in: { position: d.vec4f, color: d.vec4f },
  out: { pos: d.builtin.position, color: d.vec4f },
})((input) => {
  const pos = std.mul(
    layout.$.camera.projection,
    std.mul(
      layout.$.camera.view,
      std.mul(layout.$.transform.model, input.position),
    ),
  );
  return { pos, color: input.color };
});

const fragment = tgpu['~unstable'].fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => input.color);

const pipeline = root['~unstable']
  .withVertex(vertex, vertexLayout.attrib)
  .withFragment(fragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withMultisample({
    count: 4,
  })
  .createPipeline();

// == RENDER LOOP ==
const drawObject = (
  buffer: TgpuBuffer<d.WgslArray<typeof Vertex>> & VertexFlag,
  group: TgpuBindGroup<typeof layout.entries>,
  vertexCount: number,
  loadOp: 'clear' | 'load',
) => {
  pipeline
    .withColorAttachment({
      view: msaaTextureView,
      resolveTarget: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: loadOp,
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTextureView,
      depthClearValue: 1,
      depthLoadOp: loadOp,
      depthStoreOp: 'store',
    })
    .with(vertexLayout, buffer)
    .with(layout, group)
    .draw(vertexCount);
};

function render() {
  drawObject(planeBuffer, planeBindGroup, 6, 'clear');
}

function frame() {
  render();
  requestAnimationFrame(frame);
}

frame();
