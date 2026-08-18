import { d, std, tgpu } from 'typegpu';
import { directionalScalarIndex } from './cross-scan.ts';
import { componentAt } from './helpers.ts';
import { scanProjectLayout } from './layouts.ts';
import {
  MAX_SELECTIVE_SCAN_RANK,
  type ScanProjectShape,
  scanProjectOutputBlocks,
  scanProjectThreadsFor,
  SELECTIVE_SCAN_STATE_SIZE,
} from './types.ts';

const sharedRankValues = tgpu.workgroupVar(d.arrayOf(d.f32, MAX_SELECTIVE_SCAN_RANK));

/**
 * Shape-specialized scan projection.
 *
 * Channel counts, rank and traversal extents become compile-time literals, so
 * the reference kernel's 63.6-66.4% integer-and-conditional share loses its
 * source: no bound, divisor or block count is read from the uniform. The
 * direction moves onto the dispatch y dimension, which removes the division that
 * recovered it from a flat workgroup index, and the launch is sized to the work
 * instead of a flat 128 lanes.
 *
 * Every rank in this model is a multiple of four and every channel count fills
 * its blocks exactly, so both partial-lane guards prune away. The scalar FMA
 * order inside each row is unchanged, which keeps the result bit-identical to
 * the reference kernel.
 */
export const createSpecializedScanProjectKernel = (shape: ScanProjectShape) => {
  const { width, height, logicalChannels, channelBlocks, rank } = shape;
  const xProjectionChannels = rank + SELECTIVE_SCAN_STATE_SIZE * 2;
  const xProjectionBlocks = scanProjectOutputBlocks(rank);
  const rankBlocks = Math.ceil(rank / 4);
  const threads = scanProjectThreadsFor(shape);
  const maskChannels = logicalChannels !== channelBlocks * 4;
  const maskRank = rank !== rankBlocks * 4;
  const guardProjection = threads !== xProjectionBlocks;
  const guardChannels = threads !== channelBlocks;

  return tgpu.computeFn({
    in: { lid: d.builtin.localInvocationId, wgid: d.builtin.workgroupId },
    workgroupSize: [threads],
  })(({ lid, wgid }) => {
    'use gpu';
    const position = wgid.x;
    const direction = wgid.y;
    // Inlined rather than calling `crossScanSourcePixel`, because a shared
    // function takes the extents as parameters and the divisor stays dynamic.
    // With literals the compiler strength-reduces the division.
    let traversalPosition = position;
    if (direction >= 2) {
      traversalPosition = d.u32(width * height - 1) - traversalPosition;
    }
    let sourcePixel = traversalPosition;
    if (direction === 1 || direction === 3) {
      sourcePixel = (traversalPosition % height) * width + std.intdiv(traversalPosition, height);
    }
    const outputBlock = lid.x;

    if (!guardProjection || outputBlock < xProjectionBlocks) {
      let result0 = d.f32(0);
      let result1 = d.f32(0);
      let result2 = d.f32(0);
      let result3 = d.f32(0);
      for (let inputBlock = d.u32(0); inputBlock < channelBlocks; inputBlock += 1) {
        const source = scanProjectLayout.$.src[sourcePixel * channelBlocks + inputBlock];
        const tileBase =
          scanProjectLayout.$.params.xProjectionWeightBase +
          ((direction * xProjectionBlocks + outputBlock) * channelBlocks + inputBlock) * 4;
        const weights0 = scanProjectLayout.$.weights[tileBase];
        const weights1 = scanProjectLayout.$.weights[tileBase + 1];
        const weights2 = scanProjectLayout.$.weights[tileBase + 2];
        const weights3 = scanProjectLayout.$.weights[tileBase + 3];
        for (const inputLane of tgpu.unroll([0, 1, 2, 3])) {
          if (!maskChannels || inputBlock * 4 + inputLane < logicalChannels) {
            const sourceValue = componentAt(source, inputLane);
            result0 = std.fma(sourceValue, componentAt(weights0, inputLane), result0);
            result1 = std.fma(sourceValue, componentAt(weights1, inputLane), result1);
            result2 = std.fma(sourceValue, componentAt(weights2, inputLane), result2);
            result3 = std.fma(sourceValue, componentAt(weights3, inputLane), result3);
          }
        }
      }

      const projected = d.vec4f(result0, result1, result2, result3);
      for (const outputLane of tgpu.unroll([0, 1, 2, 3])) {
        const row = outputBlock * 4 + outputLane;
        const value = componentAt(projected, outputLane);
        if (row < rank) {
          sharedRankValues.$[row] = value;
        } else if (row < rank + SELECTIVE_SCAN_STATE_SIZE) {
          scanProjectLayout.$.b[
            (direction * SELECTIVE_SCAN_STATE_SIZE + (row - rank)) * shape.positionCount + position
          ] = value;
        } else if (row < xProjectionChannels) {
          scanProjectLayout.$.c[
            (direction * SELECTIVE_SCAN_STATE_SIZE + (row - rank - SELECTIVE_SCAN_STATE_SIZE)) *
              shape.positionCount +
              position
          ] = value;
        }
      }
    }

    std.workgroupBarrier();

    if (!guardChannels || outputBlock < channelBlocks) {
      let projectedDelta0 = d.f32(0);
      let projectedDelta1 = d.f32(0);
      let projectedDelta2 = d.f32(0);
      let projectedDelta3 = d.f32(0);
      for (let rankBlock = d.u32(0); rankBlock < rankBlocks; rankBlock += 1) {
        const rankBase = rankBlock * 4;
        const rankVector = d.vec4f(
          sharedRankValues.$[rankBase],
          sharedRankValues.$[rankBase + 1],
          sharedRankValues.$[rankBase + 2],
          sharedRankValues.$[rankBase + 3],
        );
        const tileBase =
          scanProjectLayout.$.params.dtProjectionWeightBase +
          ((direction * channelBlocks + outputBlock) * rankBlocks + rankBlock) * 4;
        const weights0 = scanProjectLayout.$.weights[tileBase];
        const weights1 = scanProjectLayout.$.weights[tileBase + 1];
        const weights2 = scanProjectLayout.$.weights[tileBase + 2];
        const weights3 = scanProjectLayout.$.weights[tileBase + 3];
        for (const rankLane of tgpu.unroll([0, 1, 2, 3])) {
          if (!maskRank || rankBase + rankLane < rank) {
            const rankValue = componentAt(rankVector, rankLane);
            projectedDelta0 = std.fma(rankValue, componentAt(weights0, rankLane), projectedDelta0);
            projectedDelta1 = std.fma(rankValue, componentAt(weights1, rankLane), projectedDelta1);
            projectedDelta2 = std.fma(rankValue, componentAt(weights2, rankLane), projectedDelta2);
            projectedDelta3 = std.fma(rankValue, componentAt(weights3, rankLane), projectedDelta3);
          }
        }
      }

      const projectedDelta = d.vec4f(
        projectedDelta0,
        projectedDelta1,
        projectedDelta2,
        projectedDelta3,
      );
      for (const outputLane of tgpu.unroll([0, 1, 2, 3])) {
        const outputChannel = outputBlock * 4 + outputLane;
        if (!maskChannels || outputChannel < logicalChannels) {
          scanProjectLayout.$.delta[
            directionalScalarIndex(
              direction,
              outputChannel,
              position,
              d.u32(logicalChannels),
              d.u32(shape.positionCount),
            )
          ] = componentAt(projectedDelta, outputLane);
        }
      }
    }
  });
};
