import tgpu, { d } from 'typegpu';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

let stencilTexture = root['~unstable'].createTexture({
  size: [canvas.width, canvas.height],
  format: 'stencil8',
}).$usage('render');

const triangleData = {
  vertices: tgpu.const(d.arrayOf(d.vec2f, 3), [
    d.vec2f(0, 0.5),
    d.vec2f(-0.5, -0.5),
    d.vec2f(0.5, -0.5),
  ]),
  uvs: tgpu.const(d.arrayOf(d.vec2f, 3), [
    d.vec2f(0.5, 1),
    d.vec2f(0, 0),
    d.vec2f(1, 0),
  ]),
};

const rotationUniform = root.createUniform(d.mat2x2f, d.mat2x2f.identity());

const vertexFn = tgpu.vertexFn({
  in: {
    vid: d.builtin.vertexIndex,
  },
  out: {
    position: d.builtin.position,
    uv: d.vec2f,
  },
})(({ vid }) => {
  'use gpu';
  const pos = triangleData.vertices.$[vid];
  const uv = triangleData.uvs.$[vid];

  const rotatedPos = rotationUniform.$ * pos;

  return {
    position: d.vec4f(rotatedPos, 0, 1),
    uv,
  };
});

const fragmentFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => d.vec4f(uv, 0, 1));

const writeStencilPipeline = root
  .createRenderPipeline({
    vertex: vertexFn,
    depthStencil: {
      format: 'stencil8',
      stencilFront: { passOp: 'replace' },
    },
  })
  .withStencilReference(1);

const testStencilPipeline = root
  .createRenderPipeline({
    vertex: vertexFn,
    fragment: fragmentFn,
    targets: { format: presentationFormat },
    depthStencil: {
      format: 'stencil8',
      stencilFront: {
        compare: 'equal',
        passOp: 'keep',
      },
    },
  })
  .withStencilReference(1);

writeStencilPipeline
  .withDepthStencilAttachment({
    view: stencilTexture,
    stencilClearValue: 0,
    stencilLoadOp: 'clear',
    stencilStoreOp: 'store',
  }).draw(3);

let frameId: number;
function frame(timestamp: number) {
  const rotationAngle = (timestamp / 1000) * Math.PI * 0.5;
  const cosA = Math.cos(rotationAngle);
  const sinA = Math.sin(rotationAngle);
  rotationUniform.write(d.mat2x2f(cosA, -sinA, sinA, cosA));

  testStencilPipeline
    .withDepthStencilAttachment({
      view: stencilTexture,
      stencilLoadOp: 'load',
      stencilStoreOp: 'store',
    })
    .withColorAttachment({ view: context })
    .draw(3);

  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

const resizeObserver = new ResizeObserver(() => {
  stencilTexture = root['~unstable'].createTexture({
    size: [canvas.width, canvas.height],
    format: 'stencil8',
  }).$usage('render');

  rotationUniform.write(d.mat2x2f.identity());

  writeStencilPipeline.withDepthStencilAttachment({
    view: stencilTexture,
    stencilClearValue: 0,
    stencilLoadOp: 'clear',
    stencilStoreOp: 'store',
  }).draw(3);
});
resizeObserver.observe(canvas);

export function onCleanup() {
  if (frameId) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}
