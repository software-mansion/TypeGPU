import tgpu, {
  type TgpuBuffer,
  type TgpuComputePipeline,
  type TgpuRoot,
  type UniformFlag,
  type VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { ComputeVertex, Vertex } from './dataTypes';
import * as helpers from './helpers';

type IcosphereBuffer = TgpuBuffer<d.Disarray<typeof Vertex>> & VertexFlag;
type VertexType = d.Infer<typeof Vertex>;

/**
 * Safely normalizes a vector to prevent numerical instability
 */
function normalizeSafely(v: d.v4f): d.v4f {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (length < 1e-8) {
    return d.vec4f(0, 0, 1, 1);
  }
  return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
}

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
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
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

  for (const [i1, i2, i3] of faces) {
    const v1 = initialVertices[i1];
    const v2 = initialVertices[i2];
    const v3 = initialVertices[i3];

    if (smooth) {
      vertices.push(Vertex({ position: v1, normal: v1 }));
      vertices.push(Vertex({ position: v2, normal: v2 }));
      vertices.push(Vertex({ position: v3, normal: v3 }));
    } else {
      const edge1 = d.vec4f(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z, 0);
      const edge2 = d.vec4f(v3.x - v1.x, v3.y - v1.y, v3.z - v1.z, 0);
      const faceNormal = normalizeSafely(
        d.vec4f(
          edge1.y * edge2.z - edge1.z * edge2.y,
          edge1.z * edge2.x - edge1.x * edge2.z,
          edge1.x * edge2.y - edge1.y * edge2.x,
          0,
        ),
      );
      vertices.push(Vertex({ position: v1, normal: faceNormal }));
      vertices.push(Vertex({ position: v2, normal: faceNormal }));
      vertices.push(Vertex({ position: v3, normal: faceNormal }));
    }
  }

  return vertices;
}

const generatorLayout = tgpu.bindGroupLayout({
  prevVertices: {
    storage: (n: number) => d.arrayOf(ComputeVertex, n),
    access: 'readonly',
  },
  nextVertices: {
    storage: (n: number) => d.arrayOf(ComputeVertex, n),
    access: 'mutable',
  },
  smoothFlag: { uniform: d.u32 },
});

export class IcosphereGenerator {
  private cache = new Map<string, IcosphereBuffer>();
  private readonly pipeline: TgpuComputePipeline;
  private readonly smoothBuffer: TgpuBuffer<d.U32> & UniformFlag;

  constructor(
    private root: TgpuRoot,
    private maxBufferSize?: number,
  ) {
    const { prevVertices, nextVertices, smoothFlag } = generatorLayout.bound;

    this.smoothBuffer = this.root.createBuffer(d.u32).$usage('uniform');

    const computeFn = tgpu['~unstable'].computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [64, 1, 1],
    })((input) => {
      const triangleCount = std.arrayLength(prevVertices.value) / d.u32(3);
      const triangleIndex = input.gid.x + input.gid.y * d.u32(65535);
      if (triangleIndex >= triangleCount) {
        return;
      }

      const baseIndexPrev = triangleIndex * d.u32(3);

      const v1 = helpers.unpackVec2u(
        prevVertices.value[baseIndexPrev].position,
      );
      const v2 = helpers.unpackVec2u(
        prevVertices.value[baseIndexPrev + d.u32(1)].position,
      );
      const v3 = helpers.unpackVec2u(
        prevVertices.value[baseIndexPrev + d.u32(2)].position,
      );

      const v12 = helpers.normalizeSafely(helpers.calculateMidpoint(v1, v2));
      const v23 = helpers.normalizeSafely(helpers.calculateMidpoint(v2, v3));
      const v31 = helpers.normalizeSafely(helpers.calculateMidpoint(v3, v1));

      const newVertices = [
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
      ];

      const baseIndexNext = triangleIndex * d.u32(12);
      for (let i = d.u32(0); i < 12; i++) {
        const reprojectedVertex = newVertices[i];

        const triBase = i - (i % d.u32(3));
        const normal = helpers.getNormal(
          newVertices[triBase],
          newVertices[triBase + d.u32(1)],
          newVertices[triBase + d.u32(2)],
          smoothFlag.value,
          reprojectedVertex,
        );

        const outIndex = baseIndexNext + i;
        const nextVertex = nextVertices.value[outIndex];

        nextVertex.position = helpers.packVec2u(reprojectedVertex);
        nextVertex.normal = helpers.packVec2u(normal);

        nextVertices.value[outIndex] = nextVertex;
      }
    });

    this.pipeline = this.root['~unstable']
      .withCompute(computeFn)
      .createPipeline();
  }

  createIcosphere(subdivisions: number, smooth: boolean): IcosphereBuffer {
    if (this.maxBufferSize) {
      let safeSize = subdivisions;
      while (
        getVertexAmount(safeSize) * d.sizeOf(Vertex) >
        this.maxBufferSize
      ) {
        safeSize--;
      }
      if (safeSize < subdivisions) {
        console.warn(
          `Requested icosphere of size ${getVertexAmount(subdivisions) * d.sizeOf(Vertex)} exceeds max buffer size of ${this.maxBufferSize} - reducing subdivisions to ${safeSize}`,
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
    const xGroups = Math.min(triangleCount, 65535);
    const yGroups = Math.ceil(triangleCount / 65535);

    this.pipeline
      .with(generatorLayout, bindGroup)
      .dispatchWorkgroups(xGroups, yGroups, 1);

    this.root['~unstable'].flush();

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
