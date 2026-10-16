import { d, std, tgpu } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { mat4 } from 'wgpu-matrix';
import { setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { blob } from './blob.ts';
import { gallery } from './gallery.ts';
import { place } from './geometry.ts';
import {
  fragment,
  SceneUniforms,
  sceneLayout,
  shadowLayout,
  worldToClip,
  worldToLight,
} from './shading.ts';
import { spring } from './spring.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const uniforms = root.createUniform(SceneUniforms);
const sceneBindGroup = root.createBindGroup(sceneLayout, { uniforms });

const shadowMap = root
  .createTexture({ size: [2048, 2048], format: 'depth32float' })
  .$usage('render', 'sampled');

const shadowBindGroup = root.createBindGroup(shadowLayout, {
  map: shadowMap,
  sampler: root.createComparisonSampler({
    compare: 'less-equal',
    magFilter: 'linear',
    minFilter: 'linear',
  }),
});

function createDepth() {
  return root
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
    .$usage('transient');
}

let depth = createDepth();

const scene = meshes.bakeIndices(
  root,
  meshes.concat(gallery, blob, place(spring, d.vec3f(0, 0.07, 2.2), d.vec3f(0.7, 0.45, 0.95))),
);

const shadow = root
  .createRenderPipeline({
    vertex: ({ $vertexIndex }) => {
      'use gpu';
      return { $position: worldToLight(scene.vertexAt($vertexIndex).position) };
    },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
      depthBias: 1,
      depthBiasSlopeScale: 2,
    },
    primitive: { cullMode: 'back' },
  })
  .with(sceneBindGroup)
  .pipe(scene.inject());

const lit = root
  .createRenderPipeline({
    vertex: ({ $vertexIndex }) => {
      'use gpu';
      const vertex = scene.vertexAt($vertexIndex);
      return {
        $position: worldToClip(vertex.position),
        worldPos: vertex.position,
        normal: vertex.normal,
        color: vertex.color,
      };
    },
    fragment,
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    primitive: { cullMode: 'back' },
  })
  .with(sceneBindGroup)
  .with(shadowBindGroup)
  .pipe(scene.inject());

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(3.2, 2.2, 3.7, 1), target: d.vec4f(0, 0.3, 0, 1), minZoom: 2, maxZoom: 12 },
  (camera) => uniforms.patch({ camera }),
);

const lightProjection = mat4.ortho(-4.5, 4.5, -4.5, 4.5, 0.5, 20, d.mat4x4f());

function lightAt(seconds: number) {
  const angle = seconds * 0.2;
  const direction = std.normalize(d.vec3f(Math.cos(angle) * 0.7, -1, Math.sin(angle) * 0.7));
  const eye = std.mul(direction, -10);
  const view = mat4.lookAt(eye, d.vec3f(), d.vec3f(0, 1, 0), d.mat4x4f());

  return { viewProj: std.mul(lightProjection, view), direction };
}

let frame: number;

function render(now: number) {
  const seconds = now * 0.001;
  uniforms.patch({ light: lightAt(seconds), time: seconds });

  const encoder = root['~unstable'].createCommandEncoder();

  const shadowPass = encoder.beginRenderPass({ depthStencilAttachment: { view: shadowMap } });
  shadow.with(shadowPass).drawIndexed(scene.indexCount);
  shadowPass.end();

  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: context, clearValue: [0.08, 0.09, 0.12, 1] }],
    depthStencilAttachment: { view: depth, depthStoreOp: 'discard' },
  });

  lit.with(pass).drawIndexed(scene.indexCount);
  pass.end();

  encoder.submit();

  frame = requestAnimationFrame(render);
}

frame = requestAnimationFrame(render);

const resizeObserver = new ResizeObserver(() => {
  depth.destroy();
  depth = createDepth();
});

resizeObserver.observe(canvas);

export function onCleanup() {
  cancelAnimationFrame(frame);
  resizeObserver.disconnect();
  cleanupCamera();

  root.destroy();
}
