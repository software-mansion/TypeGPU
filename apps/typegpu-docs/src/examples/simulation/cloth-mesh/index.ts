import { d, std, tgpu } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import {
  Grab,
  Params,
  Pointer,
  Velocities,
  Forces,
  sheet,
  segments,
  timeStep,
  released,
  verticesAccess,
  velocityAccess,
  forceAccess,
  grabAccess,
  cameraAccess,
  pointerAccess,
  paramsAccess,
  pick,
  resolve,
  forces,
  integrate,
  normals,
} from './cloth.ts';
import { setupClothDrag } from './drag.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const Scene = d.struct({ camera: Camera, pointer: Pointer, params: Params });

let cameraState = Camera();
const scene = root.createUniform(Scene, {
  camera: cameraState,
  pointer: Pointer(),
  params: { time: 0, wind: 1, stiffness: 0.2 },
});
const mesh = meshes.bake(root, sheet);
const velocity = root.createMutable(Velocities);
const force = root.createMutable(Forces);
const grab = root.createMutable(Grab, released);

function createDepth() {
  return root
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
    .$usage('transient');
}
let depth = createDepth();

const observer = new ResizeObserver(() => {
  depth.destroy();
  depth = createDepth();
});
observer.observe(canvas);

const simulation = root
  .with(verticesAccess, mesh.vertices.as('mutable'))
  .with(velocityAccess, velocity)
  .with(forceAccess, force)
  .with(grabAccess, grab)
  .with(cameraAccess, () => scene.$.camera)
  .with(pointerAccess, () => scene.$.pointer)
  .with(paramsAccess, () => scene.$.params);

const pickPipeline = simulation.createComputePipeline({ compute: pick });
const resolvePipeline = simulation.createComputePipeline({ compute: resolve });
const forcePipeline = simulation.createComputePipeline({ compute: forces });
const integratePipeline = simulation.createComputePipeline({ compute: integrate });
const normalPipeline = simulation.createComputePipeline({ compute: normals });

const pipeline = root
  .createRenderPipeline({
    attribs: mesh.layout.attrib,
    vertex: ({ position, normal, uv }) => {
      'use gpu';
      const camera = scene.$.camera;
      return {
        $position: camera.projection * camera.view * d.vec4f(position, 1),
        worldPos: position,
        normal,
        uv,
      };
    },
    fragment: ({ worldPos, normal, uv, $frontFacing }) => {
      'use gpu';
      const n = std.normalize(normal) * ($frontFacing ? 1 : -1);

      const cell = std.floor(uv * 12);
      const pattern = (cell.x + cell.y) % 2;
      let color = std.mix(d.vec3f(0.035, 0.32, 0.36), d.vec3f(0.82, 0.69, 0.43), pattern);

      const edge = std.min(uv, 1 - uv);
      color = std.mix(
        d.vec3f(0.025, 0.13, 0.16),
        color,
        std.smoothstep(0.012, 0.02, std.min(edge.x, edge.y)),
      );

      const threadUV = uv * 180;
      const threadCell = std.floor(threadUV);
      const crossing = (threadCell.x + threadCell.y) % 2;
      const profile = std.sin(std.fract(threadUV) * Math.PI);
      const thread = std.mix(profile.x, profile.y, crossing);
      const footprint = std.fwidth(threadUV);
      const detail = 1 - std.smoothstep(0.5, 1, std.max(footprint.x, footprint.y));
      const weave = std.mix(1, 0.88 + 0.18 * thread, detail);
      color *= weave;

      const index = grab.$.index;
      if (index >= 0) {
        const grabbedUV =
          d.vec2f(index % (segments + 1), std.intdiv(index, segments + 1)) / segments;
        const highlight = 1 - std.smoothstep(0.015, 0.035, std.distance(uv, grabbedUV));
        color = std.mix(color, d.vec3f(1, 0.8, 0.3), highlight);
      }

      const light = std.normalize(d.vec3f(0.8, 0.6, 0.7));
      const view = std.normalize(scene.$.camera.position.xyz - worldPos);
      const diffuse = 0.22 + 0.75 * std.saturate(std.dot(n, light));
      const grazing = 1 - std.saturate(std.dot(n, view));
      const sheen = 0.3 * grazing * grazing * weave;
      const fibers = std.mix(color, d.vec3f(0.9, 0.88, 0.82), 0.6);

      return d.vec4f(color * diffuse + fibers * sheen, 1);
    },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  })
  .pipe(mesh.inject());

let picking = false;

const drag = setupClothDrag(canvas, {
  onGrab: (pointer) => {
    scene.patch({ pointer });
    picking = true;
  },
  onMove: (position) => scene.patch({ pointer: { position } }),
  onRelease: () => {
    picking = false;
    grab.write(released);
    targetCamera(cameraState.position, cameraState.targetPos);
  },
});

const { cleanupCamera, targetCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(2.2, 0.9, 3.7, 1),
    target: d.vec4f(0, -0.1, 0, 1),
    minZoom: 1.5,
    maxZoom: 8,
  },
  (updates) => {
    if (drag.active && updates.position) return;
    cameraState = { ...cameraState, ...updates };
    scene.patch({ camera: updates });
  },
);

const workgroups = Math.ceil(mesh.vertexCount / 64);

let paused = false;
let previous = 0;
let accumulated = 0;
let time = 0;
let frame: number;

function render(now: number) {
  const delta = previous === 0 ? 0 : Math.min((now - previous) * 0.001, 1 / 30);
  previous = now;

  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginComputePass();

  if (picking) {
    picking = false;
    pickPipeline.with(pass).dispatchWorkgroups(workgroups);
    resolvePipeline.with(pass).dispatchWorkgroups(1);
  }

  if (!paused) {
    accumulated += delta;
    const steps = Math.floor(accumulated / timeStep);
    accumulated -= steps * timeStep;
    time += steps * timeStep;
    scene.patch({ params: { time } });

    for (let i = 0; i < steps; i++) {
      forcePipeline.with(pass).dispatchWorkgroups(workgroups);
      integratePipeline.with(pass).dispatchWorkgroups(workgroups);
    }
    if (steps > 0) normalPipeline.with(pass).dispatchWorkgroups(workgroups);
  }

  pass.end();

  pipeline
    .with(encoder)
    .withColorAttachment({ view: context, clearValue: [0.035, 0.045, 0.065, 1] })
    .withDepthStencilAttachment({ view: depth, depthStoreOp: 'discard' })
    .drawIndexed(mesh.indexCount);

  encoder.submit();

  frame = requestAnimationFrame(render);
}

frame = requestAnimationFrame(render);

export const controls = defineControls({
  Wind: {
    initial: 1,
    min: 0,
    max: 2,
    step: 0.1,
    onSliderChange(value) {
      scene.patch({ params: { wind: value } });
    },
  },
  Stiffness: {
    initial: 0.2,
    min: 0.15,
    max: 0.3,
    step: 0.01,
    onSliderChange(value) {
      scene.patch({ params: { stiffness: value } });
    },
  },
  Pause: {
    initial: false,
    onToggleChange(value) {
      paused = value;
    },
  },
  Reset: {
    onButtonClick() {
      drag.release();
      mesh.updateVertices();
      velocity.buffer.clear();

      time = 0;
      accumulated = 0;
      previous = 0;
      scene.patch({ params: { time } });
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frame);
  observer.disconnect();
  drag.cleanup();
  cleanupCamera();

  root.destroy();
}
