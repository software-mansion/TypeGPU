import {
  caps,
  endCapSlot,
  LineControlPoint,
  lineSegmentIndices,
  lineSegmentVariableWidth,
  startCapSlot,
} from '@typegpu/geometry';
import tgpu, { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const context = root.configureContext({
  canvas: document.querySelector('canvas')!,
  alphaMode: 'premultiplied',
});

const GRID_SIZE = 4;

const MAX_JOIN_COUNT = 0; // I assume it's zero, as I want the line to be straight
const indices = lineSegmentIndices(MAX_JOIN_COUNT);
const indexBuffer = root.createBuffer(d.arrayOf(d.u16, indices.length), indices).$usage('index');

const mainVertex = tgpu.vertexFn({
  in: {
    instanceIndex: d.builtin.instanceIndex,
    vertexIndex: d.builtin.vertexIndex,
  },
  out: {
    outPos: d.builtin.position,
  },
})(({ vertexIndex, instanceIndex: arrowIdx }) => {
  'use gpu';
  const arrowX = arrowIdx % GRID_SIZE;
  const arrowY = d.u32(arrowIdx / GRID_SIZE);
  // An arrow pointing to the top-right corner
  const startPos = d.vec2f(arrowX, arrowY) / GRID_SIZE;
  const endPos = (d.vec2f(arrowX, arrowY) + 1) / GRID_SIZE;

  const A = LineControlPoint({
    position: startPos,
    radius: 0.02,
  });
  const B = LineControlPoint({
    position: std.mix(startPos, endPos, 0.25),
    radius: 0.02,
  });
  const C = LineControlPoint({
    position: std.mix(startPos, endPos, 0.75),
    radius: 0.02,
  });
  const D = LineControlPoint({
    position: endPos,
    radius: 0.02,
  });

  const result = lineSegmentVariableWidth(vertexIndex, A, B, C, D, MAX_JOIN_COUNT);

  return {
    outPos: d.vec4f(result.vertexPosition, 0, 1),
  };
});

const mainFragment = tgpu.fragmentFn({
  out: d.vec4f,
})(() => {
  'use gpu';
  return d.vec4f(1, 0, 0, 1);
});

const pipeline = root
  .with(startCapSlot, caps.butt)
  .with(endCapSlot, caps.arrow)
  .createRenderPipeline({
    vertex: mainVertex,
    fragment: mainFragment,
  })
  .withIndexBuffer(indexBuffer)
  .withColorAttachment({
    view: context,
    clearValue: [1, 1, 1, 1],
  });

const draw = () => {
  pipeline.drawIndexed(indices.length, GRID_SIZE * GRID_SIZE);
};

function frame() {
  draw();
  frameId = requestAnimationFrame(frame);
}

let frameId = requestAnimationFrame(frame);

// #region Example controls & Cleanup

export const controls = defineControls({
  Randomize: {
    onButtonClick() {},
  },
});

export function onCleanup() {
  root.destroy();
  cancelAnimationFrame(frameId);
}

// #endregion

/*
import tgpu, { d, std } from 'typegpu';
import { randf } from '@typegpu/noise';
import type { AnyWgslData } from 'typegpu/data';

// { device: { optionalFeatures: ['shader-f16'] } }
const root = await tgpu.init();

const size = 4;

const arrayNxN = <T extends AnyWgslData>(element: T, w: number, h: number) =>
  d.arrayOf(d.arrayOf(element, w), h);

const displacementBuffer = root.createBuffer(arrayNxN(d.vec2h, size, size)).$usage('storage');
const displacementPackedBuffer = root
  .createBuffer(arrayNxN(d.u32, size, size), root.unwrap(displacementBuffer))
  .$usage('storage');

const displacementView = displacementBuffer.as('mutable');
const displacementPackedView = displacementPackedBuffer.as('mutable');

function main(x: number, y: number) {
  'use gpu';

  const dir = randf.onUnitCircle();

  if (std.extensionEnabled('f16')) {
    displacementView.$[x][y] = d.vec2h(dir);
  } else {
    displacementPackedView.$[x][y] = std.pack2x16float(dir);
  }
}

const pipeline = root.createGuardedComputePipeline(main);

pipeline.dispatchThreads(size, size);

console.log(await displacementBuffer.read());

*/
