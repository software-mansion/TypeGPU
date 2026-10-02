import {
  caps,
  endCapSlot,
  LineControlPoint,
  lineSegmentIndices,
  polylineVariableWidth,
  startCapSlot,
} from '@typegpu/geometry';
import { d, std, tgpu, type TgpuRoot, type ValidateUniformSchema } from 'typegpu';
import { randf } from '@typegpu/noise';

// Schema helper for creating a 2d square array
const arrayNxN = <T extends d.AnyWgslData>(element: T, n: number) =>
  d.arrayOf(d.arrayOf(element, n), n);

function createMirroredUniform<T extends d.AnyWgslData>(
  root: TgpuRoot,
  schema: ValidateUniformSchema<T>,
  initial: d.Infer<T>,
) {
  let cpuValue = initial;
  const uniform = root.createUniform(schema, initial);

  return {
    get $() {
      return uniform.$;
    },
    get value() {
      return cpuValue;
    },
    set value(value: d.Infer<T>) {
      cpuValue = value;
      uniform.write(value);
    },
  };
}

function tryUnpackVec2h(input: d.v2h | number): d.v2h | d.v2f {
  'use gpu';
  if (std.extensionEnabled('f16') || (input as d.v2h).kind === 'vec2h') {
    // Nothing to unpack
    return d.vec2h(input as d.v2h);
  }
  return std.unpack2x16float(input as number);
}

function tryPackVec2h(input: d.v2h | d.v2f): d.v2h | number {
  'use gpu';
  if (std.extensionEnabled('f16') || (input as d.v2h).kind === 'vec2h') {
    // Nothing to pack
    return d.vec2h(input as d.v2h);
  }
  return std.pack2x16float(input as d.v2f);
}

function encroach<T extends d.v2h | d.v2f>(
  from: T,
  to: T,
  factorPerSecond: number,
  deltaSeconds: number,
): T {
  'use gpu';
  const diff = (to - from) as T;
  const factor = factorPerSecond ** deltaSeconds;
  return (from + ((diff * (1 - factor)) as T)) as T;
}

const GRID_SIZE = 200;

export async function setupScene(root: TgpuRoot, context: GPUCanvasContext) {
  const NATIVE_F16 = root.enabledFeatures.has('shader-f16');

  const dtUniform = root.createUniform(d.f32);
  const iteration = createMirroredUniform(root, d.u32, 0);
  const displacementBuffer = root.createBuffer(arrayNxN(d.vec2h, GRID_SIZE)).$usage('storage');
  const displacementPackedBuffer = root
    .createBuffer(arrayNxN(d.u32, GRID_SIZE), root.unwrap(displacementBuffer))
    .$usage('storage');

  const displacementMutable = NATIVE_F16
    ? displacementBuffer.as('mutable')
    : displacementPackedBuffer.as('mutable');
  const displacementReadonly = NATIVE_F16
    ? displacementBuffer.as('readonly')
    : displacementPackedBuffer.as('readonly');

  const pipeline = root.createGuardedComputePipeline((x, y) => {
    'use gpu';

    randf.seed3(d.vec3f(x, y, iteration.$));
    const dir = randf.onUnitCircle();

    displacementMutable.$[x][y] = tryPackVec2h(dir);
  });

  // Initial run
  pipeline.dispatchThreads(GRID_SIZE, GRID_SIZE);

  const smoothDisplacementBuffer = root
    .createBuffer(arrayNxN(d.vec2h, GRID_SIZE))
    .$usage('storage');
  const smoothDisplacementPackedBuffer = root
    .createBuffer(arrayNxN(d.u32, GRID_SIZE), root.unwrap(smoothDisplacementBuffer))
    .$usage('storage');

  const smoothDisplacementMutable = NATIVE_F16
    ? smoothDisplacementBuffer.as('mutable')
    : smoothDisplacementPackedBuffer.as('mutable');
  const smoothDisplacementReadonly = NATIVE_F16
    ? smoothDisplacementBuffer.as('readonly')
    : smoothDisplacementPackedBuffer.as('readonly');

  const smoothPipeline = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const prev = tryUnpackVec2h(smoothDisplacementMutable.$[x][y]);
    const target = tryUnpackVec2h(displacementReadonly.$[x][y]);
    smoothDisplacementMutable.$[x][y] = tryPackVec2h(encroach(prev, target, 0.01, dtUniform.$));
  });

  const MAX_JOIN_COUNT = 1;
  const indices = lineSegmentIndices(MAX_JOIN_COUNT);
  const indexBuffer = root.createBuffer(d.arrayOf(d.u16, indices.length), indices).$usage('index');

  const renderPipeline = root
    .with(startCapSlot, caps.butt)
    .with(endCapSlot, caps.arrow)
    .createRenderPipeline({
      vertex: ({ $instanceIndex: arrowIdx, $vertexIndex }) => {
        'use gpu';
        const arrowX = arrowIdx % GRID_SIZE;
        const arrowY = d.u32(arrowIdx / GRID_SIZE);
        // An arrow pointing to the top-right corner
        const startPos = d.vec2f(arrowX, arrowY) / GRID_SIZE;
        const disp = tryUnpackVec2h(smoothDisplacementReadonly.$[arrowX][arrowY]);
        const endPos = (d.vec2f(arrowX, arrowY) + std.normalize(d.vec2f(disp)) * 1.5) / GRID_SIZE;

        const radius = 0.1 / GRID_SIZE;
        const A = LineControlPoint({
          position: startPos,
          radius: radius,
        });
        const D = LineControlPoint({
          position: endPos,
          radius: radius,
        });

        const result = polylineVariableWidth(A, A, D, D, $vertexIndex, MAX_JOIN_COUNT);

        return {
          $position: d.vec4f(result.vertexPosition * 2 - 1, 0, 1),
          color: d.vec3f(d.vec2f(disp), 1),
        };
      },
      fragment: ({ color }) => {
        'use gpu';
        return d.vec4f(color, 1);
      },
    })
    .withIndexBuffer(indexBuffer)
    .withColorAttachment({
      view: context,
      clearValue: [0, 0.1, 0.2, 1],
    });

  console.log(tgpu.resolve([renderPipeline]));

  let lastTime: number | undefined = undefined;
  function frame(timestamp: number) {
    if (lastTime) {
      dtUniform.write((timestamp - lastTime) * 0.001);
    }
    lastTime = timestamp;

    smoothPipeline.dispatchThreads(GRID_SIZE, GRID_SIZE);
    renderPipeline.drawIndexed(indices.length, GRID_SIZE * GRID_SIZE);
    frameId = requestAnimationFrame(frame);
  }

  let frameId = requestAnimationFrame(frame);

  return {
    randomize() {
      iteration.value++;
      pipeline.dispatchThreads(GRID_SIZE, GRID_SIZE);
    },
    onCleanup() {
      cancelAnimationFrame(frameId);
    },
  };
}
