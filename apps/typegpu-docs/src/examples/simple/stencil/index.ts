import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

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

const vertexFn = tgpu['~unstable'].vertexFn({
  in: {
    vid: d.builtin.vertexIndex,
  },
  out: {
    position: d.builtin.position,
    uv: d.vec2f,
  },
})(({ vid }) => {
  const pos = triangleData.vertices.$[vid];
  const uv = triangleData.uvs.$[vid];

  const rotatedPos = rotationUniform.$.mul(pos);

  return {
    position: d.vec4f(rotatedPos, 0, 1),
    uv,
  };
});

const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: {
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ uv }) => d.vec4f(uv, 0, 1));

const basePipeline = root['~unstable']
  .withVertex(vertexFn);

const writeStencilPipeline = basePipeline
  .withDepthStencil({
    format: 'stencil8',
    stencilFront: { passOp: 'replace' },
  })
  .createPipeline()
  .withStencilReference(1);

const testStencilPipeline = basePipeline
  .withFragment(fragmentFn, { format: presentationFormat })
  .withDepthStencil({
    format: 'stencil8',
    stencilFront: {
      compare: 'equal',
      passOp: 'keep',
    },
  })
  .createPipeline()
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
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
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
