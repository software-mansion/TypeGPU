import { meshes } from '@typegpu/geometry';
import { d, std, tgpu } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const maxSegments = 32;
let segments = 4;
const Scene = d.struct({ camera: Camera, segments: d.u32, wireframe: d.u32 });
const scene = root.createUniform(Scene, { camera: Camera(), segments, wireframe: 1 });
const indices = root
  .createBuffer(
    d.arrayOf(d.u32, meshes.triangleIndexCount(maxSegments)),
    meshes.triangleIndices(maxSegments),
  )
  .$usage('index');

const shapes = [
  meshes.patches.icosphere(),
  meshes.patches.capsule({ radius: 0.35, height: 0.6 }),
  meshes.patches.roundedBox({ radius: 0.2 }),
];
const colors = [d.vec3f(0.2, 0.65, 0.8), d.vec3f(0.9, 0.55, 0.2), d.vec3f(0.6, 0.4, 0.8)];

const fragment = tgpu.fragmentFn({
  in: { normal: d.vec3f, color: d.vec3f, grid: d.vec3f },
  out: d.vec4f,
})(({ normal, color, grid }) => {
  'use gpu';
  const light = std.normalize(d.vec3f(-0.4, 0.8, 1));
  let shaded = color * (0.25 + 0.75 * std.saturate(std.dot(std.normalize(normal), light)));
  if (scene.$.wireframe !== 0) {
    const f = std.fract(grid);
    const distance = std.min(f, 1 - f) / std.max(std.fwidth(grid), d.vec3f(1e-4));
    const edge = std.min(distance.x, std.min(distance.y, distance.z));
    shaded = std.mix(shaded * 0.2, shaded, std.smoothstep(0, 1, edge));
  }
  return d.vec4f(shaded, 1);
});

const pipelines = shapes.map((shape, i) => {
  const offset = d.vec3f((i - 1) * 1.5, 0, 0);
  const color = colors[i];
  return root
    .createRenderPipeline({
      vertex: ({ $vertexIndex, $instanceIndex }) => {
        'use gpu';
        const weights = meshes.triangleBarycentrics($vertexIndex, scene.$.segments);
        const vertex = shape.at($instanceIndex, weights);
        const camera = scene.$.camera;
        return {
          $position: camera.projection * camera.view * d.vec4f(vertex.position + offset, 1),
          normal: vertex.normal,
          color,
          grid: weights * d.f32(scene.$.segments),
        };
      },
      fragment,
      primitive: { cullMode: 'back' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    })
    .withIndexBuffer(indices);
});

await Promise.all(pipelines.map((pipeline) => pipeline.initAsync()));

function createDepth() {
  return root
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
    .$usage('transient');
}
let depth = createDepth();
let frame: number | undefined;

function render() {
  frame = undefined;
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: context, clearValue: [0.04, 0.05, 0.07, 1] }],
    depthStencilAttachment: { view: depth, depthStoreOp: 'discard' },
  });
  pipelines.forEach((pipeline, i) => {
    pipeline.with(pass).drawIndexed(meshes.triangleIndexCount(segments), shapes[i].patchCount);
  });
  pass.end();
  encoder.submit();
}

function requestRender() {
  frame ??= requestAnimationFrame(render);
}

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(2.5, 1.8, 5, 1), target: d.vec4f(0, 0, 0, 1), minZoom: 2, maxZoom: 10 },
  (camera) => {
    scene.patch({ camera });
    requestRender();
  },
);

requestRender();

const resizeObserver = new ResizeObserver(() => {
  depth.destroy();
  depth = createDepth();
  requestRender();
});
resizeObserver.observe(canvas);

export const controls = defineControls({
  Detail: {
    initial: segments,
    min: 1,
    max: maxSegments,
    step: 1,
    onSliderChange: (value) => {
      segments = value;
      scene.patch({ segments });
      requestRender();
    },
  },
  Wireframe: {
    initial: true,
    onToggleChange: (value) => {
      scene.patch({ wireframe: value ? 1 : 0 });
      requestRender();
    },
  },
});

export function onCleanup() {
  if (frame !== undefined) cancelAnimationFrame(frame);
  resizeObserver.disconnect();
  cleanupCamera();
  root.destroy();
}
