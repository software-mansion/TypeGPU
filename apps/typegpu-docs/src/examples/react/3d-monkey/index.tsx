import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { fragmentShader, vertexShader } from './render.ts';
import { loadModel } from './load-model.ts';
import { bindGroupLayout, modelVertexLayout, Uniforms } from './schemas.ts';

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

// models

const monkeyModel = await loadModel(
  root,
  '/TypeGPU/assets/3d-monkey/monkey.obj',
);

// buffers

const uniformsBuffer = root.createBuffer(Uniforms).$usage('uniform');

// bind groups

const bindGroup = root.createBindGroup(bindGroupLayout, {
  uniforms: uniformsBuffer,
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
  .createPipeline();

const depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// frame

function frame(time: DOMHighResTimeStamp) {
  const modelMatrix = m.mat4.rotationY(time / 1000, d.mat4x4f());
  m.mat4.scale(modelMatrix, [0.5, 0.5, 0.5], modelMatrix); // optional scaling

  const viewMatrix = m.mat4.lookAt([0, 0, -3], [0, 0, 0], [0, 1, 0]);
  const projectionMatrix = m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100,
  );
  const viewProjectionMatrix = m.mat4.multiply(
    projectionMatrix,
    viewMatrix,
    d.mat4x4f(),
  );

  const clearColor = [0.1, 0.2, 0.3, 1.0];

  uniformsBuffer.write({
    modelMatrix,
    viewProjectionMatrix,
  });

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: clearColor,
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(modelVertexLayout, monkeyModel.vertexBuffer)
    .with(bindGroupLayout, bindGroup)
    .draw(monkeyModel.polygonCount, 1); // 1 instance

  root['~unstable'].flush();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
