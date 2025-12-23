import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { createBezier } from './bezier.ts';
import { interpolateBezier, rotate } from './transformations.ts';
import { colors, triangleVertices } from './geometry.ts';

const ease = createBezier(0.18, 0.7, 0.68, 1.03);

const root = await tgpu.init();

const STEP_ROTATION_ANGLE = 60;
const ANIMATION_DURATION = 1500;
const SCALE = 0.5;

const animationProgress = root.createUniform(d.f32);

const shiftedColors = root.createReadonly(d.arrayOf(d.vec4f, 3), [...colors]);

const TriangleVertices = d.struct({
  positions: d.arrayOf(d.vec2f, 9),
});

const triangleVerticesBuffer = root.createReadonly(TriangleVertices, {
  positions: triangleVertices,
});

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => {
  return input.color;
});

const wgsl2 = tgpu.resolve([mainFragment]);
console.log(wgsl2);

const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, color: d.vec4f },
})(({ vertexIndex }) => {
  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex];
  let calculatedPosition = d.vec2f(vertexPosition);

  // biggest triangle
  let color = d.vec4f(shiftedColors.$[0]);

  // middle triangle
  if (vertexIndex > 2 && vertexIndex < 6) {
    color = d.vec4f(shiftedColors.$[1]);

    const angle = interpolateBezier(
      animationProgress.$,
      STEP_ROTATION_ANGLE,
      STEP_ROTATION_ANGLE * 1.5,
    );
    const scaleFactor = interpolateBezier(animationProgress.$, 0.5, d.f32(2));

    calculatedPosition = rotate(vertexPosition, angle);
    calculatedPosition = std.mul(calculatedPosition, scaleFactor);
  }

  // smallest triangle
  if (vertexIndex > 5) {
    color = d.vec4f(shiftedColors.$[2]);

    const angle = interpolateBezier(
      animationProgress.$,
      0,
      STEP_ROTATION_ANGLE,
    );
    const scaleFactor = animationProgress.$;
    calculatedPosition = rotate(vertexPosition, angle);
    calculatedPosition = std.mul(calculatedPosition, scaleFactor);
  }

  return { outPos: d.vec4f(std.mul(calculatedPosition, SCALE), 0, 1), color };
});

const maskVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { position: d.builtin.position },
})(({ vertexIndex }) => {
  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex];

  return { position: d.vec4f(std.mul(vertexPosition, SCALE), 0, 1) };
});

const wgsl = tgpu.resolve([mainVertex]);
console.log(wgsl);

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let stencilTexture = root.device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'stencil8',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const maskPipeline = root['~unstable']
  .withVertex(maskVertex)
  .withDepthStencil({
    format: 'stencil8',
    stencilFront: {
      compare: 'always',
      passOp: 'replace',
    },
  })
  .createPipeline()
  .withStencilReference(1);

const pipeline = root['~unstable']
  .withVertex(mainVertex)
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'stencil8',
    stencilFront: {
      compare: 'equal',
      passOp: 'keep',
      failOp: 'keep',
    },
  })
  .createPipeline()
  .withStencilReference(1);

let isRunning = true;

console.log(tgpu.resolve([maskPipeline]));

// main drawing loop

function getShiftedColors(timestamp: number) {
  const shiftBy = Math.floor(timestamp / ANIMATION_DURATION) % colors.length;
  return [...colors.slice(shiftBy), ...colors.slice(0, shiftBy)];
}

function draw(timestamp: number) {
  if (!isRunning) return;

  shiftedColors.write(getShiftedColors(timestamp));
  animationProgress.write(
    ease((timestamp % ANIMATION_DURATION) / ANIMATION_DURATION),
  );

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: stencilTexture.createView(),
      stencilLoadOp: 'load',
      stencilStoreOp: 'store',
    })
    .draw(9);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// cleanup

const resizeObserver = new ResizeObserver(() => {
  stencilTexture.destroy();

  stencilTexture = root.device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  maskPipeline
    .withDepthStencilAttachment({
      view: stencilTexture.createView(),
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'store',
    })
    .draw(3);
});
resizeObserver.observe(canvas);

export function onCleanup() {
  isRunning = false;

  resizeObserver.disconnect();
  root.destroy();
}
