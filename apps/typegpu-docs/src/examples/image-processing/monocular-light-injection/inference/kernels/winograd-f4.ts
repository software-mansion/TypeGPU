import { d, std, tgpu } from 'typegpu';
import { activationSlot, maskPaddedChannels } from './helpers.ts';
import { winogradF2InputLayout, winogradF2OutputLayout } from './layouts.ts';
import { MAX_COMPUTE_WORKGROUPS_PER_DIMENSION, WINOGRAD_F4_COEFFICIENTS } from './types.ts';
import {
  winogradF2DestinationIsF16Slot,
  winogradF2SourceIsF16Slot,
  winogradF2TransformedInputIsF16Slot,
} from './winograd-f2.ts';

/** One thread per row of a 6x6 patch, rather than one per coefficient */
export const WINOGRAD_F4_ROWS = 6;
export const WINOGRAD_F4_PAIRS_PER_WORKGROUP = 16;
const WINOGRAD_F4_WORKGROUP_SIZE = WINOGRAD_F4_ROWS * WINOGRAD_F4_PAIRS_PER_WORKGROUP;

const inputRows = tgpu.workgroupVar(
  d.arrayOf(d.vec4f, WINOGRAD_F4_PAIRS_PER_WORKGROUP * WINOGRAD_F4_COEFFICIENTS),
);

/** B^T d, all six outputs at once. Same expressions the branching form used */
const inputTransformRow = (x0: d.v4f, x1: d.v4f, x2: d.v4f, x3: d.v4f, x4: d.v4f, x5: d.v4f) => {
  'use gpu';
  const out = d.arrayOf(d.vec4f, 6)();
  out[0] = 4 * x0 - 5 * x2 + x4;
  out[1] = -4 * x1 - 4 * x2 + x3 + x4;
  out[2] = 4 * x1 - 4 * x2 - x3 + x4;
  out[3] = -2 * x1 - x2 + 2 * x3 + x4;
  out[4] = 2 * x1 - x2 - 2 * x3 + x4;
  out[5] = 4 * x1 - 5 * x3 + x5;
  return out;
};

/** A^T m, all four outputs at once */
const outputTransformRow = (x0: d.v4f, x1: d.v4f, x2: d.v4f, x3: d.v4f, x4: d.v4f, x5: d.v4f) => {
  'use gpu';
  const out = d.arrayOf(d.vec4f, 4)();
  out[0] = x0 + x1 + x2 + x3 + x4;
  out[1] = x1 - x2 + 2 * x3 - 2 * x4;
  out[2] = x1 + x2 + 4 * x3 + 4 * x4;
  out[3] = x1 - x2 + 8 * x3 - 8 * x4 + x5;
  return out;
};

const loadInputSource = (index: number) => {
  'use gpu';
  if (winogradF2SourceIsF16Slot.$) {
    const wordBase = index * 2;
    return d.vec4f(
      std.bitcast(
        d.vec2u,
        d.vec4h,
      )(d.vec2u(winogradF2InputLayout.$.src[wordBase], winogradF2InputLayout.$.src[wordBase + 1])),
    );
  }
  const wordBase = index * 4;
  return std.bitcast(
    d.vec4u,
    d.vec4f,
  )(
    d.vec4u(
      winogradF2InputLayout.$.src[wordBase],
      winogradF2InputLayout.$.src[wordBase + 1],
      winogradF2InputLayout.$.src[wordBase + 2],
      winogradF2InputLayout.$.src[wordBase + 3],
    ),
  );
};

const storeTransformedInput = (index: number, value: d.v4f) => {
  'use gpu';
  if (winogradF2TransformedInputIsF16Slot.$) {
    const words = std.bitcast(d.vec4h, d.vec2u)(d.vec4h(value));
    const wordBase = index * 2;
    winogradF2InputLayout.$.dst[wordBase] = words.x;
    winogradF2InputLayout.$.dst[wordBase + 1] = words.y;
  } else {
    const words = std.bitcast(d.vec4f, d.vec4u)(value);
    const wordBase = index * 4;
    winogradF2InputLayout.$.dst[wordBase] = words.x;
    winogradF2InputLayout.$.dst[wordBase + 1] = words.y;
    winogradF2InputLayout.$.dst[wordBase + 2] = words.z;
    winogradF2InputLayout.$.dst[wordBase + 3] = words.w;
  }
};

/** Masked 6x6 tile load followed by separable B^T d B in FP32 */
export const winogradF4InputTransformKernel = tgpu.computeFn({
  in: { lidx: d.builtin.localInvocationIndex, wgid: d.builtin.workgroupId },
  workgroupSize: [WINOGRAD_F4_WORKGROUP_SIZE],
})(({ lidx, wgid }) => {
  'use gpu';
  const params = winogradF2InputLayout.$.params;
  const pairLane = std.intdiv(lidx, WINOGRAD_F4_ROWS);
  const lane = lidx % WINOGRAD_F4_ROWS;
  const groupIndex = wgid.x + wgid.y * MAX_COMPUTE_WORKGROUPS_PER_DIMENSION;
  const pair = groupIndex * WINOGRAD_F4_PAIRS_PER_WORKGROUP + pairLane;
  const pairCount = params.tileCount * params.inputChannelBlocks;
  const sharedBase = pairLane * WINOGRAD_F4_COEFFICIENTS;
  const tile = std.intdiv(pair, params.inputChannelBlocks);
  const inputBlock = pair % params.inputChannelBlocks;

  const patch = d.arrayOf(d.vec4f, 6)();
  if (pair < pairCount) {
    const tileY = std.intdiv(tile, params.tilesX);
    const tileX = tile % params.tilesX;
    const inputY = d.i32(tileY * 4 + lane) - 1;
    if (inputY >= 0 && inputY < d.i32(params.height)) {
      const rowBase = d.u32(inputY) * params.width;
      for (const step of tgpu.unroll([0, 1, 2, 3, 4, 5])) {
        const inputX = d.i32(tileX * 4 + step) - 1;
        if (inputX >= 0 && inputX < d.i32(params.width)) {
          patch[step] = d.vec4f(
            loadInputSource((rowBase + d.u32(inputX)) * params.inputChannelBlocks + inputBlock),
          );
        }
      }
    }
  }

  const rowTransformed = inputTransformRow(
    patch[0],
    patch[1],
    patch[2],
    patch[3],
    patch[4],
    patch[5],
  );
  for (const step of tgpu.unroll([0, 1, 2, 3, 4, 5])) {
    inputRows.$[sharedBase + lane * 6 + step] = d.vec4f(rowTransformed[step]);
  }
  std.workgroupBarrier();

  if (pair < pairCount) {
    const columnTransformed = inputTransformRow(
      inputRows.$[sharedBase + lane],
      inputRows.$[sharedBase + 6 + lane],
      inputRows.$[sharedBase + 12 + lane],
      inputRows.$[sharedBase + 18 + lane],
      inputRows.$[sharedBase + 24 + lane],
      inputRows.$[sharedBase + 30 + lane],
    );
    for (const step of tgpu.unroll([0, 1, 2, 3, 4, 5])) {
      storeTransformedInput(
        ((step * 6 + lane) * params.tileCount + tile) * params.inputChannelBlocks + inputBlock,
        columnTransformed[step],
      );
    }
  }
});

const outputRows = tgpu.workgroupVar(d.arrayOf(d.vec4f, WINOGRAD_F4_PAIRS_PER_WORKGROUP * 24));

const storeOutput = (index: number, value: d.v4f) => {
  'use gpu';
  if (winogradF2DestinationIsF16Slot.$) {
    const words = std.bitcast(d.vec4h, d.vec2u)(d.vec4h(value));
    const wordBase = index * 2;
    winogradF2OutputLayout.$.dst[wordBase] = words.x;
    winogradF2OutputLayout.$.dst[wordBase + 1] = words.y;
  } else {
    const words = std.bitcast(d.vec4f, d.vec4u)(value);
    const wordBase = index * 4;
    winogradF2OutputLayout.$.dst[wordBase] = words.x;
    winogradF2OutputLayout.$.dst[wordBase + 1] = words.y;
    winogradF2OutputLayout.$.dst[wordBase + 2] = words.z;
    winogradF2OutputLayout.$.dst[wordBase + 3] = words.w;
  }
};

/** Separable A^T M A, bias, activation and final precision conversion */
export const winogradF4OutputTransformKernel = tgpu.computeFn({
  in: { lidx: d.builtin.localInvocationIndex, wgid: d.builtin.workgroupId },
  workgroupSize: [WINOGRAD_F4_WORKGROUP_SIZE],
})(({ lidx, wgid }) => {
  'use gpu';
  const params = winogradF2OutputLayout.$.params;
  const pairLane = std.intdiv(lidx, WINOGRAD_F4_ROWS);
  const lane = lidx % WINOGRAD_F4_ROWS;
  const groupIndex = wgid.x + wgid.y * MAX_COMPUTE_WORKGROUPS_PER_DIMENSION;
  const pair = groupIndex * WINOGRAD_F4_PAIRS_PER_WORKGROUP + pairLane;
  const pairCount = params.tileCount * params.outputChannelBlocks;
  const rowsBase = pairLane * 24;
  const tile = std.intdiv(pair, params.outputChannelBlocks);
  const outputBlock = pair % params.outputChannelBlocks;

  const coefficients = d.arrayOf(d.vec4f, 6)();
  if (pair < pairCount) {
    for (const step of tgpu.unroll([0, 1, 2, 3, 4, 5])) {
      coefficients[step] = d.vec4f(
        winogradF2OutputLayout.$.src[
          ((lane * 6 + step) * params.tileCount + tile) * params.outputChannelBlocks + outputBlock
        ],
      );
    }
  }

  const rowTransformed = outputTransformRow(
    coefficients[0],
    coefficients[1],
    coefficients[2],
    coefficients[3],
    coefficients[4],
    coefficients[5],
  );
  for (const step of tgpu.unroll([0, 1, 2, 3])) {
    outputRows.$[rowsBase + lane * 4 + step] = d.vec4f(rowTransformed[step]);
  }
  std.workgroupBarrier();

  if (pair < pairCount && lane < 4) {
    const columnTransformed = outputTransformRow(
      outputRows.$[rowsBase + lane],
      outputRows.$[rowsBase + 4 + lane],
      outputRows.$[rowsBase + 8 + lane],
      outputRows.$[rowsBase + 12 + lane],
      outputRows.$[rowsBase + 16 + lane],
      outputRows.$[rowsBase + 20 + lane],
    );
    const tileY = std.intdiv(tile, params.tilesX);
    const tileX = tile % params.tilesX;
    const x = tileX * 4 + lane;
    for (const step of tgpu.unroll([0, 1, 2, 3])) {
      const y = tileY * 4 + step;
      if (y < params.height && x < params.width) {
        let transformed = d.vec4f(columnTransformed[step]);
        transformed += winogradF2OutputLayout.$.bias[params.biasBase + outputBlock];
        transformed = maskPaddedChannels(
          activationSlot.$(transformed),
          outputBlock,
          params.logicalOutputChannels,
        );
        storeOutput((y * params.width + x) * params.outputChannelBlocks + outputBlock, transformed);
      }
    }
  }
});
