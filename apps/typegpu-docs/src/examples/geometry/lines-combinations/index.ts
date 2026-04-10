import {
  caps,
  endCapSlot,
  joins,
  joinSlot,
  lineSegmentIndices,
  lineSegmentLeftIndices,
  lineSegmentVariableWidth,
  lineSegmentWireframeIndices,
  startCapSlot,
} from '@typegpu/geometry';
import tgpu, { type ColorAttachment } from 'typegpu';
import {
  arrayOf,
  builtin,
  f32,
  interpolate,
  struct,
  u16,
  u32,
  vec2f,
  vec3f,
  vec4f,
} from 'typegpu/data';
import { clamp, cos, fwidth, min, mix, select, sin, smoothstep } from 'typegpu/std';
import { TEST_SEGMENT_COUNT } from './constants.ts';
import { testCases } from './testCases.ts';
import { defineControls } from '../../common/defineControls.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas');
const context = canvas?.getContext('webgpu');

if (!canvas) {
  throw new Error('Could not find canvas');
}
if (!context) {
  throw new Error('Could not create WebGPU context');
}

const adapter = await navigator.gpu.requestAdapter({
  powerPreference: 'high-performance',
});
const device = await adapter?.requestDevice({
  requiredFeatures: ['timestamp-query'],
});
if (!device) {
  throw new Error('Could not get WebGPU device');
}
const root = tgpu.initFromDevice({ device });

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let msaaTexture: GPUTexture;
let msaaTextureView: GPUTextureView;

const createDepthAndMsaaTextures = () => {
  if (msaaTexture) {
    msaaTexture.destroy();
  }
  msaaTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: presentationFormat,
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  msaaTextureView = msaaTexture.createView();
};

createDepthAndMsaaTextures();
const resizeObserver = new ResizeObserver(createDepthAndMsaaTextures);
resizeObserver.observe(canvas);

const Uniforms = struct({
  time: f32,
  fillType: u32,
});

const uniformsBuffer = root
  .createBuffer(Uniforms, {
    time: 0,
    fillType: 1,
  })
  .$usage('uniform');

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: Uniforms,
  },
});

const uniformsBindGroup = root.createBindGroup(bindGroupLayout, {
  uniforms: uniformsBuffer,
});

const MAX_JOIN_COUNT = 6;
const indices = lineSegmentIndices(MAX_JOIN_COUNT);
const indicesLeft = lineSegmentLeftIndices(MAX_JOIN_COUNT);
const wireframeIndices = lineSegmentWireframeIndices(MAX_JOIN_COUNT);

const indexBuffer = root.createBuffer(arrayOf(u16, indices.length), indices).$usage('index');

const indexBufferLeft = root
  .createBuffer(arrayOf(u16, indicesLeft.length), indicesLeft)
  .$usage('index');

const outlineIndexBuffer = root
  .createBuffer(arrayOf(u16, wireframeIndices.length), wireframeIndices)
  .$usage('index');

const testCaseSlot = tgpu.slot(testCases.arms);

const mainVertex = tgpu.vertexFn({
  in: {
    instanceIndex: builtin.instanceIndex,
    vertexIndex: builtin.vertexIndex,
  },
  out: {
    outPos: builtin.position,
    position: vec2f,
    uv: vec2f,
    instanceIndex: interpolate('flat', u32),
    vertexIndex: interpolate('flat', u32),
    situationIndex: interpolate('flat', u32),
  },
})(({ vertexIndex, instanceIndex }, Out) => {
  'use gpu';
  const t = bindGroupLayout.$.uniforms.time;
  const A = testCaseSlot.$(instanceIndex, t);
  const B = testCaseSlot.$(instanceIndex + 1, t);
  const C = testCaseSlot.$(instanceIndex + 2, t);
  const D = testCaseSlot.$(instanceIndex + 3, t);

  // disconnect lines if radius is < 0
  if (A.radius < 0 || B.radius < 0 || C.radius < 0 || D.radius < 0) {
    return Out();
  }

  const result = lineSegmentVariableWidth(vertexIndex, A, B, C, D, MAX_JOIN_COUNT);

  return {
    outPos: vec4f(result.vertexPosition * result.w, 0, result.w),
    position: result.vertexPosition,
    uv: vec2f(0, select(f32(0), f32(1), vertexIndex > 1)),
    instanceIndex,
    vertexIndex,
    situationIndex: 0,
  };
});

const mainFragment = tgpu.fragmentFn({
  in: {
    instanceIndex: interpolate('flat', u32),
    vertexIndex: interpolate('flat', u32),
    situationIndex: interpolate('flat', u32),
    frontFacing: builtin.frontFacing,
    screenPosition: builtin.position,
    position: vec2f,
    uv: vec2f,
  },
  out: vec4f,
})(({ instanceIndex, vertexIndex, situationIndex, frontFacing, screenPosition, position, uv }) => {
  'use gpu';
  const fillType = bindGroupLayout.$.uniforms.fillType;
  let color = vec3f();
  const colors = [
    vec3f(1, 0, 0), // 0
    vec3f(0, 1, 0), // 1
    vec3f(0, 0, 1), // 2
    vec3f(1, 0, 1), // 3
    vec3f(1, 1, 0), // 4
    vec3f(0, 1, 1), // 5
    vec3f(0.75, 0.25, 0.25), // 6
    vec3f(0.25, 0.75, 0.25), // 7
    vec3f(0.25, 0.25, 0.75), // 8
  ];
  if (fillType === 1) {
    // typegpu gradient
    color = mix(vec3f(0.77, 0.39, 1), vec3f(0.11, 0.44, 0.94), position.x * 0.5 + 0.5);
  }
  if (fillType === 2) {
    let t = cos(uv.y * 10);
    t = clamp(t / fwidth(t), 0, 1);
    color = mix(vec3f(0.77, 0.39, 1), vec3f(0.11, 0.44, 0.94), t);
  }
  if (fillType === 3) {
    color = vec3f(colors[vertexIndex % colors.length]);
  }
  if (fillType === 4) {
    color = vec3f(colors[instanceIndex % colors.length]);
  }
  if (fillType === 5) {
    color = vec3f(colors[situationIndex % colors.length]);
  }
  color = color * (0.8 + 0.2 * smoothstep(1, 0.5, uv.y));
  if (frontFacing) {
    return vec4f(color, 0.5);
  }
  return vec4f(
    color,
    select(f32(0), f32(1), (u32(screenPosition.x) >> 3) % 2 !== (u32(screenPosition.y) >> 3) % 2),
  );
});

const centerlineVertex = tgpu.vertexFn({
  in: {
    vertexIndex: builtin.vertexIndex,
  },
  out: {
    outPos: builtin.position,
  },
})(({ vertexIndex }) => {
  'use gpu';
  const t = bindGroupLayout.$.uniforms.time;
  const vertex = testCaseSlot.$(vertexIndex, t);
  if (vertex.radius < 0) {
    return {
      outPos: vec4f(),
    };
  }
  return {
    outPos: vec4f(vertex.position, 0, 1),
  };
});

const outlineFragment = tgpu.fragmentFn({
  in: {
    _unused: builtin.frontFacing,
  },
  out: vec4f,
})(() => {
  'use gpu';
  return vec4f(0, 0, 0, 0.2);
});

const alphaBlend: GPUBlendState = {
  color: {
    operation: 'add',
    srcFactor: 'src-alpha',
    dstFactor: 'one-minus-src-alpha',
  },
  alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
};

const CIRCLE_SEGMENT_COUNT = 256;
const CIRCLE_MIN_STEP = (2 * Math.PI) / CIRCLE_SEGMENT_COUNT;
const CIRCLE_MAX_STEP = Math.PI / 8;
const CIRCLE_DASH_LEN = 0.0025 * Math.PI;

const circlesVertex = tgpu.vertexFn({
  in: {
    instanceIndex: builtin.instanceIndex,
    vertexIndex: builtin.vertexIndex,
  },
  out: {
    outPos: builtin.position,
  },
})(({ instanceIndex, vertexIndex }) => {
  'use gpu';
  const t = bindGroupLayout.$.uniforms.time;
  const vertex = testCaseSlot.$(instanceIndex, t);
  if (vertex.radius < 0) {
    return {
      outPos: vec4f(),
    };
  }
  const step = clamp(CIRCLE_DASH_LEN / vertex.radius, CIRCLE_MIN_STEP, CIRCLE_MAX_STEP);
  const angle = min(2 * Math.PI, step * f32(vertexIndex));
  const unit = vec2f(cos(angle), sin(angle));
  return {
    outPos: vec4f(vertex.position + unit * vertex.radius, 0, 1),
  };
});

let testCase = testCases.arms;
let join = joins.round;
let startCap = caps.round;
let endCap = caps.round;

function createPipelines() {
  const fill = root
    .with(joinSlot, join)
    .with(startCapSlot, startCap)
    .with(endCapSlot, endCap)
    .with(testCaseSlot, testCase)
    .createRenderPipeline({
      vertex: mainVertex,
      fragment: mainFragment,
      targets: { format: presentationFormat, blend: alphaBlend },
      // primitive: {
      //   cullMode: 'back',
      // },
      multisample: { count: multisample ? 4 : 1 },
    })
    .withIndexBuffer(oneSided ? indexBufferLeft : indexBuffer);

  const outline = root
    .with(joinSlot, join)
    .with(startCapSlot, startCap)
    .with(endCapSlot, endCap)
    .with(testCaseSlot, testCase)
    .createRenderPipeline({
      vertex: mainVertex,
      fragment: outlineFragment,
      targets: { format: presentationFormat, blend: alphaBlend },
      primitive: {
        topology: 'line-list',
      },
      multisample: { count: multisample ? 4 : 1 },
    })
    .withIndexBuffer(outlineIndexBuffer);

  const centerline = root.with(testCaseSlot, testCase).createRenderPipeline({
    vertex: centerlineVertex,
    fragment: outlineFragment,
    targets: { format: presentationFormat, blend: alphaBlend },
    primitive: {
      topology: 'line-strip',
    },
    multisample: { count: multisample ? 4 : 1 },
  });

  const circles = root.with(testCaseSlot, testCase).createRenderPipeline({
    vertex: circlesVertex,
    fragment: outlineFragment,
    targets: { format: presentationFormat, blend: alphaBlend },
    primitive: {
      topology: 'line-list',
    },
    multisample: { count: multisample ? 4 : 1 },
  });

  return {
    fill,
    outline,
    centerline,
    circles,
  };
}

let multisample = true;
let showRadii = false;
let wireframe = false;
let oneSided = false;
let fillType = 1;
let animationSpeed = 1;
let reverse = false;

let pipelines = createPipelines();

const draw = (timeMs: number) => {
  uniformsBuffer.writePartial({
    time: timeMs * 1e-3,
  });
  const colorAttachment: ColorAttachment = {
    view: multisample ? msaaTextureView : context.getCurrentTexture().createView(),
    resolveTarget: multisample ? context.getCurrentTexture().createView() : undefined,
    clearValue: [1, 1, 1, 1],
    loadOp: 'load',
  };
  pipelines.fill
    .with(uniformsBindGroup)
    .withColorAttachment({ ...colorAttachment, loadOp: 'clear' })
    .withPerformanceCallback((start, end) => {
      if (frameId % 20 === 0) {
        console.log(`${(Number(end - start) * 1e-6).toFixed(2)} ms`);
      }
    })
    .drawIndexed(
      oneSided ? indicesLeft.length : indices.length,
      fillType === 0 ? 0 : TEST_SEGMENT_COUNT,
    );

  if (wireframe) {
    pipelines.outline
      .with(uniformsBindGroup)
      .withColorAttachment(colorAttachment)
      .drawIndexed(wireframeIndices.length, TEST_SEGMENT_COUNT);
  }
  if (showRadii) {
    pipelines.circles
      .with(uniformsBindGroup)
      .withColorAttachment(colorAttachment)
      .draw(CIRCLE_SEGMENT_COUNT + 1, TEST_SEGMENT_COUNT);

    pipelines.centerline
      .with(uniformsBindGroup)
      .withColorAttachment(colorAttachment)
      .draw(TEST_SEGMENT_COUNT);
  }
};

let time = 0;
let lastFrameTime = 0;
let frameId = -1;
const runAnimationFrame = (timeMs: number) => {
  const deltaTime = timeMs - lastFrameTime;
  draw(time);
  frameId = requestAnimationFrame(runAnimationFrame);
  time += deltaTime * animationSpeed * (reverse ? -1 : 1);
  lastFrameTime = timeMs;
};
runAnimationFrame(0);

const fillOptions = {
  none: 0,
  solid: 1,
  distanceToSegment: 2,
  triangle: 3,
  instance: 4,
  // situation: 5,
};

// #region Example controls & Cleanup

export const controls = defineControls({
  'MSAA x4': {
    initial: multisample,
    onToggleChange: (value: boolean) => {
      multisample = value;
      pipelines = createPipelines();
    },
  },
  'Test Case': {
    initial: Object.keys(testCases)[0],
    options: Object.keys(testCases),
    onSelectChange: async (selected) => {
      testCase = testCases[selected as keyof typeof testCases];
      pipelines = createPipelines();
    },
  },
  'Start Cap': {
    initial: 'round',
    options: Object.keys(caps),
    onSelectChange: async (selected) => {
      startCap = caps[selected as keyof typeof caps];
      pipelines = createPipelines();
    },
  },
  'End Cap': {
    initial: 'round',
    options: Object.keys(caps),
    onSelectChange: async (selected) => {
      endCap = caps[selected as keyof typeof caps];
      pipelines = createPipelines();
    },
  },
  Join: {
    initial: 'round',
    options: Object.keys(joins),
    onSelectChange: async (selected) => {
      join = joins[selected as keyof typeof joins];
      pipelines = createPipelines();
    },
  },
  Fill: {
    initial: 'solid',
    options: Object.keys(fillOptions),
    onSelectChange: async (selected) => {
      fillType = fillOptions[selected as keyof typeof fillOptions];
      uniformsBuffer.writePartial({ fillType });
    },
  },
  Wireframe: {
    initial: wireframe,
    onToggleChange: (value: boolean) => {
      wireframe = value;
    },
  },
  'One sided': {
    initial: oneSided,
    onToggleChange: (value: boolean) => {
      oneSided = value;
      pipelines = createPipelines();
    },
  },
  'Radius and centerline': {
    initial: showRadii,
    onToggleChange: (value: boolean) => {
      showRadii = value;
    },
  },
  'Animation speed': {
    initial: animationSpeed,
    min: 0,
    step: 0.001,
    max: 5,
    onSliderChange: (value) => {
      animationSpeed = value;
    },
  },
  Reverse: {
    initial: reverse,
    onToggleChange: (value: boolean) => {
      reverse = value;
    },
  },
});

export function onCleanup() {
  root.destroy();
  cancelAnimationFrame(frameId);
}

// #endregion
