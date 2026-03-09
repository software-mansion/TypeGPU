import tgpu, {
  d,
  type IndirectFlag,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuRoot,
  type VertexFlag,
} from 'typegpu';
import { CHUNK_SIZE, INIT_CONFIG } from './params.ts';
import { cubeVertices } from './cubeVertices.ts';
import type { Chunk } from './schemas.ts';
import { coordToIndex } from './chunkGenerator.ts';

export const MAX_CHUNKS_AT_ONCE = Object.values(INIT_CONFIG.chunks)
  .map((v) => v[1] - v[0] + 1)
  .reduce((a, b) => a * b, 1);
const MAX_VERTICES_PER_CHUNK = 3 * 36 * CHUNK_SIZE ** 3;

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
    console.log(MAX_CHUNKS_AT_ONCE);
    console.log(MAX_VERTICES_PER_CHUNK);
    console.log(MAX_CHUNKS_AT_ONCE * MAX_VERTICES_PER_CHUNK * 16);
    this.indirectBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4u, MAX_CHUNKS_AT_ONCE))
      .$usage('indirect');
  }

  recalculateMeshesFor(chunks: Chunk[]) {
    const chunkDataReadonly = this.#root.createReadonly(d.arrayOf(d.u32, CHUNK_SIZE ** 3));
    const cubeOffsetsReadonly = this.#root.createReadonly(
      d.arrayOf(d.vec4f, 36),
      cubeVertices.map((v) => v.position),
    );
    const offsetUniform = this.#root.createUniform(d.u32);
    const chunkPosUniform = this.#root.createUniform(d.vec3i);
    const vertexMutable = this.vertexBuffer.as('mutable');

    // TODO: use concurrent scan to know how many vertices will each block contribute
    const computePipeline = this.#root.createComputePipeline({
      compute: tgpu.computeFn({
        workgroupSize: [8, 8, 4],
        in: { gid: d.builtin.globalInvocationId },
      })((input) => {
        'use gpu';
        const gid = input.gid;
        const localIndex = coordToIndex(d.vec3i(gid));
        const blockData = chunkDataReadonly.$[localIndex];

        if (blockData !== 0) {
          const vertexStart = (offsetUniform.$ + localIndex) * 36;
          const blockWorldPos = d.vec3f(d.vec3i(gid.xyz) + chunkPosUniform.$ * CHUNK_SIZE);

          for (let i = 0; i < 36; i += 1) {
            // TODO: check for unnecessary polygons
            const cv = cubeOffsetsReadonly.$[i];
            vertexMutable.$[vertexStart + i] = d.vec4f(blockWorldPos + cv.xyz, 1);
          }
        }
      }),
    });

    // TODO: run this in one dispatch
    for (const chunk of chunks) {
      const id = this.getChunkId(chunk);
      chunkDataReadonly.write(chunk.blocks);
      offsetUniform.write(id * CHUNK_SIZE ** 3);
      chunkPosUniform.write(chunk.chunkIndex);
      computePipeline.dispatchWorkgroups(CHUNK_SIZE / 8, CHUNK_SIZE / 8, CHUNK_SIZE / 4);
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
