import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { mat4 } from 'wgpu-matrix';
import { loadModel, modelVertexLayout } from './load-model.ts';

interface HeroEffectOptions {
  signal: AbortSignal;
  canvas: HTMLCanvasElement;
}

const Uniforms = d.struct({
  viewProjection: d.mat4x4f,
  modelMatrix: d.mat4x4f,
});

export async function initHeroEffect(options: HeroEffectOptions) {
  const root = await tgpu.init();
  const model = await loadModel(root);
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  if (options.signal.aborted) {
    root.destroy();
    return;
  }

  const ctx = options.canvas.getContext('webgpu');
  if (!ctx) {
    throw new Error('WebGPU context not available');
  }

  ctx.configure({
    device: root.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  const resolution = [
    options.canvas.width * window.devicePixelRatio,
    options.canvas.height * window.devicePixelRatio,
  ];

  let depthTexture = root.device.createTexture({
    size: resolution,
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const observer = new ResizeObserver((entries) => {
    const entry = entries.find((entry) => entry.target === options.canvas);
    if (!entry) return;

    resolution[0] = entry.devicePixelContentBoxSize[0].inlineSize;
    resolution[1] = entry.devicePixelContentBoxSize[0].blockSize;
    options.canvas.width = resolution[0];
    options.canvas.height = resolution[1];

    depthTexture.destroy();
    depthTexture = root.device.createTexture({
      size: resolution,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  });
  observer.observe(options.canvas);

  const uniforms = root.createUniform(Uniforms);

  const vertexFn = tgpu['~unstable'].vertexFn({
    in: { pos: d.vec3f, normal: d.vec3f, vid: d.builtin.vertexIndex },
    out: { localPos: d.vec3f, position: d.builtin.position, normal: d.vec3f },
  })((input) => {
    const position = uniforms.$.viewProjection
      .mul(uniforms.$.modelMatrix)
      .mul(d.vec4f(input.pos, 1));

    return {
      position,
      localPos: input.pos,
      normal: input.normal,
    };
  });

  const fragmentFn = tgpu['~unstable'].fragmentFn({
    in: { localPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    return d.vec4f(input.normal, 1);
  });

  const renderPipeline = root['~unstable']
    .withVertex(vertexFn, modelVertexLayout.attrib)
    .withFragment(fragmentFn, { format: presentationFormat })
    .withDepthStencil({
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    })
    .createPipeline();

  const frame = (timestamp: number) => {
    if (options.signal.aborted) {
      root.destroy();
      return;
    }

    const viewProjection = mat4.perspective(
      Math.PI / 4,
      resolution[0] / resolution[1],
      0.1,
      1000,
      d.mat4x4f(),
    );

    const modelMatrix = mat4.identity(d.mat4x4f());
    mat4.translate(modelMatrix, [0, 0, -10], modelMatrix);
    mat4.rotateX(modelMatrix, timestamp * 0.0002, modelMatrix);
    mat4.rotateY(modelMatrix, timestamp * 0.00071212, modelMatrix);
    uniforms.write({
      viewProjection,
      modelMatrix,
    });

    renderPipeline
      .withIndexBuffer(model.body.indexBuffer)
      .with(modelVertexLayout, model.body.vertexBuffer)
      .withColorAttachment({
        view: ctx.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: d.vec4f(0, 0, 0, 1),
      })
      .withDepthStencilAttachment({
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .drawIndexed(model.body.indexCount);

    renderPipeline
      .withIndexBuffer(model.tail.indexBuffer)
      .with(modelVertexLayout, model.tail.vertexBuffer)
      .withColorAttachment({
        view: ctx.getCurrentTexture().createView(),
        loadOp: 'load',
        storeOp: 'store',
        clearValue: d.vec4f(0, 0, 0, 1),
      })
      .withDepthStencilAttachment({
        view: depthTexture.createView(),
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .drawIndexed(model.tail.indexCount);

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
