import tgpu, {
  d,
  std,
  type IndirectFlag,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuRoot,
  type VertexFlag,
} from 'typegpu';
import { CHUNK_SIZE, INIT_CONFIG } from './params.ts';
import { cubeVertices, faces } from './cubeVertices.ts';
import type { Chunk } from './schemas.ts';
import { coordToIndex } from './chunkGenerator.ts';
import { prefixScan } from '@typegpu/concurrent-scan';

export const MAX_CHUNKS_AT_ONCE = Object.values(INIT_CONFIG.chunks)
  .map((v) => v[1] - v[0] + 1)
  .reduce((a, b) => a * b, 1);
const MAX_VERTICES_PER_CHUNK = 36 * CHUNK_SIZE ** 3;

export class Mesher {
  #root: TgpuRoot;
  freeIds: Set<number>;
  chunkToId: Map<Chunk, number>;
  vertexBuffer: TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag & VertexFlag;
  indirectBuffer: TgpuBuffer<d.WgslArray<d.Vec4u>> & IndirectFlag;

  constructor(root: TgpuRoot) {
    this.#root = root;
    this.freeIds = new Set(Array.from({ length: MAX_CHUNKS_AT_ONCE }, (_, i) => i));
    this.chunkToId = new Map();
    this.vertexBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4f, MAX_VERTICES_PER_CHUNK * MAX_CHUNKS_AT_ONCE))
      .$usage('vertex', 'storage');
    this.indirectBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4u, MAX_CHUNKS_AT_ONCE))
      .$usage('indirect');
  }

  recalculateMeshesFor(chunks: Chunk[]) {
    const chunkDataReadonly = this.#root.createReadonly(d.arrayOf(d.u32, CHUNK_SIZE ** 3));
    const trianglesCountMutable = this.#root.createMutable(d.arrayOf(d.f32, CHUNK_SIZE ** 3));
    const cubeOffsetsReadonly = this.#root.createReadonly(
      d.arrayOf(d.vec4f, 36),
      cubeVertices.map((v) => v.position),
    );
    const offsetUniform = this.#root.createUniform(d.u32);
    const chunkPosUniform = this.#root.createUniform(d.vec3i);
    const vertexMutable = this.vertexBuffer.as('mutable');

    // TODO: use concurrent scan to know how many vertices will each block contribute
    const countTrianglesPipeline = this.#root.createComputePipeline({
      compute: tgpu.computeFn({
        workgroupSize: [8, 8, 4],
        in: { gid: d.builtin.globalInvocationId },
      })((input) => {
        'use gpu';
        const gid = d.vec3i(input.gid);
        const localIndex = coordToIndex(d.vec3i(gid));
        const blockData = chunkDataReadonly.$[localIndex];
        let triangles = 0;

        const offsets = [
          d.vec3i(-1, 0, 0),
          d.vec3i(1, 0, 0),
          d.vec3i(0, -1, 0),
          d.vec3i(0, 1, 0),
          d.vec3i(0, 0, -1),
          d.vec3i(0, 0, 1),
        ];

        for (const offset of tgpu.unroll(offsets)) {
          const neighborPos = gid + offset;
          if (
            std.any(std.lt(neighborPos, d.vec3i())) ||
            std.any(std.gt(neighborPos, d.vec3i(CHUNK_SIZE - 1)))
          ) {
            triangles += 2;
          } else {
            const neighborIndex = coordToIndex(neighborPos);
            const neighborData = chunkDataReadonly.$[neighborIndex];
            if ((blockData === 0) !== (neighborData === 0)) {
              triangles += 2;
            }
          }
        }
        trianglesCountMutable.$[coordToIndex(d.vec3i(gid))] = triangles;
      }),
    });

    const generateTrianglesPipeline = this.#root.createComputePipeline({
      compute: tgpu.computeFn({
        workgroupSize: [8, 8, 4],
        in: { gid: d.builtin.globalInvocationId },
      })((input) => {
        'use gpu';
        const gid = input.gid;
        const localIndex = coordToIndex(d.vec3i(gid));
        const vertexOffset = trianglesCountMutable.$[localIndex] * 3 + offsetUniform.$;
        const blockData = chunkDataReadonly.$[localIndex];
        const blockPosition = chunkPosUniform.$ * CHUNK_SIZE + d.vec3i(gid);

        let vertices = 0;
        // TODO: I'll clean this up, I just want to go home for today
        // TODO: also refactor this entire file
        if (blockData !== 0) {
          // bottom
          const bottomPositionRelative = d.vec3i(gid) + d.vec3i(0, -1, 0);
          if (
            std.any(std.lt(bottomPositionRelative, d.vec3i())) ||
            chunkDataReadonly.$[coordToIndex(bottomPositionRelative)] === 0
          ) {
            vertexMutable.$[vertexOffset + vertices] =
              faces.bottom[0].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.bottom[1].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.bottom[2].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.bottom[3].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.bottom[4].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.bottom[5].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
          }

          // top
          const topPositionRelative = d.vec3i(gid) + d.vec3i(0, 1, 0);
          if (
            std.any(std.gt(topPositionRelative, d.vec3i(CHUNK_SIZE - 1))) ||
            chunkDataReadonly.$[coordToIndex(topPositionRelative)] === 0
          ) {
            vertexMutable.$[vertexOffset + vertices] =
              faces.top[0].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.top[1].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.top[2].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.top[3].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.top[4].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.top[5].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
          }

          // left
          const leftPositionRelative = d.vec3i(gid) + d.vec3i(-1, 0, 0);
          if (
            std.any(std.lt(leftPositionRelative, d.vec3i())) ||
            chunkDataReadonly.$[coordToIndex(leftPositionRelative)] === 0
          ) {
            vertexMutable.$[vertexOffset + vertices] =
              faces.left[0].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.left[1].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.left[2].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.left[3].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.left[4].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.left[5].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
          }

          // right
          const rightPositionRelative = d.vec3i(gid) + d.vec3i(1, 0, 0);
          if (
            std.any(std.gt(rightPositionRelative, d.vec3i(CHUNK_SIZE - 1))) ||
            chunkDataReadonly.$[coordToIndex(rightPositionRelative)] === 0
          ) {
            vertexMutable.$[vertexOffset + vertices] =
              faces.right[0].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.right[1].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.right[2].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.right[3].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.right[4].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.right[5].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
          }

          // front
          const frontPositionRelative = d.vec3i(gid) + d.vec3i(0, 0, 1);
          if (
            std.any(std.gt(frontPositionRelative, d.vec3i(CHUNK_SIZE - 1))) ||
            chunkDataReadonly.$[coordToIndex(frontPositionRelative)] === 0
          ) {
            vertexMutable.$[vertexOffset + vertices] =
              faces.front[0].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.front[1].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.front[2].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.front[3].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.front[4].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.front[5].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
          }

          // back
          const backPositionRelative = d.vec3i(gid) + d.vec3i(0, 0, -1);
          if (
            std.any(std.lt(backPositionRelative, d.vec3i())) ||
            chunkDataReadonly.$[coordToIndex(backPositionRelative)] === 0
          ) {
            vertexMutable.$[vertexOffset + vertices] =
              faces.back[0].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.back[1].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.back[2].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.back[3].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.back[4].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
            vertexMutable.$[vertexOffset + vertices] =
              faces.back[5].position + d.vec4f(d.vec3f(blockPosition), 1);
            vertices++;
          }
        }
      }),
    });

    // TODO: run this in one dispatch
    for (const chunk of chunks) {
      const id = this.getChunkId(chunk);
      chunkDataReadonly.write(chunk.blocks);
      offsetUniform.write(id * 36 * CHUNK_SIZE ** 3);
      chunkPosUniform.write(chunk.chunkIndex);

      countTrianglesPipeline.dispatchWorkgroups(CHUNK_SIZE / 8, CHUNK_SIZE / 8, CHUNK_SIZE / 4);
      prefixScan(this.#root, {
        inputBuffer: trianglesCountMutable.buffer,
        identityElement: 0,
        operation: std.add,
      });
      generateTrianglesPipeline.dispatchWorkgroups(CHUNK_SIZE / 8, CHUNK_SIZE / 8, CHUNK_SIZE / 4);

      // TODO: write actual triangle count (unwrap and copy from concurrent scan result)
      this.indirectBuffer.writePartial([
        { idx: id, value: d.vec4u(36 * CHUNK_SIZE ** 3, 1, id * 36 * CHUNK_SIZE ** 3, 0) },
      ]);
    }
  }

  // TODO: delegate this to another class
  getChunkId(chunk: Chunk): number {
    if (this.chunkToId.has(chunk)) {
      return this.chunkToId.get(chunk) as number;
    }
    const [freeId] = this.freeIds;
    if (freeId === undefined) {
      throw new Error('Tried to mesh more chunks than possible.');
    }
    this.freeIds.delete(freeId);
    this.chunkToId.set(chunk, freeId);
    return freeId;
  }

  getResources() {
    return {
      vertexBuffer: this.vertexBuffer,
      indirectBuffer: this.indirectBuffer,
    };
  }
}
