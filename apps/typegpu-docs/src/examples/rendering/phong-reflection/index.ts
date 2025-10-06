import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params.ts';
import {
  ModelVertexInput,
  modelVertexLayout,
  ModelVertexOutput,
} from './schemas.ts';
import { loadModel } from './load-model.ts';
import { Camera, setupOrbitCamera } from './setup-orbit-camera.ts';

// ----

// setup
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// models and textures

// https://sketchfab.com/3d-models/animated-low-poly-fish-64adc2e5a4be471e8279532b9610c878
const fishModel = await loadModel(root, '/TypeGPU/assets/3d-fish/fish.obj');

// camera

const cameraUniform = root.createUniform(Camera);

const cameraCleanup = setupOrbitCamera(
  (updates) => cameraUniform.writePartial(updates),
  canvas,
  { initPos: d.vec4f(-5.2, 0, -5.2, 1) },
);

// shaders

export const vertexShader = tgpu['~unstable'].vertexFn({
  in: { ...ModelVertexInput.propTypes, instanceIndex: d.builtin.instanceIndex },
  out: ModelVertexOutput,
})((input) => {
  const worldPosition = d.vec4f(input.modelPosition, 1);
  const camera = cameraUniform.$;

  const canvasPosition = std.mul(
    camera.projection,
    std.mul(camera.view, worldPosition),
  );

  return {
    worldPosition: input.modelPosition,
    worldNormal: input.modelNormal,
    canvasPosition: canvasPosition,
  };
});

export const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: ModelVertexOutput,
  out: d.vec4f,
})((input) => {
  // shade the fragment in Phong reflection model
  // https://en.wikipedia.org/wiki/Phong_reflection_model
  // then apply sea fog and sea desaturation
  const textureColor = d.vec3f(0.8, 0.8, 0.1);

  const ambient = std.mul(0.5, std.mul(textureColor, p.lightColor));

  const cosTheta = std.dot(input.worldNormal, p.lightDirection);
  const diffuse = std.mul(
    std.max(0, cosTheta),
    std.mul(textureColor, p.lightColor),
  );

  const viewSource = std.normalize(
    std.sub(cameraUniform.$.position.xyz, input.worldPosition),
  );
  const reflectSource = std.normalize(
    std.reflect(std.mul(-1, p.lightDirection), input.worldNormal),
  );
  const specularStrength = std.pow(
    std.max(0, std.dot(viewSource, reflectSource)),
    16,
  );
  const specular = std.mul(specularStrength, p.lightColor);

  const lightedColor = std.add(ambient, std.add(diffuse, specular));

  return d.vec4f(lightedColor, 1);
});

// pipelines

const renderPipeline = root['~unstable']
  .withVertex(vertexShader, modelVertexLayout.attrib)
  .withFragment(fragmentShader, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list' })
  .createPipeline();

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// frame

let disposed = false;

function frame() {
  if (disposed) {
    return;
  }

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [
        p.backgroundColor.x,
        p.backgroundColor.y,
        p.backgroundColor.z,
        1,
      ],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(modelVertexLayout, fishModel.vertexBuffer)
    .draw(fishModel.polygonCount);

  root['~unstable'].flush();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ----

// #region Example controls and cleanup

const resizeObserver = new ResizeObserver(() => {
  depthTexture.destroy();
  depthTexture = root.device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
});
resizeObserver.observe(canvas);

export function onCleanup() {
  cameraCleanup();
  root.destroy();
}

// #endregion
