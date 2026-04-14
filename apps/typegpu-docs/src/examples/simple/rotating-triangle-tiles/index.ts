import tgpu, { d } from 'typegpu';
import { colors, originalVertices } from './geometry.ts';
import { createBezier } from './bezier.ts';
import {
  createRotationScaleMatrix,
  createInstanceInfoArrays,
  InstanceInfoArray,
} from './instanceInfo.ts';
import {
  getCubicBezierControlPointsString,
  INITIAL_STEP_ROTATION,
  INIT_TILE_DENSITY,
  animationDuration,
  cubicBezierControlPoints,
  parseControlPoints,
  ROTATION_OPTIONS,
  updateAnimationDuration,
  updateAspectRatio,
  updateCubicBezierControlPoints,
  updateGridParams,
  updateStepRotation,
} from './params.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const root = await tgpu.init();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const Uniforms = d.struct({
  color: d.vec4f,
  foregroundTransform: d.mat3x3f,
  midgroundTransform: d.mat3x3f,
});
const layerTransformAccess = tgpu.accessor(d.mat3x3f);

const instanceInfoLayout = tgpu.bindGroupLayout({
  instanceInfo: { storage: InstanceInfoArray },
});

let ease = createBezier(cubicBezierControlPoints);
let stepRotation = INITIAL_STEP_ROTATION;
let middleSquareScale = updateStepRotation(stepRotation);
let uniformsState: d.Infer<typeof Uniforms> = {
  color: colors[1],
  foregroundTransform: d.mat3x3f.identity(),
  midgroundTransform: d.mat3x3f.identity(),
};

const uniforms = root.createUniform(Uniforms, uniformsState);
let { allRowInstances, checkerboardInstances } = createInstanceInfos();
let stencilTexture = createStencilTexture();
let drawOverNeighbors = false;

function updateLayerTransforms(animationProgress: number) {
  const smallestLoopingRotationAngle = 120;
  const midgroundAngle =
    (stepRotation % smallestLoopingRotationAngle) + animationProgress * stepRotation;
  const midgroundScale = 0.5 + animationProgress * (middleSquareScale - 0.5);

  uniformsState = {
    ...uniformsState,
    foregroundTransform: createRotationScaleMatrix(
      0.5 * animationProgress,
      animationProgress * stepRotation,
    ),
    midgroundTransform: createRotationScaleMatrix(midgroundScale, midgroundAngle),
  };
}

function createInstanceInfos() {
  const { allRows, checkerboardGroups } = createInstanceInfoArrays(
    updateAspectRatio(canvas.width, canvas.height),
  );
  const makeGroup = (infos: d.m3x3f[]) => {
    const buf = root.createReadonly(InstanceInfoArray(infos.length), infos);
    return {
      bindGroup: root.createBindGroup(instanceInfoLayout, { instanceInfo: buf.buffer }),
      count: infos.length,
    };
  };
  return {
    allRowInstances: makeGroup(allRows),
    checkerboardInstances: checkerboardGroups.map(makeGroup),
  };
}

function createStencilTexture() {
  return root['~unstable']
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'stencil8',
    })
    .$usage('render');
}

const vertex = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: { outPos: d.builtin.position },
})(({ vertexIndex, instanceIndex }) => {
  'use gpu';
  const vertexPosition = d.vec2f(originalVertices.$[vertexIndex]);
  const transform = instanceInfoLayout.$.instanceInfo[instanceIndex] * layerTransformAccess.$;
  const position = transform.mul(d.vec3f(vertexPosition, 1)).xy;

  return { outPos: d.vec4f(position, 0, 1) };
});

const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(uniforms.$.color));

const shiftedColorSets = colors.map((_, shiftBy) => [
  ...colors.slice(shiftBy),
  ...colors.slice(0, shiftBy),
]);

const basePipeline = root
  .with(layerTransformAccess, tgpu.const(d.mat3x3f, d.mat3x3f.identity()))
  .createRenderPipeline({
    vertex,
    depthStencil: {
      format: 'stencil8',
      stencilFront: { compare: 'always', passOp: 'replace' },
    },
  });

const layerDepthStencil = {
  format: 'stencil8',
  stencilFront: { compare: 'equal', passOp: 'increment-clamp' },
} as const;

const midgroundPipeline = root
  .with(layerTransformAccess, () => uniforms.$.midgroundTransform)
  .createRenderPipeline({ vertex, fragment, depthStencil: layerDepthStencil })
  .withStencilReference(1);

const foregroundPipeline = root
  .with(layerTransformAccess, () => uniforms.$.foregroundTransform)
  .createRenderPipeline({ vertex, fragment, depthStencil: layerDepthStencil })
  .withStencilReference(2);

type InstanceGroup = ReturnType<typeof createInstanceInfos>['allRowInstances'];
type PassSpec =
  | {
      kind: 'stencil';
      instances: InstanceGroup;
      stencilReference: number;
      stencilLoadOp: GPULoadOp;
    }
  | {
      kind: 'color';
      pipeline: typeof midgroundPipeline | typeof foregroundPipeline;
      instances: InstanceGroup;
      stencilReference: number;
      colorLoadOp: GPULoadOp;
      color: (typeof colors)[number];
      clearColor?: (typeof colors)[number];
    };

function makePassGroup(
  instances: InstanceGroup,
  stencilRef: number,
  isFirst: boolean,
  colors: d.v4f[],
): PassSpec[] {
  const loadOp: GPULoadOp = isFirst ? 'clear' : 'load';
  return [
    { kind: 'stencil', instances, stencilReference: stencilRef, stencilLoadOp: loadOp },
    {
      kind: 'color',
      pipeline: midgroundPipeline,
      instances,
      stencilReference: stencilRef,
      colorLoadOp: loadOp,
      color: colors[1],
      ...(isFirst ? { clearColor: colors[0] } : {}),
    },
    {
      kind: 'color',
      pipeline: foregroundPipeline,
      instances,
      stencilReference: stencilRef + 1,
      colorLoadOp: 'load',
      color: colors[2],
    },
  ];
}

function createDrawOverNeighborsPasses(shiftedColors: d.v4f[]): PassSpec[] {
  return makePassGroup(allRowInstances, 1, true, shiftedColors);
}

function createCheckerboardPasses(shiftedColors: (typeof shiftedColorSets)[number]): PassSpec[] {
  return checkerboardInstances.flatMap((instances, i) =>
    makePassGroup(instances, 1 + i * 3, i === 0, shiftedColors),
  );
}

function runPasses(passSpecs: PassSpec[]) {
  passSpecs.forEach((pass) => {
    if (pass.kind === 'stencil') {
      basePipeline
        .withStencilReference(pass.stencilReference)
        .withDepthStencilAttachment({
          view: stencilTexture,
          stencilLoadOp: pass.stencilLoadOp,
          stencilStoreOp: 'store',
          ...(pass.stencilLoadOp === 'clear' ? { stencilClearValue: 0 } : {}),
        })
        .with(pass.instances.bindGroup)
        .draw(3, pass.instances.count);
      return;
    }

    uniforms.write({ ...uniformsState, color: pass.color });
    pass.pipeline
      .withStencilReference(pass.stencilReference)
      .withColorAttachment({
        view: context,
        loadOp: pass.colorLoadOp,
        ...(pass.clearColor ? { clearValue: pass.clearColor } : {}),
      })
      .withDepthStencilAttachment({
        view: stencilTexture,
        stencilLoadOp: 'load',
        stencilStoreOp: 'store',
      })
      .with(pass.instances.bindGroup)
      .draw(3, pass.instances.count);
  });
}

let animationFrame = requestAnimationFrame(function draw(timestamp: number) {
  const animationProgress = ease((timestamp % animationDuration) / animationDuration);
  updateLayerTransforms(animationProgress);
  const shiftedColors = shiftedColorSets[Math.floor(timestamp / animationDuration) % colors.length];
  const passSpecs = drawOverNeighbors
    ? createDrawOverNeighborsPasses(shiftedColors)
    : createCheckerboardPasses(shiftedColors);

  runPasses(passSpecs);

  animationFrame = requestAnimationFrame(draw);
});

const resizeObserver = new ResizeObserver(() => {
  updateGridParams();
  ({ allRowInstances, checkerboardInstances } = createInstanceInfos());
  stencilTexture.destroy();
  stencilTexture = createStencilTexture();
});

resizeObserver.observe(canvas);

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  resizeObserver.disconnect();
  stencilTexture.destroy();
  root.destroy();
}

export const controls = {
  'Tile density': {
    initial: INIT_TILE_DENSITY,
    min: 0.01,
    max: 1.33,
    step: 0.01,
    onSliderChange(newValue: number) {
      updateGridParams(newValue);
      ({ allRowInstances, checkerboardInstances } = createInstanceInfos());
    },
  },
  'Animation duration': {
    initial: animationDuration,
    min: 250,
    max: 3500,
    step: 25,
    onSliderChange: updateAnimationDuration,
  },
  'Rotation in degrees': {
    initial: INITIAL_STEP_ROTATION,
    options: ROTATION_OPTIONS,
    onSelectChange(newValue: number) {
      stepRotation = newValue;
      middleSquareScale = updateStepRotation(newValue);
    },
  },
  'Draw over neighbors': {
    initial: false,
    onToggleChange(value: boolean) {
      drawOverNeighbors = value;
    },
  },
  'Cubic Bezier Control Points': {
    initial: getCubicBezierControlPointsString(),
    async onTextChange(value: string) {
      const newPoints = parseControlPoints(value);
      updateCubicBezierControlPoints(newPoints);
      ease = createBezier(newPoints);
    },
  },
  'Edit Cubic Bezier Points': {
    onButtonClick: () => {
      window.open(`https://cubic-bezier.com/?#${cubicBezierControlPoints.join()}`, '_blank');
    },
  },
};
