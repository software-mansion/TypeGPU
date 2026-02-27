import type { TgpuGuardedComputePipeline, TgpuRawCodeSnippet } from 'typegpu';
import tgpu, { d, std } from 'typegpu';
import { mat4 } from 'wgpu-matrix';
import { defineControls } from '../../common/defineControls.ts';

// Globals and init

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const initialFunctions: Array<{ name: string; color: d.v4f; code: string }> = [
  {
    name: 'blue function',
    color: fromHex('#1D72F0'),
    code: 'x',
  },
  {
    name: 'green function',
    color: fromHex('#3CB371'),
    code: 'cos(x*5)/3-x',
  },
  {
    name: 'purple function',
    color: fromHex('#C464FF'),
    code: 'x*sin(log(abs(x)))',
  },
];

const Properties = d.struct({
  transformation: d.mat4x4f,
  inverseTransformation: d.mat4x4f,
  interpolationPoints: d.u32,
  lineWidth: d.f32,
});

const properties = Properties({
  transformation: mat4.identity(d.mat4x4f()),
  inverseTransformation: mat4.identity(d.mat4x4f()),
  interpolationPoints: 256,
  lineWidth: 0.01,
});

// Buffers

const propertiesUniform = root.createUniform(Properties, properties);

// these buffers are recreated with a different size on interpolationPoints change
function createLineVerticesBuffers() {
  const Schema = d.arrayOf(d.vec2f, properties.interpolationPoints);
  return initialFunctions.map(() =>
    root.createBuffer(Schema).$usage('storage')
  );
}
let lineVerticesBuffers = createLineVerticesBuffers();

const drawColorBuffers = initialFunctions.map((data) =>
  root.createUniform(d.vec4f, data.color)
);

// Compute shader

const computeLayout = tgpu.bindGroupLayout({
  lineVertices: { storage: d.arrayOf(d.vec2f), access: 'mutable' },
});

const functionExprSlot = tgpu.slot<TgpuRawCodeSnippet<d.F32>>();

// oxlint-disable-next-line no-unused-vars -- it is used in wgsl
const interpolatedFunction = (x: number) => {
  'use gpu';
  return functionExprSlot.$;
};

const computePointsFn = (x: number) => {
  'use gpu';
  const properties = propertiesUniform.$;
  const start = properties.transformation.mul(d.vec4f(-1, 0, 0, 1)).x;
  const end = properties.transformation.mul(d.vec4f(1, 0, 0, 1)).x;

  const pointX = start +
    (end - start) / (d.f32(properties.interpolationPoints) - 1) * d.f32(x);
  const pointY = interpolatedFunction(pointX);
  const result = properties.inverseTransformation.mul(
    d.vec4f(pointX, pointY, 0, 1),
  );
  computeLayout.$.lineVertices[x] = result.xy;
};

const createComputePipeline = (exprCode: string) => {
  return root
    .with(
      functionExprSlot,
      tgpu['~unstable'].rawCodeSnippet(exprCode, d.f32, 'runtime'),
    )
    .createGuardedComputePipeline(computePointsFn);
};

const computePipelines: Array<TgpuGuardedComputePipeline> = initialFunctions
  .map((functionData, _) => createComputePipeline(functionData.code));

// Render background shader

const backgroundVertex = tgpu.vertexFn({
  in: { vid: d.builtin.vertexIndex, iid: d.builtin.instanceIndex },
  out: { pos: d.builtin.position },
})(({ vid, iid }) => {
  const properties = propertiesUniform.$;
  const leftBot = properties.transformation.mul(d.vec4f(-1, -1, 0, 1));
  const rightTop = properties.transformation.mul(d.vec4f(1, 1, 0, 1));
  const canvasRatio = (rightTop.x - leftBot.x) / (rightTop.y - leftBot.y);

  const transformedPoints = [
    d.vec2f(leftBot.x, 0),
    d.vec2f(rightTop.x, 0),
    d.vec2f(0, leftBot.y),
    d.vec2f(0, rightTop.y),
  ];

  const currentPoint = properties.inverseTransformation.mul(
    d.vec4f(transformedPoints[2 * iid + vid / 2].xy, 0, 1),
  );

  return {
    pos: d.vec4f(
      currentPoint.x +
        d.f32(iid) * std.select(d.f32(-1), 1, vid % 2 === 0) * 0.005 /
          canvasRatio,
      currentPoint.y +
        d.f32(1 - iid) * std.select(d.f32(-1), 1, vid % 2 === 0) * 0.005,
      currentPoint.zw,
    ),
  };
});

const backgroundFragment = tgpu.fragmentFn({ out: d.vec4f })(
  () => d.vec4f(0.9, 0.9, 0.9, 1),
);

const renderBackgroundPipeline = root.createRenderPipeline({
  vertex: backgroundVertex,
  fragment: backgroundFragment,
  targets: { format: presentationFormat },
  primitive: { topology: 'triangle-strip' },
  multisample: { count: 4 },
});

let msTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  sampleCount: 4,
  format: presentationFormat,
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

let msView = msTexture.createView();

// Render shader

const renderLayout = tgpu.bindGroupLayout({
  lineVertices: { storage: d.arrayOf(d.vec2f) },
  color: { uniform: d.vec4f },
});

const orthonormalForLine = (p1: d.v2f, p2: d.v2f): d.v2f => {
  'use gpu';
  const line = p2.sub(p1);
  const ortho = d.vec2f(-line.y, line.x);
  return std.normalize(ortho);
};

const orthonormalForVertex = (index: number): d.v2f => {
  'use gpu';
  if (index === 0 || index === properties.interpolationPoints - 1) {
    return d.vec2f(0, 1);
  }
  const lineVertices = renderLayout.$.lineVertices;
  const previous = lineVertices[index - 1];
  const current = lineVertices[index];
  const next = lineVertices[index + 1];

  const n1 = orthonormalForLine(previous, current);
  const n2 = orthonormalForLine(current, next);

  const avg = n1.add(n2).div(2);

  return std.normalize(avg);
};

const vertex = tgpu.vertexFn({
  in: { vid: d.builtin.vertexIndex },
  out: { pos: d.builtin.position },
})(({ vid }) => {
  const properties = propertiesUniform.$;
  const lineVertices = renderLayout.$.lineVertices;

  const currentVertex = vid / 2;
  const orthonormal = orthonormalForVertex(currentVertex);
  const offset = orthonormal.mul(properties.lineWidth).mul(
    std.select(d.f32(-1), 1, vid % 2 === 0),
  );

  const leftBot = properties.transformation.mul(d.vec4f(-1, -1, 0, 1));
  const rightTop = properties.transformation.mul(d.vec4f(1, 1, 0, 1));
  const canvasRatio = (rightTop.x - leftBot.x) / (rightTop.y - leftBot.y);
  const adjustedOffset = d.vec2f(offset.x / canvasRatio, offset.y);

  return {
    pos: d.vec4f(lineVertices[currentVertex].add(adjustedOffset), 0, 1),
  };
});

const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
  return renderLayout.$.color;
});

const renderPipeline = root.createRenderPipeline({
  vertex,
  fragment,
  targets: { format: presentationFormat },
  primitive: { topology: 'triangle-strip' },
  multisample: { count: 4 },
});

// Draw

let destroyed = false;
function draw() {
  if (destroyed) {
    return;
  }

  queuePropertiesBufferUpdate();

  initialFunctions.forEach((_, i) => {
    runComputePass(i);
  });
  runRenderBackgroundPass();
  runRenderPass();

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function runComputePass(functionNumber: number) {
  const computePipeline = computePipelines[functionNumber];

  const bindGroup = root.createBindGroup(computeLayout, {
    lineVertices: lineVerticesBuffers[functionNumber],
  });

  computePipeline
    .with(bindGroup)
    .dispatchThreads(properties.interpolationPoints);
}

function runRenderBackgroundPass() {
  renderBackgroundPipeline
    .withColorAttachment({
      view: msView,
      resolveTarget: context,
      clearValue: [1, 1, 1, 1],
    })
    .draw(4, 2);
}

function runRenderPass() {
  initialFunctions.forEach((_, i) => {
    const renderBindGroup = root.createBindGroup(renderLayout, {
      lineVertices: lineVerticesBuffers[i],
      color: drawColorBuffers[i].buffer,
    });

    renderPipeline
      .with(renderBindGroup)
      .withColorAttachment({
        view: msView,
        resolveTarget: context,
        clearValue: [0.3, 0.3, 0.3, 1],
        loadOp: 'load',
      })
      // call our vertex shader 2 times per point drawn
      .draw(properties.interpolationPoints * 2);
  });
}

// Helper definitions

function fromHex(hex: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);

  return d.vec4f(r / 255.0, g / 255.0, b / 255.0, 1.0);
}

async function tryRecreateComputePipeline(
  functionCode: string,
): Promise<TgpuGuardedComputePipeline> {
  const codeToCompile = functionCode === '' ? '0' : functionCode;

  const computePipeline = createComputePipeline(codeToCompile);
  device.pushErrorScope('validation');
  root.unwrap(computePipeline.pipeline);
  const error = await device.popErrorScope();
  if (error) {
    throw new Error(`Invalid function f(x) = ${codeToCompile}.`);
  }

  return computePipeline;
}

function queuePropertiesBufferUpdate() {
  properties.inverseTransformation = mat4.inverse(
    properties.transformation,
    d.mat4x4f(),
  );
  propertiesUniform.write(properties);
}

// Canvas controls
let lastPos: number[] | null = null;

// Mouse interaction

canvas.addEventListener('mousedown', (event) => {
  lastPos = [event.clientX, event.clientY];
});

const mouseMoveEventListener = (event: MouseEvent) => {
  if (lastPos === null) {
    return;
  }
  const currentPos = [event.clientX, event.clientY];
  const translation = [
    (-(currentPos[0] - lastPos[0]) / canvas.width) *
    2.0 * window.devicePixelRatio,
    ((currentPos[1] - lastPos[1]) / canvas.height) *
    2.0 * window.devicePixelRatio,
    0.0,
  ];
  mat4.translate(
    properties.transformation,
    translation,
    properties.transformation,
  );

  lastPos = currentPos;
};
window.addEventListener('mousemove', mouseMoveEventListener);

const mouseUpEventListener = () => {
  lastPos = null;
};
window.addEventListener('mouseup', mouseUpEventListener);

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();

  const delta = Math.abs(event.deltaY) / 1000.0 + 1;
  const scale = event.deltaY > 0 ? delta : 1 / delta;

  mat4.scale(
    properties.transformation,
    [scale, scale, 1],
    properties.transformation,
  );
}, { passive: false });

// Touch interaction

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    lastPos = [event.touches[0].clientX, event.touches[0].clientY];
  }
}, { passive: false });

const touchMoveEventListener = (event: TouchEvent) => {
  if (lastPos === null || event.touches.length !== 1) {
    return;
  }
  const currentPos = [event.touches[0].clientX, event.touches[0].clientY];
  const s = 2.0 * window.devicePixelRatio;
  const translation = [
    ((currentPos[0] - lastPos[0]) / canvas.width) * -s,
    ((currentPos[1] - lastPos[1]) / canvas.height) * s,
    0.0,
  ];
  mat4.translate(
    properties.transformation,
    translation,
    properties.transformation,
  );

  lastPos = currentPos;
};
window.addEventListener('touchmove', touchMoveEventListener);

const touchEndEventListener = () => {
  lastPos = null;
};
window.addEventListener('touchend', touchEndEventListener);

// Resize observer and cleanup

const resizeObserver = new ResizeObserver(() => {
  const leftBot = properties.transformation.mul(d.vec4f(-1, -1, 0, 1));
  const rightTop = properties.transformation.mul(d.vec4f(1, 1, 0, 1));
  const currentCanvasRatio = (rightTop.x - leftBot.x) /
    (rightTop.y - leftBot.y);
  const desiredCanvasRatio = canvas.clientWidth / canvas.clientHeight;
  const rescaleMatrix = mat4.scaling(
    [desiredCanvasRatio / currentCanvasRatio, 1, 1],
    d.mat4x4f(),
  );
  properties.transformation = std.mul(properties.transformation, rescaleMatrix);

  msTexture.destroy();
  msTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    sampleCount: 4,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  msView = msTexture.createView();
});

resizeObserver.observe(canvas);

// #region Example controls and cleanup

export const controls = defineControls({
  [initialFunctions[0].name]: {
    initial: initialFunctions[0].code,
    async onTextChange(value: string) {
      computePipelines[0] = await tryRecreateComputePipeline(value);
    },
  },
  [initialFunctions[1].name]: {
    initial: initialFunctions[1].code,
    async onTextChange(value: string) {
      computePipelines[1] = await tryRecreateComputePipeline(value);
    },
  },
  [initialFunctions[2].name]: {
    initial: initialFunctions[2].code,
    async onTextChange(value: string) {
      computePipelines[2] = await tryRecreateComputePipeline(value);
    },
  },
  'line width': {
    initial: 0.01,
    min: 0.0,
    max: 0.025,
    step: 0.001,
    onSliderChange(value: number) {
      properties.lineWidth = value;
    },
  },
  'interpolation points count': {
    initial: 256,
    options: [4, 16, 64, 256, 1024, 4096],
    onSelectChange(value) {
      properties.interpolationPoints = value;

      const oldBuffers = lineVerticesBuffers;
      lineVerticesBuffers = createLineVerticesBuffers();
      oldBuffers.forEach((buffer, _) => {
        buffer.destroy();
      });
    },
  },
  Recenter: {
    async onButtonClick() {
      properties.transformation = d.mat4x4f.scaling(
        d.vec3f(canvas.clientWidth / canvas.clientHeight, 1, 1),
      );
    },
  },
});

export function onCleanup() {
  destroyed = true;
  window.removeEventListener('mouseup', mouseUpEventListener);
  window.removeEventListener('mousemove', mouseMoveEventListener);
  window.removeEventListener('touchmove', touchMoveEventListener);
  window.removeEventListener('touchend', touchEndEventListener);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
