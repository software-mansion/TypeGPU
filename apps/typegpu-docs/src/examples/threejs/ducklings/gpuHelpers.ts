import type * as t3 from '@typegpu/three';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { StorageBufferNode, UniformNode } from 'three/webgpu';
import { BOUNDS, NeighborIndices, Normals, WIDTH } from './consts.ts';

/**
 * Creates GPU helper functions for height field calculations.
 * These functions use closure to access the storage buffers and uniforms.
 */
export function createGpuHelpers(
  heightStorageA: t3.TSLAccessor<d.WgslArray<typeof d.f32>, StorageBufferNode>,
  heightStorageB: t3.TSLAccessor<d.WgslArray<typeof d.f32>, StorageBufferNode>,
  readFromA: t3.TSLAccessor<typeof d.u32, UniformNode<number>>,
) {
  const getNeighborIndices = (index: number) => {
    'use gpu';
    const width = d.u32(WIDTH);
    const x = d.i32(std.mod(index, WIDTH));
    const y = d.i32(std.div(index, WIDTH));

    const leftX = std.max(0, std.sub(x, 1));
    const rightX = std.min(std.add(x, 1), std.sub(d.i32(width), 1));
    const bottomY = std.max(0, std.sub(y, 1));
    const topY = std.min(std.add(y, 1), std.sub(d.i32(width), 1));

    const westIndex = d.u32(std.add(std.mul(y, d.i32(width)), leftX));
    const eastIndex = d.u32(std.add(std.mul(y, d.i32(width)), rightX));
    const southIndex = d.u32(std.add(std.mul(bottomY, d.i32(width)), x));
    const northIndex = d.u32(std.add(std.mul(topY, d.i32(width)), x));

    return NeighborIndices({ northIndex, southIndex, eastIndex, westIndex });
  };

  const getCurrentHeight = (index: number) => {
    'use gpu';
    return std.select(
      heightStorageB.$[index],
      heightStorageA.$[index],
      readFromA.$ === 1,
    );
  };

  const getCurrentNormals = (index: number) => {
    'use gpu';
    const neighbors = getNeighborIndices(index);
    const northIndex = neighbors.northIndex;
    const southIndex = neighbors.southIndex;
    const eastIndex = neighbors.eastIndex;
    const westIndex = neighbors.westIndex;

    const north = getCurrentHeight(northIndex);
    const south = getCurrentHeight(southIndex);
    const east = getCurrentHeight(eastIndex);
    const west = getCurrentHeight(westIndex);

    const normalX = std.mul(std.sub(west, east), std.div(WIDTH, BOUNDS));
    const normalY = std.mul(std.sub(south, north), std.div(WIDTH, BOUNDS));

    return Normals({ normalX, normalY });
  };

  return {
    getNeighborIndices,
    getCurrentHeight,
    getCurrentNormals,
  };
}
