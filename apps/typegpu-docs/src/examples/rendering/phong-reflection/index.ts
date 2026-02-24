import tgpu, { d, std } from 'typegpu';
import * as p from './params.ts';
import {
  ExampleControls,
  ModelVertexInput,
  modelVertexLayout,
  ModelVertexOutput,
} from './schemas.ts';
import { loadModel } from './load-model.ts';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';

// setup
const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// model (https://j5boom.itch.io/utah-teapot-obj)
const model = await loadModel(root, '/TypeGPU/assets/phong/teapot.obj');

// camera
const cameraUniform = root.createUniform(Camera);

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(-10, 4, -8, 1),
    target: d.vec4f(0, 1, 0, 1),
    minZoom: 8,
    maxZoom: 40,
  },
  (updates) => cameraUniform.writePartial(updates),
);

// shaders
const exampleControlsUniform = root.createUniform(
  ExampleControls,
  p.initialControls,
);

const vertexShader = tgpu.vertexFn({
  in: { ...ModelVertexInput.propTypes, instanceIndex: d.builtin.instanceIndex },
  out: ModelVertexOutput,
})((input) => {
  const worldPosition = d.vec4f(input.modelPosition, 1);
  const camera = cameraUniform.$;

  const canvasPosition = camera.projection.mul(camera.view).mul(worldPosition);

  return {
    worldPosition: input.modelPosition,
    worldNormal: input.modelNormal,
    canvasPosition: canvasPosition,
  };
});

// see https://gist.github.com/chicio/d983fff6ff304bd55bebd6ff05a2f9dd
const fragmentShader = tgpu.fragmentFn({
  in: ModelVertexOutput,
  out: d.vec4f,
})((input) => {
  const lightColor = std.normalize(exampleControlsUniform.$.lightColor);
  const lightDirection = std.normalize(exampleControlsUniform.$.lightDirection);
  // fixed color, can be replaced with texture sample
  const ambientColor = exampleControlsUniform.$.ambientColor;
  const ambientStrength = exampleControlsUniform.$.ambientStrength;
  const specularStrength = exampleControlsUniform.$.specularExponent;

  // ambient component
  const ambient = ambientColor.mul(ambientStrength);

  // diffuse component
  const cosTheta = std.dot(input.worldNormal, lightDirection);
  const diffuse = lightColor.mul(std.max(0, cosTheta));

  // specular component
  const reflectionDirection = std.reflect(
    lightDirection.mul(-1),
    input.worldNormal,
  );
  const viewDirection = std.normalize(
    cameraUniform.$.position.xyz.sub(input.worldPosition),
  );
  const specular = lightColor.mul(
    std.pow(
      std.max(0, std.dot(reflectionDirection, viewDirection)),
      specularStrength,
    ),
  );

  // add the components up
  const color = ambient.add(diffuse).add(specular);
  return d.vec4f(color, 1);
});

// pipelines
const renderPipeline = root.createRenderPipeline({
  attribs: modelVertexLayout.attrib,
  vertex: vertexShader,
  fragment: fragmentShader,

  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// frame
let frameId: number;
function frame() {
  renderPipeline
    .withColorAttachment({
      view: context,
      clearValue: [
        p.backgroundColor.x,
        p.backgroundColor.y,
        p.backgroundColor.z,
        1,
      ],
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(modelVertexLayout, model.vertexBuffer)
    .draw(model.polygonCount);

  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup
export const controls = defineControls({
  'light color': {
    initial: p.initialControls.lightColor,
    onColorChange(value) {
      exampleControlsUniform.writePartial({ lightColor: value });
    },
  },
  'light direction': {
    min: d.vec3f(-10, -10, -10),
    max: d.vec3f(10, 10, 10),
    initial: p.initialControls.lightDirection,
    step: d.vec3f(0.01, 0.01, 0.01),
    onVectorSliderChange(v) {
      exampleControlsUniform.writePartial({ lightDirection: v });
    },
  },
  'ambient color': {
    initial: p.initialControls.ambientColor,
    onColorChange(value) {
      exampleControlsUniform.writePartial({ ambientColor: value });
    },
  },
  'ambient strength': {
    min: 0,
    max: 1,
    initial: p.initialControls.ambientStrength,
    step: 0.01,
    onSliderChange(v) {
      exampleControlsUniform.writePartial({ ambientStrength: v });
    },
  },
  'specular exponent': {
    min: 0.5,
    max: 16,
    initial: p.initialControls.specularExponent,
    step: 0.1,
    onSliderChange(v) {
      exampleControlsUniform.writePartial({ specularExponent: v });
    },
  },
});

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
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.unobserve(canvas);
  root.destroy();
}

// #endregion
