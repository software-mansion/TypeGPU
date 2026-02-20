import type {
  TgpuBuffer,
  TgpuComputePipeline,
  TgpuRoot,
  UniformFlag,
  VertexFlag,
} from 'typegpu';
import tgpu, { d, std } from 'typegpu';
import { ComputeVertex, Vertex } from './dataTypes.ts';
import {
  calculateMidpoint,
  getAverageNormal,
  packVec2u,
  unpackVec2u,
} from './helpers.ts';

type IcosphereBuffer = TgpuBuffer<d.Disarray<typeof Vertex>> & VertexFlag;
type VertexType = d.Infer<typeof Vertex>;

/**
 * Calculates the number of vertices in the icosphere based on the number of subdivisions
 */
function getVertexAmount(subdivisions: number): number {
  return 60 * 4 ** subdivisions;
}

function createBaseIcosphere(smooth: boolean): VertexType[] {
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  const initialVertices: d.v4f[] = [
    // Top group
    d.vec4f(-1, goldenRatio, 0, 1),
    d.vec4f(1, goldenRatio, 0, 1),
    d.vec4f(-1, -goldenRatio, 0, 1),
    d.vec4f(1, -goldenRatio, 0, 1),

    // Middle group
    d.vec4f(0, -1, goldenRatio, 1),
    d.vec4f(0, 1, goldenRatio, 1),
    d.vec4f(0, -1, -goldenRatio, 1),
    d.vec4f(0, 1, -goldenRatio, 1),

    // Bottom group
    d.vec4f(goldenRatio, 0, -1, 1),
    d.vec4f(goldenRatio, 0, 1, 1),
    d.vec4f(-goldenRatio, 0, -1, 1),
    d.vec4f(-goldenRatio, 0, 1, 1),
  ].map((v) => {
    return d.vec4f(std.normalize(v.xyz), 1);
  });

  const faces: [number, number, number][] = [
    // 5 faces around vertex 0
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    // 5 adjacent faces
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    // 5 faces around vertex 3
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    // 5 adjacent faces
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const vertices: VertexType[] = [];

  for (const indices of faces) {
    const faceVertices = indices.map((i) => initialVertices[i]);

    if (smooth) {
      vertices.push(
        ...faceVertices.map((v) => Vertex({ position: v, normal: v })),
      );
    } else {
      const normal = getAverageNormal(
        faceVertices[0],
        faceVertices[1],
        faceVertices[2],
      );

      vertices.push(
        ...faceVertices.map((v) => Vertex({ position: v, normal })),
      );
    }
  }

  return vertices;
}

const generatorLayout = tgpu.bindGroupLayout({
  prevVertices: {
    storage: d.arrayOf(ComputeVertex),
    access: 'readonly',
  },
  nextVertices: {
    storage: d.arrayOf(ComputeVertex),
    access: 'mutable',
  },
  smoothFlag: { uniform: d.u32 },
});

const WORKGROUP_SIZE = 256;
const MAX_DISPATCH = 65535;

export class IcosphereGenerator {
  private cache = new Map<string, IcosphereBuffer>();
  private readonly pipeline: TgpuComputePipeline;
  private readonly smoothBuffer: TgpuBuffer<d.U32> & UniformFlag;

  constructor(
    private root: TgpuRoot,
    private maxBufferSize?: number,
  ) {
    this.smoothBuffer = this.root.createBuffer(d.u32).$usage('uniform');

    const computeFn = tgpu.computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [WORKGROUP_SIZE, 1, 1],
    })((input) => {
      const prevVertices = generatorLayout.$.prevVertices;
      const nextVertices = generatorLayout.$.nextVertices;
      const smoothFlag = generatorLayout.$.smoothFlag;

      const triangleCount = d.u32(prevVertices.length / 3);
      const triangleIndex = input.gid.x + input.gid.y * MAX_DISPATCH;
      if (triangleIndex >= triangleCount) {
        return;
      }

      const baseIndexPrev = triangleIndex * 3;

      const v1 = unpackVec2u(prevVertices[baseIndexPrev].position);
      const v2 = unpackVec2u(prevVertices[baseIndexPrev + 1].position);
      const v3 = unpackVec2u(prevVertices[baseIndexPrev + 2].position);

      const v12 = d.vec4f(std.normalize(calculateMidpoint(v1, v2).xyz), 1);
      const v23 = d.vec4f(std.normalize(calculateMidpoint(v2, v3).xyz), 1);
      const v31 = d.vec4f(std.normalize(calculateMidpoint(v3, v1).xyz), 1);

      const newVertices = d.arrayOf(d.vec4f, 12)([
        // Triangle A: [v1, v12, v31]
        v1,
        v12,
        v31,
        // Triangle B: [v2, v23, v12]
        v2,
        v23,
        v12,
        // Triangle C: [v3, v31, v23]
        v3,
        v31,
        v23,
        // Triangle D: [v12, v23, v31]
        v12,
        v23,
        v31,
      ]);

      const baseIndexNext = triangleIndex * 12;
      for (let i = d.u32(0); i < 12; i++) {
        const reprojectedVertex = newVertices[i];

        const triBase = i - (i % 3);
        let normal = d.vec4f(reprojectedVertex);
        if (smoothFlag === 0) {
          normal = getAverageNormal(
            newVertices[triBase],
            newVertices[triBase + 1],
            newVertices[triBase + 2],
          );
        }

        const outIndex = baseIndexNext + i;
        const nextVertex = nextVertices[outIndex];
        nextVertex.position = packVec2u(reprojectedVertex);
        nextVertex.normal = packVec2u(normal);
      }
    });

    this.pipeline = this.root.createComputePipeline({ compute: computeFn });
  }

  createIcosphere(subdivisions: number, smooth: boolean): IcosphereBuffer {
    if (this.maxBufferSize) {
      let safeSize = subdivisions;
      while (
        getVertexAmount(safeSize) * d.sizeOf(Vertex) > this.maxBufferSize
      ) {
        safeSize--;
      }
      if (safeSize < subdivisions) {
        console.warn(
          `Requested icosphere of size ${
            getVertexAmount(subdivisions) * d.sizeOf(Vertex)
          } exceeds max buffer size of ${this.maxBufferSize} - reducing subdivisions to ${safeSize}`,
        );
        return this.createIcosphere(safeSize, smooth);
      }
    }

    const key = `${subdivisions}-${smooth}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const buffer = this.subdivide(subdivisions, smooth);
    this.cache.set(key, buffer);
    return buffer;
  }

  private subdivide(
    wantedSubdivisions: number,
    smooth: boolean,
  ): IcosphereBuffer {
    if (wantedSubdivisions === 0) {
      const key = `${wantedSubdivisions}-${smooth}`;
      const cached = this.cache.get(key);
      if (cached) {
        return cached;
      }

      const initialVertices = this.root
        .createBuffer(
          d.disarrayOf(Vertex, getVertexAmount(0)),
          createBaseIcosphere(smooth),
        )
        .$usage('vertex')
        .$addFlags(GPUBufferUsage.STORAGE);
      this.cache.set(key, initialVertices);
      return initialVertices;
    }

    const previousKey = `${wantedSubdivisions - 1}-${smooth}`;
    let previousVertices = this.cache.get(previousKey);
    if (!previousVertices) {
      previousVertices = this.subdivide(wantedSubdivisions - 1, smooth);
    }

    const nextBuffer = this.root
      .createBuffer(d.disarrayOf(Vertex, getVertexAmount(wantedSubdivisions)))
      .$usage('vertex')
      .$addFlags(GPUBufferUsage.STORAGE);

    const currentComputeView = this.root
      .createBuffer(
        d.arrayOf(ComputeVertex, getVertexAmount(wantedSubdivisions - 1)),
        previousVertices.buffer,
      )
      .$usage('storage');
    const nextComputeView = this.root
      .createBuffer(
        d.arrayOf(ComputeVertex, getVertexAmount(wantedSubdivisions)),
        nextBuffer.buffer,
      )
      .$usage('storage');

    this.smoothBuffer.write(smooth ? 1 : 0);

    const bindGroup = this.root.createBindGroup(generatorLayout, {
      prevVertices: currentComputeView,
      nextVertices: nextComputeView,
      smoothFlag: this.smoothBuffer,
    });

    const triangleCount = getVertexAmount(wantedSubdivisions - 1) / 3;

    const totalWorkgroups = Math.ceil(triangleCount / WORKGROUP_SIZE);

    const xGroups = Math.min(MAX_DISPATCH, totalWorkgroups);
    const yGroups = Math.min(
      MAX_DISPATCH,
      Math.ceil(totalWorkgroups / MAX_DISPATCH),
    );

    this.pipeline
      .with(bindGroup)
      .dispatchWorkgroups(xGroups, yGroups, 1);

    return nextBuffer;
  }

  destroy(): void {
    for (const buffer of this.cache.values()) {
      buffer.destroy();
    }
    this.smoothBuffer.destroy();
    this.cache.clear();
  }
}
