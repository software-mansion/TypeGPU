import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { loadModel, modelVertexLayout } from './load-model.ts';

interface HeroEffectOptions {
  signal: AbortSignal;
  canvas: HTMLCanvasElement;
}

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
  const observer = new ResizeObserver((entries) => {
    const entry = entries.find((entry) => entry.target === options.canvas);
    if (!entry) return;

    resolution[0] = entry.devicePixelContentBoxSize[0].inlineSize;
    resolution[1] = entry.devicePixelContentBoxSize[0].blockSize;
    options.canvas.width = resolution[0];
    options.canvas.height = resolution[1];
  });
  observer.observe(options.canvas);

  const vertexFn = tgpu['~unstable'].vertexFn({
    in: { pos: d.vec3f, normal: d.vec3f, vid: d.builtin.vertexIndex },
    out: { localPos: d.vec3f, position: d.builtin.position, normal: d.vec3f },
  })((input) => {
    const localPos = input.pos.mul(0.3);
    const position = d.vec4f(localPos, 1);
    return {
      position,
      localPos,
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
    .createPipeline();

  const frame = (_timestamp: number) => {
    if (options.signal.aborted) {
      root.destroy();
      return;
    }

    renderPipeline
      .withIndexBuffer(model.body.indexBuffer)
      .with(modelVertexLayout, model.body.vertexBuffer)
      .withColorAttachment({
        view: ctx.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: d.vec4f(0, 0, 0, 1),
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
      .drawIndexed(model.tail.indexCount);

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
